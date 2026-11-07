import Link from "next/link";
import { z } from "zod";
import { Check, CircleAlert, ChevronLeft, ArrowUpRight } from "lucide-react";
import { claimFile } from "@/server/workspace";
import { formatIST, formatMoney } from "@/domain/format";
import { elapsedMinutes } from "@/domain/deadline";
import { STAGE_FOR_STATUS } from "@/domain/claim-status";
import { StatusPill } from "@/components/workspace/primitives";
import { Countdown } from "@/components/workspace/countdown";
import { ChecklistBoard } from "@/components/workspace/checklist-board";
import { UploadZone } from "@/components/workspace/upload-zone";
import { TransitionControls } from "@/components/workspace/transition-controls";
import { pendingRequiredFields } from "@/domain/preauth-fields";
import { blockerText } from "@/domain/checklist-labels";
import { PacketDownload } from "@/components/workspace/packet-download";
import { DEDUCTION_LABELS } from "@/domain/settlement";
export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const stage = z
    .enum(["PREAUTH", "ENHANCEMENT", "DISCHARGE"])
    .optional()
    .catch(undefined)
    .parse((await searchParams).stage);
  const file = await claimFile(code, stage);
  const { claim, currentChecklist: checklist } = file;
  const firstGap = checklist.blockers[0];
  const reason = firstGap ? blockerText(firstGap, file.ref.types) : "";
  const open = file.queries.filter((q) => q.status === "OPEN");
  const milestones = [
    { label: "Pre-auth", status: "PREAUTH_SUBMITTED" },
    { label: "Query", status: "QUERY" },
    { label: "Approved", status: "APPROVED" },
    { label: "Final bill", status: "FINAL_BILL_SUBMITTED" },
    { label: "Settled", status: "SETTLED" },
  ];
  const currentMilestone = [...file.events]
    .reverse()
    .find((event) =>
      milestones.some((milestone) => milestone.status === event.toStatus),
    )?.toStatus;
  const stageIndex = Math.max(
    0,
    milestones.findIndex((m) => m.status === currentMilestone),
  );
  const preauth = file.events.find((e) => e.toStatus === "PREAUTH_SUBMITTED");
  const final = file.events.find((e) => e.toStatus === "FINAL_BILL_SUBMITTED");
  const settled = file.events.find((e) => e.toStatus === "SETTLED");
  const pending = pendingRequiredFields(file.fields).length;
  return (
    <>
      <Link href="/claims" className="back-link">
        <ChevronLeft size={14} />
        Claims
      </Link>
      <header className="claim-heading">
        <div className="claim-title-row">
          <div>
            <p className="claim-code mono">{claim.code}</p>
            <div className="claim-title-status">
              <h1 className="claim-patient">{claim.patientName}</h1>
              <StatusPill status={claim.status} />
            </div>
            <p className="claim-meta">
              <span>
                {file.payer.name} ·{" "}
                {file.payer.kind === "TPA" ? "TPA" : "Insurer"}
              </span>
              <span aria-hidden="true">/</span>
              <span>{file.procedure.name}</span>
            </p>
          </div>
        </div>
        <div className="claim-summary">
          <p
            className={`readiness ${checklist.ready ? "success-text" : "danger-text"}`}
          >
            {checklist.ready ? (
              <Check size={17} />
            ) : (
              <CircleAlert size={17} className="shrink-0 mt-0.5" />
            )}
            {checklist.ready ? "Ready to submit" : `Blocked: ${reason}`}
          </p>
          {open[0] && (
            <div className="text-xs">
              <span className="muted mr-2">Next reply due</span>
              <Countdown dueAt={open[0].dueAt} />
            </div>
          )}
        </div>
      </header>
      <div
        className="timeline"
        role="group"
        aria-label="Claim milestones, all times in IST"
      >
        {milestones.map((milestone, index) => {
          const event = file.events.find(
            (e) => e.toStatus === milestone.status,
          );
          return (
            <div
              key={milestone.status}
              className={`milestone ${event ? "done" : ""} ${index === stageIndex ? "current" : ""}`}
            >
              <div className="milestone-dot" />
              <strong>{milestone.label}</strong>
              {event ? (
                <time dateTime={event.at.toISOString()}>
                  <span className="block whitespace-nowrap">
                    {formatIST(event.at, {
                      dateStyle: "medium",
                      timeStyle: undefined,
                    })}
                  </span>
                  <span className="block whitespace-nowrap">
                    {formatIST(event.at, {
                      dateStyle: undefined,
                      timeStyle: "short",
                    })}{" "}
                    IST
                  </span>
                </time>
              ) : (
                <span className="muted">Not yet</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="claim-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Document checklist</h2>
                <p className="muted text-xs mt-1">
                  {file.checklist.counts.requiredSatisfied} of{" "}
                  {file.checklist.counts.required} required documents in order
                </p>
              </div>
              <nav className="stage-tabs" aria-label="Checklist stage">
                {(["PREAUTH", "ENHANCEMENT", "DISCHARGE"] as const).map((s) => (
                  <Link
                    key={s}
                    href={`/claims/${code}?stage=${s}`}
                    aria-current={s === file.stage ? "page" : undefined}
                  >
                    {s === "PREAUTH"
                      ? "Pre-auth"
                      : s === "DISCHARGE"
                        ? "Discharge"
                        : "Enhancement"}
                  </Link>
                ))}
              </nav>
            </div>
            {file.stage !== STAGE_FOR_STATUS[claim.status] && (
              <p className="panel-body text-xs warning-text border-b">
                Previewing the {file.stage.toLowerCase()} checklist. Claim
                status is unchanged.
              </p>
            )}
            <ChecklistBoard file={file} />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Pre-auth field review</h2>
                <p className="muted text-xs mt-1">
                  Every extracted value stays a suggestion until reviewed.
                </p>
              </div>
              <span className={`pill ${pending ? "warning" : "success"}`}>
                {pending
                  ? `${pending} required fields pending`
                  : "All required fields confirmed"}
              </span>
            </div>
            <div className="panel-body">
              <Link className="btn" href={`/claims/${code}/preauth`}>
                Review pre-auth fields
                <ArrowUpRight size={14} />
              </Link>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Upload documents</h2>
              <span className="muted text-xs">Private storage</span>
            </div>
            <div className="panel-body">
              <UploadZone claimId={claim.id} />
            </div>
          </section>
          <details className="panel">
            <summary className="panel-body font-medium text-sm">
              Activity history · {file.events.length} events
            </summary>
            <ol className="px-5 pb-5 space-y-4">
              {file.events.map((event) => (
                <li key={event.id} className="text-xs">
                  <strong className="font-medium">
                    {event.toStatus.replaceAll("_", " ").toLowerCase()}
                  </strong>
                  <span className="muted block mt-1">
                    {formatIST(event.at)} IST · {event.actor}
                  </span>
                  {event.note && <p className="mt-1">{event.note}</p>}
                </li>
              ))}
            </ol>
          </details>
        </div>
        <aside className="stack">
          <section className="panel claim-actions">
            <div className="panel-heading">
              <h2>Next action</h2>
            </div>
            <div className="panel-body">
              {["SETTLED", "REJECTED"].includes(claim.status) ? (
                <p className="muted text-xs">
                  This claim is closed. Documents and history remain available.
                </p>
              ) : (
                <TransitionControls file={file} />
              )}
              <div className="mt-5 pt-4 border-t">
                <PacketDownload
                  code={claim.code}
                  blockers={checklist.blockers.length}
                  stage={STAGE_FOR_STATUS[claim.status]}
                />
              </div>
            </div>
          </section>
          {open.length > 0 && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Open queries</h2>
                <span className="pill danger">{open.length}</span>
              </div>
              {open.map((q) => (
                <Link
                  key={q.id}
                  href={`/queries/${q.id}`}
                  className="query-compact"
                >
                  <strong>{q.subject}</strong>
                  <Countdown dueAt={q.dueAt} />
                </Link>
              ))}
            </section>
          )}
          <section className="panel">
            <div className="panel-heading">
              <h2>Admission details</h2>
            </div>
            <div className="panel-body">
              <dl className="details-list">
                {[
                  [
                    "Patient",
                    `${claim.patientAge} years · ${claim.patientGender}`,
                  ],
                  ["UHID", claim.uhid],
                  ["Policy", claim.policyNumber],
                  ["Doctor", claim.treatingDoctor],
                  ["Admitted", `${formatIST(claim.admittedAt)} IST`],
                  ["Estimate", formatMoney(claim.estimatedAmountPaise)],
                  ...(claim.approvedAmountPaise !== null
                    ? [["Approved", formatMoney(claim.approvedAmountPaise)]]
                    : []),
                  ...(claim.settledAmountPaise !== null
                    ? [["Settled", formatMoney(claim.settledAmountPaise)]]
                    : []),
                  ...(claim.deductionAmountPaise !== null &&
                  claim.deductionReason
                    ? [
                        [
                          "Deduction",
                          `${formatMoney(claim.deductionAmountPaise)} · ${DEDUCTION_LABELS[claim.deductionReason]}`,
                        ],
                      ]
                    : []),
                  ["Assigned to", file.assignee],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd
                      className={
                        label === "Estimate" || label === "Approved"
                          ? "mono"
                          : ""
                      }
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Hospital-side timing</h2>
            </div>
            <div className="panel-body text-xs space-y-5">
              <div>
                <p className="font-medium">Admission → pre-auth sent</p>
                <p className="mono mt-1 muted">
                  {Math.round(
                    elapsedMinutes(claim.admittedAt, preauth?.at ?? new Date()),
                  )}{" "}
                  min
                </p>
                <p className="muted mt-1">
                  {preauth
                    ? "Recorded hospital turnaround"
                    : "Hospital preparation in progress"}
                </p>
              </div>
              <div>
                <p className="font-medium">Final bill sent → settlement</p>
                <p className="mono muted mt-1">
                  {final
                    ? `${Math.round(elapsedMinutes(final.at, settled?.at ?? new Date()))} min`
                    : "Not started"}
                </p>
              </div>
              {file.queries.map((query) => (
                <div key={query.id}>
                  <p className="font-medium">Query → reply</p>
                  <p
                    className={`mono mt-1 ${query.status === "OPEN" && query.dueAt < new Date() ? "danger-text" : "muted"}`}
                  >
                    {Math.round(
                      elapsedMinutes(
                        query.receivedAt,
                        query.answeredAt ?? new Date(),
                      ),
                    )}{" "}
                    min /{" "}
                    {Math.round(elapsedMinutes(query.receivedAt, query.dueAt))}{" "}
                    min
                  </p>
                </div>
              ))}
              <p className="muted">
                IRDAI reference windows are 60 min for pre-auth and 180 min for
                discharge decisions. Hospital preparation and settlement are
                shown separately; these are not insurer-compliance
                determinations.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
