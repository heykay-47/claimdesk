import { describe, expect, it } from "vitest";
import {
  comparePatientIdentity,
  hasIdentityMismatch,
  withIdentityChecks,
} from "../src/domain/identity";
import { normalizeGender } from "../src/domain/gender";
import {
  evaluateChecklist,
  resolveRules,
  type Rule,
} from "../src/domain/checklist";

const claim = {
  patientName: "Rajendra Pawar",
  policyNumber: "SYN-B-3381",
  uhid: "UHID-03381",
};
const evidence = (value: string, fieldKey = "patient_name") => [
  { fieldKey, value, sourceSnippet: `Patient: ${value}` },
];
describe("deterministic patient identity", () => {
  it.each([
    "Rajendra Pawar",
    "  RAJENDRA   PAWAR ",
    "Mr. Rajendra Pawar",
    "Pawar, Rajendra",
    "Shri Rajendra S. Pawar",
    "Dr Rajendra Pawar",
  ])("accepts %s", (name) => {
    expect(comparePatientIdentity(claim, evidence(name))).toEqual({
      kind: "MATCH",
    });
  });
  it.each([
    ["Sunita Deshmukh", "Smt. Deshmukh Sunita"],
    ["Ayesha Khan", "Mrs Ayesha Khan"],
    ["Meena D'Souza", "Ms Meena DSouza"],
    ["सविता पाटील", "पाटील सविता"],
  ])("matches reordered and punctuated Indian names %s", (expected, found) => {
    expect(
      comparePatientIdentity(
        { ...claim, patientName: expected },
        evidence(found),
      ).kind,
    ).toBe("MATCH");
  });
  it.each([
    "Imran Shaikh",
    "Rajesh Pawar",
    "Rajendra Patil",
    "Pawar",
    "R Pawar",
    "Dr. Shri",
    "Rajendra Suresh Patil",
    "Rajendra Suresh Pawar",
  ])("rejects %s without fuzzy guessing", (found) => {
    expect(comparePatientIdentity(claim, evidence(found))).toEqual({
      kind: "MISMATCH",
      differences: [
        {
          field: "patient_name",
          expected: claim.patientName,
          found,
          sourceSnippet: `Patient: ${found}`,
        },
      ],
    });
  });
  it("requires all extracted identifiers to agree even if the name matches", () => {
    const result = comparePatientIdentity(claim, [
      ...evidence("Pawar Rajendra"),
      ...evidence("SYN-C-3382", "policy_number"),
      ...evidence("UHID-03382", "uhid"),
    ]);
    expect(result).toMatchObject({
      kind: "MISMATCH",
      differences: [{ field: "policy_number" }, { field: "uhid" }],
    });
    expect(
      comparePatientIdentity(claim, [
        ...evidence("syn b 3381", "policy_number"),
        ...evidence("uhid 03381", "uhid"),
      ]),
    ).toEqual({ kind: "MATCH" });
  });
  it("does not strip meaningful vowel marks from Indian-language names", () => {
    expect(
      comparePatientIdentity(
        { ...claim, patientName: "रमा पाटील" },
        evidence("राम पाटील"),
      ).kind,
    ).toBe("MISMATCH");
  });
  it("returns UNKNOWN for missing or empty identity, not for a contradictory field", () => {
    for (const fields of [
      [],
      evidence("", "patient_name"),
      evidence("Male", "gender"),
    ])
      expect(comparePatientIdentity(claim, fields)).toEqual({
        kind: "UNKNOWN",
      });
    expect(
      comparePatientIdentity(claim, [
        ...evidence("Rajendra Pawar"),
        ...evidence("Imran Shaikh"),
      ]).kind,
    ).toBe("MISMATCH");
  });
  it("retains original evidence when reviewed fields have been edited or rejected", () => {
    const [document] = withIdentityChecks(
      claim,
      [{ id: "wrong", identityEvidence: evidence("Imran Shaikh") }],
      [{ ...evidence("Rajendra Pawar")[0], documentId: "wrong" }],
    );
    expect(hasIdentityMismatch(document)).toBe(true);
    expect(
      hasIdentityMismatch({ ...document, identityOverrideBy: "reviewer" }),
    ).toBe(false);
    expect(document.identity.kind).toBe("MISMATCH");
  });
});

describe("identity gates in the checklist engine", () => {
  const rule: Rule = {
    id: "rule",
    payerId: null,
    procedureId: null,
    stage: "DISCHARGE",
    documentTypeId: "notes",
    requirement: "REQUIRED",
    maxAgeHours: null,
    note: "",
  };
  const document = {
    id: "wrong",
    documentTypeId: "notes",
    status: "CONFIRMED" as const,
    documentDate: null,
    uploadedAt: new Date(),
    identityEvidence: evidence("Imran Shaikh"),
  };
  it("a confirmed wrong-patient file cannot satisfy a slot, including when a waiver removes the slot", () => {
    const checked = withIdentityChecks(claim, [document], []);
    for (const requirement of ["REQUIRED", "OPTIONAL", "WAIVED"] as const) {
      const result = evaluateChecklist(
        resolveRules([{ ...rule, requirement }], {
          payerId: "payer",
          procedureId: "procedure",
          stage: "DISCHARGE",
        }),
        checked,
        new Date(),
        { stage: "DISCHARGE", fields: [] },
      );
      expect(result.ready).toBe(false);
      expect(result.blockers).toContainEqual(
        expect.objectContaining({ kind: "IDENTITY", documentId: "wrong" }),
      );
      expect(result.counts.requiredSatisfied).toBe(0);
      expect(result.slots[0]?.state).not.toBe("SATISFIED");
    }
  });
  it("an audited override permits the file while keeping the comparison available", () => {
    const checked = withIdentityChecks(
      claim,
      [{ ...document, identityOverrideBy: "reviewer" }],
      [],
    );
    expect(
      evaluateChecklist(
        resolveRules([rule], {
          payerId: "payer",
          procedureId: "procedure",
          stage: "DISCHARGE",
        }),
        checked,
        new Date(),
        { stage: "DISCHARGE", fields: [] },
      ).ready,
    ).toBe(true);
  });
  it("confirmed fields from a mismatched source cannot satisfy pre-auth requirements", () => {
    const checked = withIdentityChecks(claim, [document], []);
    const result = evaluateChecklist([], checked, new Date(), {
      stage: "PREAUTH",
      fields: [
        {
          documentId: "wrong",
          fieldKey: "patient_name",
          status: "CONFIRMED",
          value: "Imran Shaikh",
        },
      ],
    });
    expect(result.blockers).toContainEqual({
      kind: "FIELD",
      fieldKey: "patient_name",
      label: "Patient name",
    });
  });
});

describe("extracted gender vocabulary", () => {
  it.each([
    ["M", "Male"],
    [" male ", "Male"],
    ["F", "Female"],
    ["Female", "Female"],
    ["other", "Other"],
    ["O", "Other"],
    ["Not stated", "Not stated"],
  ])("normalizes %s to %s", (value, expected) => {
    expect(normalizeGender(value)).toBe(expected);
  });
});
