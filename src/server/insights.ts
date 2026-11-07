import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { claims, claimEvents, queries } from "@/db/schema";
import { buildInsights } from "@/domain/insights";
import { requireUser } from "./auth";

export async function loadInsights() {
  await requireUser();
  const [rows, events, inbox] = await Promise.all([
    db()
      .select({
        id: claims.id,
        code: claims.code,
        patientName: claims.patientName,
        status: claims.status,
        admittedAt: claims.admittedAt,
        deductionAmountPaise: claims.deductionAmountPaise,
        deductionReason: claims.deductionReason,
      })
      .from(claims),
    db()
      .select({
        claimId: claimEvents.claimId,
        toStatus: claimEvents.toStatus,
        at: claimEvents.at,
      })
      .from(claimEvents)
      .where(
        inArray(claimEvents.toStatus, [
          "PREAUTH_SUBMITTED",
          "FINAL_BILL_SUBMITTED",
        ]),
      ),
    db()
      .select({
        status: queries.status,
        receivedAt: queries.receivedAt,
        answeredAt: queries.answeredAt,
        dueAt: queries.dueAt,
      })
      .from(queries),
  ]);
  const now = new Date();
  return { ...buildInsights(rows, events, inbox, now), generatedAt: now };
}
