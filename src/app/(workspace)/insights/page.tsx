import Link from "next/link";
import { loadInsights } from "@/server/insights";
import { PageTitle, EmptyState } from "@/components/workspace/primitives";
import { formatIST, formatMoney } from "@/domain/format";
import { DEDUCTION_LABELS } from "@/domain/settlement";

function duration(minutes: number) {
  const rounded = Math.floor(minutes);
  return rounded < 60
    ? `${rounded} min`
    : `${Math.floor(rounded / 60)}h ${rounded % 60}m`;
}
export default async function InsightsPage() {
  const data = await loadInsights();
  const maxDeduction = data.deductions[0]?.amountPaise ?? BigInt(1);
  return (
    <>
      <PageTitle
        title="Insights"
        description="How long insurer decisions take, how fast queries are answered, and how much insurers deducted."
      />
      <p className="muted text-xs mb-5">
        Covers all recorded claims · Updated {formatIST(data.generatedAt)} IST
      </p>
      <section className="panel mb-6">
        <div className="panel-heading">
          <div>
            <h2>Waiting for insurer decisions</h2>
            <p className="muted text-xs mt-1">
              Time since your desk marked the request as sent.
            </p>
          </div>
          <span className="pill neutral">{data.pending.length} waiting</span>
        </div>
        <div className="px-5 py-4 text-xs muted border-b leading-6">
          IRDAI, the insurance regulator, expects an answer within 60 minutes
          for a pre-auth request and 180 minutes for a discharge request. The
          clock here starts when your desk marked the request as sent. It does
          not prove the insurer or TPA received the request or had every
          document. It does not show whether they broke the rule. Claims
          waiting for your reply to a query are left out.
        </div>
        {data.pending.length ? (
          <div className="table-wrap">
            <table className="data-table insights-table">
              <thead>
                <tr>
                  {[
                    "Claim",
                    "Waiting for",
                    "Hospital time to prepare",
                    "Waiting so far",
                    "Expected within",
                  ].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.pending.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        href={`/claims/${row.code}`}
                        className="text-link mono"
                      >
                        {row.code}
                      </Link>
                      <span className="sub">{row.patientName}</span>
                    </td>
                    <td>
                      {row.stage === "PREAUTH" ? "Pre-auth" : "Discharge"}
                      <span className="sub">
                        {row.sentAt
                          ? `${formatIST(row.sentAt)} IST`
                          : "Time sent was not recorded"}
                      </span>
                    </td>
                    <td>
                      {row.preparationMinutes === null
                        ? "Not recorded"
                        : duration(row.preparationMinutes)}
                      <span className="sub">
                        Admission to first pre-auth sent
                      </span>
                    </td>
                    <td>
                      {row.timing ? (
                        <>
                          <span
                            className={
                              row.timing.exceeded ? "danger-text mono" : "mono"
                            }
                          >
                            {duration(row.timing.elapsedMinutes)}
                          </span>
                          <div
                            className={`insight-track ${row.timing.exceeded ? "exceeded" : ""}`}
                            aria-hidden="true"
                          >
                            <div
                              style={{
                                width: `${Math.min(100, (row.timing.elapsedMinutes / row.timing.windowMinutes) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="sub">
                            {row.timing.exceeded
                              ? "Past the expected time"
                              : "Within the expected time"}
                          </span>
                        </>
                      ) : (
                        "Not recorded"
                      )}
                    </td>
                    <td className="mono">
                      {row.stage === "PREAUTH" ? 60 : 180} min
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No decisions are pending"
            description="Pre-auth and final bill requests you mark as sent will appear here."
          />
        )}
      </section>
      <div className="insights-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>How fast queries are answered</h2>
            <Link className="text-link text-xs" href="/queries">
              Open query inbox
            </Link>
          </div>
          <div className="panel-body">
            <div className="insight-metric">
              <span>Answered on the same day</span>
              <strong className="mono">
                {data.queries.sameDayPercent === null
                  ? "Not available"
                  : `${data.queries.sameDayPercent}%`}
              </strong>
            </div>
            {data.queries.sameDayPercent !== null && (
              <div className="insight-track mt-3" aria-hidden="true">
                <div style={{ width: `${data.queries.sameDayPercent}%` }} />
              </div>
            )}
            <p className="muted text-xs mt-3 leading-6">
              {data.queries.sameDay} of {data.queries.answered} answered queries
              were answered on the same day they arrived (Indian time). Queries
              that are still open are not counted.
            </p>
            <div className="insight-metric mt-6 pt-5 border-t">
              <span>Overdue now</span>
              <Link
                href="/claims?view=overdue"
                className={`mono text-link ${data.queries.overdueNow ? "danger-text" : ""}`}
              >
                {data.queries.overdueNow} of {data.queries.open} open
              </Link>
            </div>
            {data.queries.missingAnswerTimes > 0 && (
              <p className="warning-text text-xs mt-3">
                {data.queries.missingAnswerTimes} answered queries have no reply
                time saved, so they are left out of the same-day figure.
              </p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Deductions by reason</h2>
              <p className="muted text-xs mt-1">
                Money the insurer or TPA did not pay when it settled a claim.
              </p>
            </div>
            <span className="mono">
              {formatMoney(data.deductionTotalPaise)}
            </span>
          </div>
          <div className="panel-body">
            {data.deductions.length ? (
              <div className="space-y-5">
                {data.deductions.map((group) => (
                  <div key={group.reason}>
                    <div className="insight-metric">
                      <span>{DEDUCTION_LABELS[group.reason]}</span>
                      <span className="mono">
                        {formatMoney(group.amountPaise)}
                      </span>
                    </div>
                    <div className="insight-track mt-2" aria-hidden="true">
                      <div
                        style={{
                          width: `${Number((group.amountPaise * BigInt(10000)) / maxDeduction) / 100}%`,
                        }}
                      />
                    </div>
                    <p className="muted text-xs mt-1">
                      {group.count} settled{" "}
                      {group.count === 1 ? "claim" : "claims"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted text-sm">
                No deductions recorded yet. When you record a settlement, you
                can also enter the amount deducted and the reason.
              </p>
            )}
            <p className="muted text-xs mt-5 leading-6">
              {data.deductionCount} of {data.settledCount} settled claims have a
              deduction on record. Claims with no deduction recorded are not
              counted as zero. Each bar is sized against the largest reason.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
