import "server-only";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export type AuditEntry = Pick<
  typeof auditLogs.$inferInsert,
  "actorId" | "action" | "entityType" | "entityId" | "detail" | "ip"
>;
export async function audit(entry: AuditEntry) {
  await db().insert(auditLogs).values(entry);
}
