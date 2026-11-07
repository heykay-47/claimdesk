import { describe, expect, it } from "vitest";
import { buildInsights } from "../src/domain/insights";
const now = new Date("2026-11-09T08:00:00Z");
const base = {
  id: "one",
  code: "CLM-ONE",
  patientName: "Fictional Patient",
  admittedAt: new Date("2026-11-09T06:00:00Z"),
  deductionAmountPaise: null,
  deductionReason: null,
};

describe("honest recorded desk insights", () => {
  it("measures pending waits from the latest marked-sent event, not admission", () => {
    const result = buildInsights(
      [
        { ...base, status: "PREAUTH_SUBMITTED" },
        { ...base, id: "query", status: "QUERY" },
      ],
      [
        {
          claimId: "one",
          toStatus: "PREAUTH_SUBMITTED",
          at: new Date("2026-11-09T06:30:00Z"),
        },
        {
          claimId: "one",
          toStatus: "PREAUTH_SUBMITTED",
          at: new Date("2026-11-09T07:30:00Z"),
        },
      ],
      [],
      now,
    );
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0]).toMatchObject({
      preparationMinutes: 30,
      timing: { elapsedMinutes: 30, windowMinutes: 60, exceeded: false },
    });
  });
  it("does not invent a submission time or treat missing metrics as zero", () => {
    const result = buildInsights(
      [{ ...base, status: "FINAL_BILL_SUBMITTED" }],
      [],
      [],
      now,
    );
    expect(result.pending[0]).toMatchObject({
      sentAt: null,
      preparationMinutes: null,
      timing: null,
    });
    expect(result.queries.sameDayPercent).toBeNull();
    expect(result.deductions).toEqual([]);
  });
  it("uses IST days for same-day answers and excludes open queries from the denominator", () => {
    const result = buildInsights(
      [],
      [],
      [
        {
          status: "ANSWERED",
          receivedAt: new Date("2026-11-08T20:00:00Z"),
          answeredAt: new Date("2026-11-09T00:30:00Z"),
          dueAt: now,
        },
        {
          status: "OPEN",
          receivedAt: new Date("2026-11-08T00:00:00Z"),
          answeredAt: null,
          dueAt: new Date("2026-11-09T07:00:00Z"),
        },
        { status: "ANSWERED", receivedAt: now, answeredAt: null, dueAt: now },
      ],
      now,
    );
    expect(result.queries).toMatchObject({
      answered: 1,
      sameDay: 1,
      sameDayPercent: 100,
      overdueNow: 1,
      open: 1,
      missingAnswerTimes: 1,
    });
  });
  it("totals recorded settled deductions exactly and excludes missing captures", () => {
    const result = buildInsights(
      [
        {
          ...base,
          status: "SETTLED",
          deductionAmountPaise: BigInt(10025),
          deductionReason: "CO_PAY",
        },
        {
          ...base,
          id: "two",
          status: "SETTLED",
          deductionAmountPaise: BigInt(20050),
          deductionReason: "CO_PAY",
        },
        { ...base, id: "three", status: "SETTLED" },
        {
          ...base,
          id: "open",
          status: "APPROVED",
          deductionAmountPaise: BigInt(50000),
          deductionReason: "OTHER",
        },
      ],
      [],
      [],
      now,
    );
    expect(result.deductions).toEqual([
      { reason: "CO_PAY", count: 2, amountPaise: BigInt(30075) },
    ]);
    expect(result).toMatchObject({
      settledCount: 3,
      deductionCount: 2,
      deductionTotalPaise: BigInt(30075),
    });
  });
});
