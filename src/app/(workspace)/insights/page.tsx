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
        description="Recorded desk activity, decision waits and settlement deductions."
      />
      <p className="muted text-xs mb-5">
        All recorded claims · Updated {formatIST(data.generatedAt)} IST
      </p>
      <section className="panel mb-6">
        <div className="panel-heading">
          <div>
            <h2>Pending payer decisions</h2>
            <p className="muted text-xs mt-1">
              Elapsed since the desk marked the request sent.
            </p>
          </div>
          <span className="pill neutral">{data.pending.length} pending</span>
        </div>
        <div className="px-5 py-4 text-xs muted border-b leading-6">
          IRDAI reference windows are 60 min for pre-auth and 180 min for
          discharge decisions. These desk-recorded clocks do not confirm payer
          receipt or complete documentation. They are not insurer-compliance
          findings. Claims awaiting a query reply are excluded.
        </div>
        {data.pending.length ? (
          <div className="table-wrap">
            <table className="data-table insights-table">
              <thead>
                <tr>
                  {[
                    "Claim",
                    "Decision",
                    "Hospital preparation",
                    "Wait since marked sent",
                    "Reference",
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
                          : "Submission time not recorded"}
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
                              ? "Beyond the reference window"
                              : "Within the reference window"}
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
            title="No pending decisions"
            description="Pre-auth and final-bill requests marked sent will appear here."
          />
        )}
      </section>
      <div className="insights-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Query response performance</h2>
            <Link className="text-link text-xs" href="/queries">
              Open inbox
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
              were received and answered on the same IST calendar day. Open
              queries are not in this denominator.
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
                {data.queries.missingAnswerTimes} answered queries have no
                response timestamp and are excluded from same-day performance.
              </p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Deductions by reason</h2>
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
                No deductions recorded yet. Capture an amount and reason when
                recording settlement.
              </p>
            )}
            <p className="muted text-xs mt-5 leading-6">
              {data.deductionCount} of {data.settledCount} settled claims have a
              recorded deduction. Unrecorded amounts are excluded, not treated
              as zero. Bars are relative to the largest recorded reason total.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
