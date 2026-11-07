import Link from "next/link";
import { Plus } from "lucide-react";
import { z } from "zod";
import { queryInbox } from "@/server/workspace";
import { formatIST } from "@/domain/format";
import { PageTitle, EmptyState } from "@/components/workspace/primitives";
import { Countdown } from "@/components/workspace/countdown";
export default async function QueriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const status = z
    .enum(["OPEN", "ANSWERED"])
    .catch("OPEN")
    .parse((await searchParams).status);
  const rows = await queryInbox(status);
  return (
    <>
      <PageTitle
        title="Query inbox"
        description="Know what the payer needs, and when they need it."
      >
        <Link className="btn primary" href="/queries/new">
          <Plus size={15} />
          Log incoming query
        </Link>
      </PageTitle>
      <div className="flex justify-between items-center mb-5">
        <nav className="stage-tabs" aria-label="Query state">
          <Link
            href="/queries"
            aria-current={status === "OPEN" ? "page" : undefined}
          >
            Open
          </Link>
          <Link
            href="/queries?status=ANSWERED"
            aria-current={status === "ANSWERED" ? "page" : undefined}
          >
            Answered
          </Link>
        </nav>
        <span className="muted text-xs">
          {rows.length} {status.toLowerCase()} · Soonest due first
        </span>
      </div>
      <div className="panel table-wrap">
        {rows.length ? (
          <table className="data-table query-table">
            <thead>
              <tr>
                {[
                  "Query",
                  "Claim / patient",
                  "Payer",
                  "Received",
                  status === "OPEN" ? "Reply due" : "Reply recorded",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ query, code, patient, payer }) => (
                <tr key={query.id}>
                  <td>
                    <Link className="text-link" href={`/queries/${query.id}`}>
                      {query.subject}
                    </Link>
                    <span className="sub max-w-80 line-clamp-2">
                      {query.aiSummary?.summary ??
                        "Open to read the original email"}
                    </span>
                  </td>
                  <td>
                    <Link className="mono text-link" href={`/claims/${code}`}>
                      {code}
                    </Link>
                    <span className="sub">{patient}</span>
                  </td>
                  <td>{payer}</td>
                  <td className="muted whitespace-nowrap">
                    {formatIST(query.receivedAt)}
                  </td>
                  <td>
                    {status === "OPEN" ? (
                      <Countdown dueAt={query.dueAt} />
                    ) : (
                      <span className="muted whitespace-nowrap">
                        {query.answeredAt && formatIST(query.answeredAt)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title={
              status === "OPEN" ? "No open queries" : "No recorded replies yet"
            }
            description={
              status === "OPEN"
                ? "New payer requests will appear here when you log an incoming email."
                : "Replies recorded as sent will stay here for future reference."
            }
          />
        )}
      </div>
      <p className="muted text-xs mt-4">
        ClaimDesk records correspondence. Replies are sent separately through
        the payer’s channel.
      </p>
    </>
  );
}
