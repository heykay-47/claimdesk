import type { ClaimStatus } from "./claim-status";
import {
  deadlineState,
  elapsedMinutes,
  elapsedWindow,
  IRDAI_WINDOWS_MINUTES,
} from "./deadline";
import { DEDUCTION_REASONS, type DeductionReason } from "./settlement";

type InsightClaim = {
  id: string;
  code: string;
  patientName: string;
  status: ClaimStatus;
  admittedAt: Date;
  deductionAmountPaise: bigint | null;
  deductionReason: DeductionReason | null;
};
type InsightEvent = { claimId: string; toStatus: ClaimStatus; at: Date };
type InsightQuery = {
  status: "OPEN" | "ANSWERED";
  receivedAt: Date;
  dueAt: Date;
  answeredAt: Date | null;
};
const day = (date: Date) =>
  date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export function buildInsights(
  claims: readonly InsightClaim[],
  events: readonly InsightEvent[],
  queries: readonly InsightQuery[],
  now: Date,
) {
  const pending = claims
    .filter(
      (claim) =>
        claim.status === "PREAUTH_SUBMITTED" ||
        claim.status === "FINAL_BILL_SUBMITTED",
    )
    .map((claim) => {
      const sent =
        events
          .filter(
            (event) =>
              event.claimId === claim.id && event.toStatus === claim.status,
          )
          .sort((a, b) => b.at.getTime() - a.at.getTime())[0]?.at ?? null;
      const firstPreauth =
        events
          .filter(
            (event) =>
              event.claimId === claim.id &&
              event.toStatus === "PREAUTH_SUBMITTED",
          )
          .sort((a, b) => a.at.getTime() - b.at.getTime())[0]?.at ?? null;
      const stage =
        claim.status === "PREAUTH_SUBMITTED" ? "PREAUTH" : "DISCHARGE";
      return {
        id: claim.id,
        code: claim.code,
        patientName: claim.patientName,
        stage,
        sentAt: sent,
        preparationMinutes: firstPreauth
          ? elapsedMinutes(claim.admittedAt, firstPreauth)
          : null,
        timing: sent
          ? elapsedWindow(sent, now, IRDAI_WINDOWS_MINUTES[stage])
          : null,
      };
    })
    .sort(
      (a, b) =>
        (b.timing?.elapsedMinutes ?? -1) - (a.timing?.elapsedMinutes ?? -1),
    );
  const answered = queries.filter(
    (query) => query.status === "ANSWERED" && query.answeredAt,
  );
  const sameDay = answered.filter(
    (query) => day(query.receivedAt) === day(query.answeredAt!),
  ).length;
  const totals = new Map(
    DEDUCTION_REASONS.map((reason) => [
      reason,
      { reason, amountPaise: BigInt(0), count: 0 },
    ]),
  );
  const settled = claims.filter((claim) => claim.status === "SETTLED");
  for (const claim of settled)
    if (claim.deductionReason && claim.deductionAmountPaise !== null) {
      const group = totals.get(claim.deductionReason)!;
      group.amountPaise += claim.deductionAmountPaise;
      group.count++;
    }
  const deductions = [...totals.values()]
    .filter((group) => group.count)
    .sort((a, b) =>
      a.amountPaise > b.amountPaise
        ? -1
        : a.amountPaise < b.amountPaise
          ? 1
          : 0,
    );
  return {
    pending,
    queries: {
      answered: answered.length,
      sameDay,
      sameDayPercent: answered.length
        ? Math.round((sameDay / answered.length) * 100)
        : null,
      overdueNow: queries.filter(
        (query) => deadlineState(query.dueAt, now, query.status) === "OVERDUE",
      ).length,
      open: queries.filter((query) => query.status === "OPEN").length,
      missingAnswerTimes: queries.filter(
        (query) => query.status === "ANSWERED" && !query.answeredAt,
      ).length,
    },
    deductions,
    settledCount: settled.length,
    deductionCount: deductions.reduce((total, group) => total + group.count, 0),
    deductionTotalPaise: deductions.reduce(
      (total, group) => total + group.amountPaise,
      BigInt(0),
    ),
  };
}
