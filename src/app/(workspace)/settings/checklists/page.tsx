import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistRules } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { forbidden } from "next/navigation";
import { references } from "@/server/workspace";
import { affectedClaimCount } from "@/server/mutations";
import { resolveRules } from "@/domain/checklist";
import { PageTitle, EmptyState } from "@/components/workspace/primitives";
import { RuleEditor } from "@/components/workspace/rule-editor";
import { FilterForm } from "@/components/workspace/filter-form";
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
  const payer =
    ref.payers.find((p) => p.id === payerId)?.name ?? "All insurers and TPAs";
  const procedure =
    ref.procedures.find((p) => p.id === procedureId)?.name ?? "All procedures";
  const unused = ref.types.filter(
    (type) => !resolved.some((rule) => rule.documentTypeId === type.id),
  );
  return (
    <>
      <PageTitle
        title="Checklist rules"
        description="Choose which documents are needed for each insurer or TPA, procedure and stage. The stage is the step of the claim: pre-auth, enhancement or discharge."
      />
      <FilterForm>
        <label className="field">
          Insurer or TPA
          <select className="control" name="payer" defaultValue={payerId ?? ""}>
            <option value="">All insurers and TPAs</option>
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
      </FilterForm>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              {payer} · {procedure}
            </h2>
            <p className="muted text-xs mt-1">
              Checklist in use for{" "}
              {params.stage === "PREAUTH"
                ? "pre-auth"
                : params.stage === "DISCHARGE"
                  ? "discharge"
                  : "enhancement"}{" "}
              · The most specific rule is used
            </p>
          </div>
          <span className="pill neutral">
            Changes affect {affected} open {affected === 1 ? "claim" : "claims"}
          </span>
        </div>
        <div className="px-5 py-3 text-xs muted border-b space-y-1">
          <p>
            When more than one rule fits a claim, the most specific rule is
            used. From most to least specific: the insurer or TPA with the
            procedure, the insurer or TPA alone, the procedure alone, then the
            hospital-wide rule.
          </p>
          <p>
            If you change a row that comes from a wider rule, ClaimDesk saves a
            new rule just for the choices above. The wider rule stays as it is.
            Documents marked Waived are not needed.
          </p>
        </div>
        {resolved.length ? (
          <div className="table-wrap">
            <table className="data-table rule-table">
              <thead>
                <tr>
                  {[
                    "Document",
                    "Requirement",
                    "Oldest allowed (hours)",
                    "Rule applies to",
                    "Note",
                    "Save or remove",
                  ].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resolved
                  .sort((a, b) =>
                    (
                      ref.types.find((t) => t.id === a.documentTypeId)?.label ??
                      ""
                    ).localeCompare(
                      ref.types.find((t) => t.id === b.documentTypeId)?.label ??
                        "",
                    ),
                  )
                  .map((rule) => (
                    <RuleEditor
                      key={`${rule.id}:${rule.requirement}:${rule.maxAgeHours}:${rule.note}`}
                      rule={rule}
                      types={ref.types}
                      payerId={payerId}
                      procedureId={procedureId}
                      stage={params.stage}
                      affected={affected}
                      sourceLabel={
                        rule.source === "PAYER_PROCEDURE"
                          ? `${payer} and ${procedure}`
                          : rule.source === "PAYER"
                            ? `${payer}, every procedure`
                            : rule.source === "PROCEDURE"
                              ? `${procedure}, every insurer and TPA`
                              : "Hospital-wide"
                      }
                    />
                  ))}
                {unused.length > 0 && (
                  <RuleEditor
                    key={`${payerId}:${procedureId}:${params.stage}:${unused.map((type) => type.id).join()}`}
                    types={unused}
                    payerId={payerId}
                    procedureId={procedureId}
                    stage={params.stage}
                    affected={affected}
                  />
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No documents are required at this stage yet"
            description="Add a document below. The pre-auth details check still applies."
          />
        )}
        {!resolved.length && unused.length > 0 && (
          <div className="table-wrap">
            <table className="data-table rule-table">
              <tbody>
                <RuleEditor
                  types={unused}
                  payerId={payerId}
                  procedureId={procedureId}
                  stage={params.stage}
                  affected={affected}
                />
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
