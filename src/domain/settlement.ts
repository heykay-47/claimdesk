export const DEDUCTION_REASONS = [
  "MISSING_DOCUMENT",
  "NON_PAYABLE_ITEM",
  "ROOM_RENT_CAP",
  "CO_PAY",
  "OTHER",
] as const;
export type DeductionReason = (typeof DEDUCTION_REASONS)[number];
export const DEDUCTION_LABELS: Record<DeductionReason, string> = {
  MISSING_DOCUMENT: "Missing document",
  NON_PAYABLE_ITEM: "Item not covered by the policy",
  ROOM_RENT_CAP: "Room rent above the policy limit",
  CO_PAY: "Co-pay (patient's share)",
  OTHER: "Other",
};
export type SettlementDeduction = { amount: bigint; reason: DeductionReason };
