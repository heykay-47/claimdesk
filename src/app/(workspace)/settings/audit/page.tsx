import Link from "next/link";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { forbidden } from "next/navigation";
import { formatIST } from "@/domain/format";
import { PageTitle, EmptyState } from "@/components/workspace/primitives";
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if ((await requireUser()).role !== "HEAD") forbidden();
  const params = z
    .object({
      action: z.string().max(100).optional().catch(undefined),
      actor: z.uuid().optional().catch(undefined),
      page: z.coerce.number().int().min(1).max(100000).catch(1),
    })
    .parse(await searchParams);
  const where = and(
    ...(params.action ? [eq(auditLogs.action, params.action)] : []),
    ...(params.actor ? [eq(auditLogs.actorId, params.actor)] : []),
  );
  const pageSize = 25;
  const [rows, [total], actions, actors] = await Promise.all([
    db()
      .select({ log: auditLogs, actor: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.at), desc(auditLogs.id))
      .limit(pageSize)
      .offset((params.page - 1) * pageSize),
    db().select({ count: count() }).from(auditLogs).where(where),
    db()
      .selectDistinct({ action: auditLogs.action })
      .from(auditLogs)
      .orderBy(asc(auditLogs.action)),
    db()
      .select({ id: users.id, name: users.name })
      .from(users)
      .orderBy(asc(users.name)),
  ]);
  const pages = Math.max(1, Math.ceil(total.count / pageSize));
  const pageUrl = (page: number) =>
    `/settings/audit?${new URLSearchParams({ ...(params.action ? { action: params.action } : {}), ...(params.actor ? { actor: params.actor } : {}), page: String(page) })}`;
  return (
    <>
      <PageTitle
        title="Audit log"
        description="An append-only record of access, decisions and changes."
      />
      <form action="/settings/audit" className="filter-bar">
        <select
          className="control"
          aria-label="Filter audit action"
          name="action"
          defaultValue={params.action ?? ""}
        >
          <option value="">All actions</option>
          {actions.map(({ action }) => (
            <option key={action}>{action}</option>
          ))}
        </select>
        <select
          className="control"
          aria-label="Filter audit actor"
          name="actor"
          defaultValue={params.actor ?? ""}
        >
          <option value="">All people</option>
          {actors.map((actor) => (
            <option value={actor.id} key={actor.id}>
              {actor.name}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Apply
        </button>
        {(params.action || params.actor) && (
          <Link className="btn ghost" href="/settings/audit">
            Clear
          </Link>
        )}
      </form>
      <div className="panel table-wrap">
        {rows.length ? (
          <table className="data-table">
            <thead>
              <tr>
                {["Time (IST)", "Person", "Action", "Record", "Details"].map(
                  (h) => (
                    <th key={h}>{h}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ log, actor }) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap mono text-xs">
                    {formatIST(log.at)}
                  </td>
                  <td>{actor ?? "Unauthenticated"}</td>
                  <td className="text-xs">
                    {log.action.replaceAll("_", " ").toLowerCase()}
                  </td>
                  <td>
                    <span>{log.entityType.replaceAll("_", " ")}</span>
                    <span className="sub mono" title={log.entityId ?? ""}>
                      {log.entityId?.slice(0, 8)}
                    </span>
                  </td>
                  <td>
                    {Object.keys(log.detail).length > 0 ? (
                      <details>
                        <summary className="text-link">View detail</summary>
                        <pre className="text-xs whitespace-pre-wrap break-all max-w-72 mt-2">
                          {JSON.stringify(log.detail, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="muted">No extra detail</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title="No matching activity"
            description="Choose a different action or person to see the audit trail."
          />
        )}
        <div className="table-footer flex items-center justify-between">
          <span>
            {total.count} records · Page {params.page} of {pages}
          </span>
          <div className="button-row">
            {params.page > 1 && (
              <Link className="btn small" href={pageUrl(params.page - 1)}>
                Previous
              </Link>
            )}
            {params.page < pages && (
              <Link className="btn small" href={pageUrl(params.page + 1)}>
                Next
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
