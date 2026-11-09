export const IDENTITY_FIELD_KEYS = [
  "patient_name",
  "policy_number",
  "uhid",
] as const;
export type IdentityField = {
  fieldKey: string;
  value: string;
  sourceSnippet: string;
};
export type ClaimIdentity = {
  patientName: string;
  policyNumber: string;
  uhid: string;
};
export type IdentityDifference = {
  field: "patient_name" | "policy_number" | "uhid";
  expected: string;
  found: string;
  sourceSnippet: string;
};
export type IdentityResult =
  | { kind: "MATCH" }
  | { kind: "MISMATCH"; differences: IdentityDifference[] }
  | { kind: "UNKNOWN" };

const honorifics = new Set(["mr", "mrs", "ms", "shri", "smt", "dr"]);
function nameTokens(value: string) {
  return [
    ...new Set(
      value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((token) => token && !honorifics.has(token)),
    ),
  ];
}
function namesMatch(expected: string, found: string) {
  const left = nameTokens(expected);
  const right = nameTokens(found);
  if (!left.length || !right.length) return false;
  if (
    left.length === right.length &&
    left.every((token) => right.includes(token))
  )
    return true;
  const leftFull = left.filter((token) => token.length > 1);
  const rightFull = right.filter((token) => token.length > 1);
  // Initials may be omitted, but different full-name tokens require human review.
  return (
    leftFull.length >= 2 &&
    leftFull.length === rightFull.length &&
    leftFull.every((token) => rightFull.includes(token))
  );
}
function identifier(value: string) {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}
export function comparePatientIdentity(
  claim: ClaimIdentity,
  fields: readonly IdentityField[],
): IdentityResult {
  const expected = {
    patient_name: claim.patientName,
    policy_number: claim.policyNumber,
    uhid: claim.uhid,
  };
  const differences: IdentityDifference[] = [];
  let compared = 0;
  for (const field of fields) {
    if (!Object.hasOwn(expected, field.fieldKey) || !field.value.trim())
      continue;
    const key = field.fieldKey as keyof typeof expected;
    compared++;
    const matches =
      key === "patient_name"
        ? namesMatch(expected[key], field.value)
        : identifier(expected[key]) === identifier(field.value);
    if (!matches)
      differences.push({
        field: key,
        expected: expected[key],
        found: field.value,
        sourceSnippet: field.sourceSnippet,
      });
  }
  return differences.length
    ? { kind: "MISMATCH", differences }
    : compared
      ? { kind: "MATCH" }
      : { kind: "UNKNOWN" };
}

export type IdentityCheckedDocument = {
  identity?: IdentityResult;
  identityOverrideBy?: string | null;
};
export function hasIdentityMismatch(document: IdentityCheckedDocument) {
  return document.identity?.kind === "MISMATCH" && !document.identityOverrideBy;
}
export function withIdentityChecks<
  T extends { id: string; identityEvidence?: IdentityField[] | null },
>(
  claim: ClaimIdentity,
  documents: readonly T[],
  fields: readonly (IdentityField & { documentId: string })[],
) {
  return documents.map((document) => ({
    ...document,
    identity: comparePatientIdentity(
      claim,
      document.identityEvidence ??
        fields.filter((field) => field.documentId === document.id),
    ),
  }));
}

export function identityWarning(difference: IdentityDifference) {
  const opening = {
    patient_name: "This may be a different patient.",
    policy_number: "The policy number may not match this claim.",
    uhid: "The UHID may not match this claim.",
  }[difference.field];
  return `${opening} The document says '${difference.found}'. The claim says '${difference.expected}'.`;
}
