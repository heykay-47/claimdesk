import { describe, expect, it } from "vitest";
import {
  evaluateChecklist,
  resolveRules,
  type Rule,
  type ChecklistDocument,
} from "../src/domain/checklist";
import { PREAUTH_FIELDS } from "../src/domain/preauth-fields";
import {
  canTransition,
  nextActions,
  STAGE_FOR_STATUS,
} from "../src/domain/claim-status";
import {
  deadlineState,
  elapsedWindow,
  queryDueAt,
} from "../src/domain/deadline";
import { formatIST, formatMoney, rupeesToPaise } from "../src/domain/format";

const now = new Date("2026-11-07T10:00:00Z");
const context = {
  payerId: "payer",
  procedureId: "procedure",
  stage: "PREAUTH" as const,
};
const rule: Rule = {
  id: "default",
  payerId: null,
  procedureId: null,
  stage: "PREAUTH",
  documentTypeId: "platelets",
  requirement: "REQUIRED",
  maxAgeHours: null,
  note: "Default",
};
const fields = PREAUTH_FIELDS.filter((field) => field.required).map(
  (field) => ({
    fieldKey: field.key,
    status: "CONFIRMED" as const,
    value: "Reviewed",
  }),
);
const doc: ChecklistDocument = {
  id: "doc",
  documentTypeId: "platelets",
  documentTypeKey: "PLATELET_COUNT",
  status: "CONFIRMED",
  documentDate: null,
  uploadedAt: now,
};
const evaluate = (rules: Rule[], docs: ChecklistDocument[]) =>
  evaluateChecklist(resolveRules(rules, context), docs, now, {
    stage: "PREAUTH",
    fields,
  });

