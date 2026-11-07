import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistRules } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { forbidden } from "next/navigation";
import { references } from "@/server/workspace";
import { affectedClaimCount } from "@/server/mutations";
import { resolveRules } from "@/domain/checklist";
import {
  PageTitle,
  EmptyState,
  ruleSource,
} from "@/components/workspace/primitives";
import { RuleEditor } from "@/components/workspace/rule-editor";
export default async function ChecklistSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if ((await requireUser()).role !== "HEAD") forbidden();
  const params = z
    .object({
      payer: z.uuid().optional().catch(undefined),
      procedure: z.uuid().optional().catch(undefined),
      stage: z.enum(["PREAUTH", "ENHANCEMENT", "DISCHARGE"]).catch("PREAUTH"),
    })
    .parse(await searchParams);
  const payerId = params.payer ?? null;
  const procedureId = params.procedure ?? null;
  const [ref, rules, affected] = await Promise.all([
    references(),
    db()
      .select()
      .from(checklistRules)
      .where(eq(checklistRules.stage, params.stage)),
    affectedClaimCount(payerId, procedureId),
  ]);
  const resolved = resolveRules(rules, {
    payerId: payerId ?? "ALL",
    procedureId: procedureId ?? "ALL",
    stage: params.stage,
  });
  const payer = ref.payers.find((p) => p.id === payerId)?.name ?? "All payers";
  const procedure =
    ref.procedures.find((p) => p.id === procedureId)?.name ?? "All procedures";
  const unused = ref.types.filter(
    (type) => !resolved.some((rule) => rule.documentTypeId === type.id),
  );
  return (
    <>
      <PageTitle
        title="Checklist rules"
        description="Define what the desk needs before a claim can move forward."
      />
      <form action="/settings/checklists" className="filter-bar">
        <label className="field">
          Payer
          <select className="control" name="payer" defaultValue={payerId ?? ""}>
            <option value="">All payers</option>
            {ref.payers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Procedure
          <select
            className="control"
            name="procedure"
            defaultValue={procedureId ?? ""}
          >
            <option value="">All procedures</option>
            {ref.procedures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Stage
          <select className="control" name="stage" defaultValue={params.stage}>
            <option value="PREAUTH">Pre-auth</option>
            <option value="ENHANCEMENT">Enhancement</option>
            <option value="DISCHARGE">Discharge</option>
          </select>
        </label>
        <button className="btn self-end" type="submit">
          View rules
        </button>
      </form>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              {payer} · {procedure}
            </h2>
            <p className="muted text-xs mt-1">
              Effective {params.stage.toLowerCase()} checklist · Most-specific
              rule wins
            </p>
          </div>
          <span className="pill neutral">Affects {affected} open claims</span>
        </div>
        <p className="px-5 py-4 text-xs muted border-b">
          Priority is payer + procedure, then payer, then procedure, then
          defaults. A waiver removes the document. Editing an inherited rule
          creates an override for the scope selected above.
        </p>
        {resolved.length ? (
          <div>
            {resolved
              .sort((a, b) =>
                (
                  ref.types.find((t) => t.id === a.documentTypeId)?.label ?? ""
                ).localeCompare(
                  ref.types.find((t) => t.id === b.documentTypeId)?.label ?? "",
                ),
              )
              .map((rule) => (
                <div
                  className="gap-slot"
                  key={`${rule.id}:${rule.requirement}:${rule.maxAgeHours}:${rule.note}`}
                >
                  <div className="slot-heading">
                    <div>
                      <h3>
                        {
                          ref.types.find(
                            (type) => type.id === rule.documentTypeId,
                          )?.label
                        }
                      </h3>
                      <p className="slot-meta">
                        {ruleSource(rule, payer, procedure)}
                        {rule.maxAgeHours
                          ? ` · Within ${rule.maxAgeHours}h`
                          : ""}
                      </p>
                      {rule.note && <p className="slot-note">{rule.note}</p>}
                    </div>
                    <span
                      className={`pill ${rule.requirement === "REQUIRED" ? "neutral" : rule.requirement === "WAIVED" ? "warning" : "neutral"}`}
                    >
                      {rule.requirement.toLowerCase()}
                    </span>
                  </div>
                  <div className="mt-3">
                    <RuleEditor
                      rule={rule}
                      types={ref.types}
                      payerId={payerId}
                      procedureId={procedureId}
                      stage={params.stage}
                      affected={affected}
                    />
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <EmptyState
            title="No requirements for this stage"
            description="Add a default or scoped requirement. Required pre-auth field reviews still apply."
          />
        )}
        {unused.length > 0 && (
          <div className="panel-body border-t">
            <RuleEditor
              key={`${payerId}:${procedureId}:${params.stage}`}
              types={unused}
              payerId={payerId}
              procedureId={procedureId}
              stage={params.stage}
              affected={affected}
            />
          </div>
        )}
      </section>
    </>
  );
}
