import type { Stage } from "./checklist";
export type ClaimStatus = "PREAUTH_DRAFT" | "PREAUTH_SUBMITTED" | "QUERY" | "APPROVED" | "ENHANCEMENT" | "FINAL_BILL_SUBMITTED" | "SETTLED" | "REJECTED";
export const TRANSITIONS = [
  { from: "PREAUTH_DRAFT", action: "submit_preauth", to: "PREAUTH_SUBMITTED", gate: "PREAUTH" },
  { from: "PREAUTH_SUBMITTED", action: "record_query", to: "QUERY", gate: null },
  { from: "QUERY", action: "answer_query", to: "PREAUTH_SUBMITTED", gate: "QUERIES_ANSWERED" },
  { from: "PREAUTH_SUBMITTED", action: "record_approval", to: "APPROVED", gate: null },
  { from: "APPROVED", action: "request_enhancement", to: "ENHANCEMENT", gate: null },
  { from: "ENHANCEMENT", action: "submit_enhancement", to: "APPROVED", gate: "ENHANCEMENT" },
  { from: "APPROVED", action: "submit_final_bill", to: "FINAL_BILL_SUBMITTED", gate: "DISCHARGE" },
  { from: "FINAL_BILL_SUBMITTED", action: "record_settlement", to: "SETTLED", gate: null },
  { from: "PREAUTH_SUBMITTED", action: "record_rejection", to: "REJECTED", gate: null },
  { from: "QUERY", action: "record_rejection", to: "REJECTED", gate: null },
  { from: "FINAL_BILL_SUBMITTED", action: "record_rejection", to: "REJECTED", gate: null },
] as const;
export type ClaimAction = (typeof TRANSITIONS)[number]["action"];
export const STAGE_FOR_STATUS: Record<ClaimStatus, Stage> = {
  PREAUTH_DRAFT: "PREAUTH", PREAUTH_SUBMITTED: "PREAUTH", QUERY: "PREAUTH", APPROVED: "DISCHARGE", ENHANCEMENT: "ENHANCEMENT", FINAL_BILL_SUBMITTED: "DISCHARGE", SETTLED: "DISCHARGE", REJECTED: "PREAUTH",
};
export function nextActions(status: ClaimStatus) { return TRANSITIONS.filter((transition) => transition.from === status); }
export type GateContext = { readiness?: Partial<Record<Stage, boolean>>; openQueryCount?: number };
export function canTransition(status: ClaimStatus, action: ClaimAction, context: GateContext = {}): boolean {
  const transition = nextActions(status).find((candidate) => candidate.action === action);
  if (!transition) return false;
  if (transition.gate === null) return true;
  if (transition.gate === "QUERIES_ANSWERED") return context.openQueryCount === 0;
  return context.readiness?.[transition.gate] === true;
}