describe("checklist rule precedence", () => {
  const tiers: Rule[] = [
    rule,
    { ...rule, id: "procedure", procedureId: "procedure", maxAgeHours: 48 },
    { ...rule, id: "payer", payerId: "payer", maxAgeHours: 36 },
    {
      ...rule,
      id: "both",
      payerId: "payer",
      procedureId: "procedure",
      maxAgeHours: 24,
    },
  ];
  it.each([
    [1, "default", "DEFAULT"],
    [2, "procedure", "PROCEDURE"],
    [3, "payer", "PAYER"],
    [4, "both", "PAYER_PROCEDURE"],
  ] as const)("resolves %i applicable tiers", (length, id, source) => {
    expect(
      resolveRules(tiers.slice(0, length).reverse(), context)[0],
    ).toMatchObject({ id, source });
  });
  it("ignores unrelated payers, procedures and stages", () => {
    expect(
      resolveRules(
        [
          rule,
          { ...rule, payerId: "other" },
          { ...rule, procedureId: "other" },
          { ...rule, stage: "DISCHARGE" },
        ],
        context,
      ),
    ).toHaveLength(1);
  });
  it("waives a default entirely and does not inherit its max age", () => {
    const waived = {
      ...rule,
      payerId: "payer",
      requirement: "WAIVED" as const,
    };
    expect(evaluate([{ ...rule, maxAgeHours: 24 }, waived], []).ready).toBe(
      true,
    );
    expect(evaluate([rule, waived], []).slots).toEqual([]);
    expect(
      resolveRules(
        [
          { ...rule, maxAgeHours: 24 },
          { ...rule, payerId: "payer" },
        ],
        context,
      )[0].maxAgeHours,
    ).toBeNull();
  });
});
describe("checklist readiness", () => {
  it("marks the CLM-3385 older platelet report stale", () => {
    const result = evaluate(
      [{ ...rule, maxAgeHours: 24 }],
      [{ ...doc, documentDate: "2026-11-05" }],
    );
    expect(result.slots[0].state).toBe("STALE");
    expect(result.blockers).toEqual([
      { kind: "DOCUMENT", documentTypeId: "platelets", state: "STALE" },
    ]);
    expect(result.ready).toBe(false);
  });
  it("uses uploaded time when report date is absent and accepts the exact age boundary", () => {
    const aged = {
      ...doc,
      uploadedAt: new Date(now.getTime() - 24 * 3_600_000),
    };
    expect(evaluate([{ ...rule, maxAgeHours: 24 }], [aged]).ready).toBe(true);
    expect(
      evaluate(
        [{ ...rule, maxAgeHours: 24 }],
        [{ ...aged, uploadedAt: new Date(aged.uploadedAt.getTime() - 1) }],
      ).slots[0].state,
    ).toBe("STALE");
  });
  it("a fresh confirmed replacement satisfies a stale report", () => {
    expect(
      evaluate(
        [{ ...rule, maxAgeHours: 24 }],
        [
          { ...doc, documentDate: "2026-11-05" },
          { ...doc, id: "replacement" },
        ],
      ).ready,
    ).toBe(true);
  });
  it("AI sorted documents are unverified, even with a type", () => {
    expect(
      evaluate([rule], [{ ...doc, status: "NEEDS_REVIEW" }]),
    ).toMatchObject({ ready: false, slots: [{ state: "UNVERIFIED" }] });
  });
  it.each(["NEEDS_REVIEW", "PROCESSING", "FAILED"] as const)(
    "unsorted %s uploads block",
    (status) => {
      const result = evaluate(
        [rule],
        [doc, { ...doc, id: "unsorted", documentTypeId: null, status }],
      );
      expect(result.unsorted).toHaveLength(1);
      expect(result.blockers).toContainEqual({
        kind: "UNSORTED",
        documentId: "unsorted",
      });
      expect(result.ready).toBe(false);
    },
  );
  it("OTHER still needing review blocks but a manually confirmed OTHER does not", () => {
    expect(
      evaluate(
        [rule],
        [
          doc,
          {
            ...doc,
            id: "other",
            documentTypeId: "other",
            documentTypeKey: "OTHER",
            status: "NEEDS_REVIEW",
          },
        ],
      ).ready,
    ).toBe(false);
    expect(
      evaluate(
        [rule],
        [
          doc,
          {
            ...doc,
            id: "other",
            documentTypeId: "other",
            documentTypeKey: "OTHER",
          },
        ],
      ).ready,
    ).toBe(true);
  });
  it("failed typed documents never satisfy their slot", () => {
    expect(
      evaluate([rule], [{ ...doc, status: "FAILED" }]).slots[0].state,
    ).toBe("MISSING");
  });
  it("required pre-auth fields need nonempty human confirmed values", () => {
    const result = evaluateChecklist(
      resolveRules([rule], context),
      [doc],
      now,
      {
        stage: "PREAUTH",
        fields: fields.map((field) =>
          field.fieldKey === "patient_name"
            ? { ...field, status: "PENDING" }
            : field,
        ),
      },
    );
    expect(result.blockers).toEqual([
      { kind: "FIELD", fieldKey: "patient_name", label: "Patient name" },
    ]);
    expect(
      evaluateChecklist([], [], now, { stage: "PREAUTH", fields: [] }).ready,
    ).toBe(false);
    expect(
      evaluateChecklist([], [], now, { stage: "DISCHARGE", fields: [] }).ready,
    ).toBe(true);
  });
  it("missing optional documents do not block progress", () => {
    expect(evaluate([{ ...rule, requirement: "OPTIONAL" }], [])).toMatchObject({
      ready: true,
      counts: { MISSING: 1, required: 0 },
    });
  });
});
describe("lifecycle gates", () => {
  it("rejects illegal transitions and has no terminal-state actions", () => {
    expect(canTransition("PREAUTH_DRAFT", "record_settlement")).toBe(false);
    expect(nextActions("SETTLED")).toEqual([]);
    expect(nextActions("REJECTED")).toEqual([]);
  });
  it.each([
    ["PREAUTH_DRAFT", "submit_preauth", "PREAUTH"],
    ["ENHANCEMENT", "submit_enhancement", "ENHANCEMENT"],
    ["APPROVED", "submit_final_bill", "DISCHARGE"],
  ] as const)("gates %s %s on %s readiness", (status, action, stage) => {
    expect(canTransition(status, action)).toBe(false);
    expect(
      canTransition(status, action, {
        readiness: { [stage]: true },
      }),
    ).toBe(true);
  });
  it("requires all queries answered and does not assume an absent query count means zero", () => {
    expect(canTransition("QUERY", "answer_query")).toBe(false);
    expect(canTransition("QUERY", "answer_query", { openQueryCount: 1 })).toBe(
      false,
    );
    expect(canTransition("QUERY", "answer_query", { openQueryCount: 0 })).toBe(
      true,
    );
    expect(STAGE_FOR_STATUS.APPROVED).toBe("DISCHARGE");
  });
});
describe("deadlines and display", () => {
  it("uses the AI deadline over payer hours", () => {
    expect(queryDueAt(now, 24, "2026-11-08T08:00:00+05:30").toISOString()).toBe(
      "2026-11-08T02:30:00.000Z",
    );
    expect(queryDueAt(now, 24).toISOString()).toBe("2026-11-08T10:00:00.000Z");
  });
  it.each([
    [14_400_001, "ON_TRACK"],
    [14_400_000, "DUE_SOON"],
    [0, "DUE_SOON"],
    [-1, "OVERDUE"],
  ] as const)("classifies %i milliseconds remaining", (delta, state) => {
    expect(deadlineState(new Date(now.getTime() + delta), now)).toBe(state);
  });
  it("answered queries are not overdue and elapsed SLA boundary is inclusive", () => {
    expect(deadlineState(new Date(0), now, "ANSWERED")).toBe("ANSWERED");
    expect(
      elapsedWindow(now, new Date(now.getTime() + 3_600_000), 60).exceeded,
    ).toBe(false);
    expect(
      elapsedWindow(now, new Date(now.getTime() + 3_600_001), 60).exceeded,
    ).toBe(true);
  });
  it("keeps money exact beyond JavaScript number precision", () => {
    expect(rupeesToPaise("85000.09")).toBe(BigInt("8500009"));
    expect(formatMoney(BigInt("8500009"))).toBe("₹85,000.09");
    expect(formatMoney(BigInt("1234567890123456789"))).toBe(
      "₹12,34,56,78,90,12,34,567.89",
    );
    expect(() => rupeesToPaise("1.001")).toThrow();
    expect(formatIST(now)).toContain("3:30");
  });
});
