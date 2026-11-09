import Link from "next/link";
import { Check, CircleAlert, ArrowUpRight } from "lucide-react";
import { queryFile } from "@/server/workspace";
import { formatIST } from "@/domain/format";
import { PageTitle } from "@/components/workspace/primitives";
import { Countdown } from "@/components/workspace/countdown";
import { ReplyComposer } from "@/components/workspace/reply-composer";
import { ActionButton } from "@/components/workspace/action-form";
export default async function QueryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { query, file } = await queryFile((await params).id);
  const requested = query.aiSummary?.requested_document_keys ?? [];
  const requestedSlots = requested.map((key) => {
    const type = file.ref.types.find((t) => t.key === key);
    return {
      key,
      type,
      slot: file.checklist.slots.find(
        (s) => s.rule.documentTypeId === type?.id,
      ),
    };
  });
  const confirmed = file.files.filter((doc) => doc.status === "CONFIRMED");
  const repeatsAsk = query.aiSummary?.asks.some(
    (ask) =>
      ask.trim().toLowerCase() ===
      query.aiSummary?.summary.trim().toLowerCase(),
  );
  return (
    <>
      <PageTitle
        title={query.subject}
        description={`${file.claim.code} · ${file.claim.patientName} · ${file.payer.name}`}
        back={{ href: "/queries", label: "Query inbox" }}
      >
        <Countdown dueAt={query.dueAt} answered={query.status === "ANSWERED"} />
      </PageTitle>
      <div className="query-detail-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-heading">
              <h2>What the insurer or TPA is asking for</h2>
              <span className="pill neutral">
                AI summary. Check it against the email.
              </span>
            </div>
            <div className="panel-body">
              {query.aiSummary ? (
                <>
                  {!repeatsAsk && (
                    <p className="text-sm leading-7">
                      {query.aiSummary.summary}
                    </p>
                  )}
                  <ul className="ask-list">
                    {query.aiSummary.asks.map((ask, index) => (
                      <li key={index}>
                        <label className="flex items-start gap-2">
                          <input
                            className="mt-1 shrink-0"
                            type="checkbox"
                            defaultChecked={query.status === "ANSWERED"}
                            disabled={query.status === "ANSWERED"}
                            aria-label={`Mark as read: ${ask}`}
                          />
                          <span>{ask}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {requestedSlots.length > 0 && (
                    <div className="mt-6 pt-4 border-t">
                      <h3 className="mb-3">Requested documents</h3>
                      <ul className="space-y-3">
                        {requestedSlots.map(({ key, type, slot }) => (
                          <li
                            key={key}
                            className="flex items-start justify-between gap-3 text-xs"
                          >
                            <span className="flex gap-2 items-center">
                              {slot?.state === "SATISFIED" ? (
                                <Check size={14} className="success-text" />
                              ) : (
                                <CircleAlert
                                  size={14}
                                  className="danger-text"
                                />
                              )}
                              {type?.label ?? key}
                            </span>
                            <Link
                              className={`text-link ${slot?.state === "SATISFIED" ? "success-text" : ""}`}
                              href={`/claims/${file.claim.code}${slot?.state === "SATISFIED" ? "" : "#upload"}`}
                            >
                              {slot?.state === "SATISFIED"
                                ? "Confirmed"
                                : slot?.state === "UNVERIFIED"
                                  ? "Confirm it in the claim"
                                  : slot?.state === "STALE"
                                    ? "Upload a newer report"
                                    : "Upload document"}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="warning-text text-sm">
                    {query.aiError ??
                      "No AI summary is available. Read the full email below."}
                  </p>
                  <div className="mt-4">
                    <ActionButton
                      action="retryQuerySummary"
                      values={{ queryId: query.id }}
                      success="AI summary request finished"
                    >
                      Retry AI summary
                    </ActionButton>
                  </div>
                </>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Original email</h2>
              <span className="muted text-xs">Saved exactly as received</span>
            </div>
            <div className="panel-body">
              <dl className="text-xs grid gap-2 mb-6">
                <div>
                  <dt className="muted inline mr-2">From</dt>
                  <dd className="inline break-all">{query.fromAddress}</dd>
                </div>
                <div>
                  <dt className="muted inline mr-2">Received</dt>
                  <dd className="inline">{formatIST(query.receivedAt)} IST</dd>
                </div>
                <div>
                  <dt className="muted inline mr-2">Reply due</dt>
                  <dd className="inline">{formatIST(query.dueAt)} IST</dd>
                </div>
                <div>
                  <dt className="muted inline mr-2">Subject</dt>
                  <dd className="inline">{query.subject}</dd>
                </div>
              </dl>
              <pre className="email-body">{query.body}</pre>
            </div>
          </section>
        </div>
        <div className="stack">
          <Link className="btn" href={`/claims/${file.claim.code}`}>
            Open claim file
            <ArrowUpRight size={14} />
          </Link>
          {query.status === "OPEN" ? (
            <ReplyComposer
              queryId={query.id}
              code={file.claim.code}
              patient={file.claim.patientName}
              subject={query.subject}
              documentNames={confirmed.map((d) => d.fileName)}
            />
          ) : (
            <section className="panel">
              <div className="panel-heading">
                <h2>Recorded reply</h2>
                <span className="pill success">Sent</span>
              </div>
              <div className="panel-body">
                <p className="muted text-xs mb-5">
                  Recorded {query.answeredAt && formatIST(query.answeredAt)}{" "}
                  IST. You sent this reply yourself, outside ClaimDesk.
                </p>
                <pre className="email-body">{query.replyBody}</pre>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
