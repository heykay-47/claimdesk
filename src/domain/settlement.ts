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
  NON_PAYABLE_ITEM: "Non-payable item",
  ROOM_RENT_CAP: "Room rent cap",
  CO_PAY: "Co-pay",
  OTHER: "Other",
};
export type SettlementDeduction = { amount: bigint; reason: DeductionReason };
