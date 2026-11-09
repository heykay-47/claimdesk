import Link from "next/link";
import { Plus } from "lucide-react";
import { z } from "zod";
import { worklist, references } from "@/server/workspace";
import { claimStatus } from "@/db/schema";
import {
  PageTitle,
  StatusPill,
  STATUS_LABELS,
  EmptyState,
  readinessText,
} from "@/components/workspace/primitives";
import { Countdown } from "@/components/workspace/countdown";
import { ClaimRow } from "@/components/workspace/claim-row";
import { FilterForm } from "@/components/workspace/filter-form";
const filterSchema = z.object({
  q: z.string().max(200).catch(""),
  status: z.enum(claimStatus.enumValues).optional().catch(undefined),
  payer: z.uuid().optional().catch(undefined),
  gaps: z.enum(["1"]).optional().catch(undefined),
  overdue: z.enum(["1"]).optional().catch(undefined),
  view: z
    .enum(["preauth", "today", "overdue", "gaps"])
    .optional()
    .catch(undefined),
});
function istDay(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filters = filterSchema.parse({ q: "", ...raw });
  const [rows, ref] = await Promise.all([worklist(), references()]);
  const now = new Date();
  const active = rows.filter(
    (r) => !["SETTLED", "REJECTED"].includes(r.claim.status),
  );
  const overdue = (r: (typeof rows)[number]) =>
    r.queries.some((q) => q.status === "OPEN" && q.dueAt < now);
  const today = (r: (typeof rows)[number]) =>
    r.queries.some(
      (q) => q.status === "OPEN" && istDay(q.dueAt) === istDay(now),
    );
  const preauth = (r: (typeof rows)[number]) =>
    ["PREAUTH_DRAFT", "PREAUTH_SUBMITTED", "QUERY"].includes(r.claim.status);
  const search = filters.q.toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!search ||
        [r.claim.code, r.claim.patientName, r.claim.policyNumber].some((s) =>
          s.toLowerCase().includes(search),
        )) &&
      (!filters.status || r.claim.status === filters.status) &&
      (!filters.payer || r.payer.id === filters.payer) &&
      (!filters.gaps || (!r.checklist.ready && active.includes(r))) &&
      (!filters.overdue || overdue(r)) &&
      (!filters.view ||
        {
          preauth: preauth(r),
          today: today(r),
          overdue: overdue(r),
          gaps: !r.checklist.ready && active.includes(r),
        }[filters.view]),
  );
  const kpis = [
    {
      label: "Open pre-auths",
      value: active.filter(preauth).length,
      view: "preauth",
      tone: "",
    },
    {
      label: "Insurer queries due today",
      value: rows
        .flatMap((r) => r.queries)
        .filter((q) => q.status === "OPEN" && istDay(q.dueAt) === istDay(now))
        .length,
      view: "today",
      tone: "",
    },
    {
      label: "Overdue query replies",
      value: rows
        .flatMap((r) => r.queries)
        .filter((q) => q.status === "OPEN" && q.dueAt < now).length,
      view: "overdue",
      tone: "danger-text",
    },
    {
      label: "Claims not ready to submit",
      value: active.filter((r) => !r.checklist.ready).length,
      view: "gaps",
      tone: "",
    },
  ];
  return (
    <>
      <PageTitle title="Claims">
        <Link className="btn primary" href="/claims/new">
          <Plus size={15} />
          New claim
        </Link>
      </PageTitle>
      <div className="kpi-strip panel">
        {kpis.map((kpi) => (
          <Link
            className={`kpi ${filters.view === kpi.view ? "selected" : ""}`}
            aria-current={filters.view === kpi.view ? "page" : undefined}
            key={kpi.view}
            href={
              filters.view === kpi.view ? "/claims" : `/claims?view=${kpi.view}`
            }
          >
            <span className="label">
              {kpi.label}
              {filters.view === kpi.view && (
                <span className="kpi-active">Active</span>
              )}
            </span>
            <span className={`value ${kpi.tone}`}>{kpi.value}</span>
          </Link>
        ))}
      </div>
      <FilterForm>
        <input
          className="control search"
          aria-label="Search claims"
          name="q"
          type="search"
          placeholder="Search claim, patient or policy number"
          defaultValue={filters.q}
        />
        <select
          className="control"
          aria-label="Filter by status"
          name="status"
          defaultValue={filters.status ?? ""}
        >
          <option value="">All statuses</option>
          {claimStatus.enumValues.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <select
          className="control"
          aria-label="Filter by insurer or TPA"
          name="payer"
          defaultValue={filters.payer ?? ""}
        >
          <option value="">All insurers and TPAs</option>
          {ref.payers.map((payer) => (
            <option key={payer.id} value={payer.id}>
              {payer.name}
            </option>
          ))}
        </select>
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="gaps"
            value="1"
            defaultChecked={!!filters.gaps}
          />
          Not ready to submit
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="overdue"
            value="1"
            defaultChecked={!!filters.overdue}
          />
          Overdue query reply
        </label>
        {filters.view && (
          <input type="hidden" name="view" value={filters.view} />
        )}
        {Object.values(filters).some(Boolean) && (
          <Link href="/claims" className="btn ghost">
            Clear filters
          </Link>
        )}
      </FilterForm>
      <div className="panel table-wrap">
        {filtered.length ? (
          <table className="data-table">
            <thead>
              <tr>
                {[
                  "Claim",
                  "Patient",
                  "Insurer or TPA",
                  "Procedure",
                  "Status",
                  "Ready to submit?",
                  "Next reply due",
                  "Assigned to",
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <ClaimRow key={row.claim.id} code={row.claim.code}>
                  <td>
                    <Link
                      className="mono text-link"
                      href={`/claims/${row.claim.code}`}
                    >
                      {row.claim.code}
                    </Link>
                  </td>
                  <td>
                    <strong className="font-medium whitespace-nowrap">
                      {row.claim.patientName}
                    </strong>
                    <span className="sub">
                      {row.claim.patientAge} years · {row.claim.patientGender}
                    </span>
                  </td>
                  <td>
                    <span className="whitespace-nowrap">{row.payer.name}</span>
                    <span className="sub">
                      {row.payer.kind === "TPA" ? "TPA" : "Insurer"}
                    </span>
                  </td>
                  <td className="max-w-40">{row.procedure.name}</td>
                  <td>
                    <StatusPill status={row.claim.status} />
                  </td>
                  <td
                    className={
                      row.checklist.ready ? "success-text" : "danger-text"
                    }
                  >
                    {["SETTLED", "REJECTED"].includes(row.claim.status) ? (
                      <span className="muted">Closed</span>
                    ) : (
                      readinessText(row.checklist)
                    )}
                  </td>
                  <td>
                    {row.deadline ? (
                      <Countdown dueAt={row.deadline} />
                    ) : (
                      <span className="muted">No open query</span>
                    )}
                  </td>
                  <td>
                    <span className="whitespace-nowrap">
                      {row.assignee.split(" ")[0]}
                    </span>
                  </td>
                </ClaimRow>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title={
              rows.length
                ? "No claims match these filters"
                : "No claims yet"
            }
            description={
              rows.length
                ? "Try a different search, or clear the filters to see every claim."
                : "Create a claim to track its documents and the insurer or TPA's replies."
            }
          >
            <Link
              className="btn"
              href={rows.length ? "/claims" : "/claims/new"}
            >
              {rows.length ? "Clear filters" : "Create a claim"}
            </Link>
          </EmptyState>
        )}
        <div className="table-footer">
          {filtered.length} of {rows.length} claims · Times are in Indian
          Standard Time (IST)
        </div>
      </div>
    </>
  );
}
