export function queryDueAt(receivedAt: Date, replyHours: number, deadlineIso: string | null = null): Date {
  return deadlineIso ? new Date(deadlineIso) : new Date(receivedAt.getTime() + replyHours * 3_600_000);
}
export type DeadlineState = "ON_TRACK" | "DUE_SOON" | "OVERDUE" | "ANSWERED";
export function deadlineState(dueAt: Date, now: Date, status: "OPEN" | "ANSWERED" = "OPEN"): DeadlineState {
  if (status === "ANSWERED") return "ANSWERED";
  const remaining = dueAt.getTime() - now.getTime();
  return remaining < 0 ? "OVERDUE" : remaining <= 4 * 3_600_000 ? "DUE_SOON" : "ON_TRACK";
}
export const IRDAI_WINDOWS_MINUTES = { PREAUTH: 60, DISCHARGE: 180 } as const;
export function elapsedMinutes(start: Date, end: Date): number { return Math.max(0, (end.getTime() - start.getTime()) / 60_000); }
export function elapsedWindow(start: Date, end: Date, windowMinutes: number) {
  const elapsed = elapsedMinutes(start, end);
  return { elapsedMinutes: elapsed, windowMinutes, exceeded: elapsed > windowMinutes, remainingMinutes: Math.max(0, windowMinutes - elapsed) };
}
