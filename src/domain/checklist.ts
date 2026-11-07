import { pendingRequiredFields, type ReviewedField } from "./preauth-fields";

export type Stage = "PREAUTH" | "ENHANCEMENT" | "DISCHARGE";
export type Rule = {
  id: string;
  payerId: string | null;
  procedureId: string | null;
  documentTypeId: string;
  stage: Stage;
  requirement: "REQUIRED" | "OPTIONAL" | "WAIVED";
  maxAgeHours: number | null;
  note: string;
};
export type RuleSource = "PAYER_PROCEDURE" | "PAYER" | "PROCEDURE" | "DEFAULT";
export type ResolvedRule = Rule & { source: RuleSource };
const precedence: Record<RuleSource, number> = {
  DEFAULT: 0,
  PROCEDURE: 1,
  PAYER: 2,
  PAYER_PROCEDURE: 3,
};
export function resolveRules(
  rules: readonly Rule[],
  context: { payerId: string; procedureId: string; stage: Stage },
): ResolvedRule[] {
  const resolved = new Map<string, ResolvedRule>();
  for (const rule of rules) {
    if (
      rule.stage !== context.stage ||
      (rule.payerId !== null && rule.payerId !== context.payerId) ||
      (rule.procedureId !== null && rule.procedureId !== context.procedureId)
    )
      continue;
    const source: RuleSource = rule.payerId
      ? rule.procedureId
        ? "PAYER_PROCEDURE"
        : "PAYER"
      : rule.procedureId
        ? "PROCEDURE"
        : "DEFAULT";
    const prior = resolved.get(rule.documentTypeId);
    if (!prior || precedence[source] > precedence[prior.source])
      resolved.set(rule.documentTypeId, { ...rule, source });
  }
  return [...resolved.values()].sort((a, b) =>
    a.documentTypeId.localeCompare(b.documentTypeId),
  );
}
export type ChecklistDocument = {
  id: string;
  documentTypeId: string | null;
  documentTypeKey?: string | null;
  status: "PROCESSING" | "NEEDS_REVIEW" | "CONFIRMED" | "FAILED";
  documentDate: string | null;
  uploadedAt: Date;
};
type SlotBase = { rule: ResolvedRule; documents: ChecklistDocument[] };
export type ChecklistSlot =
  | (SlotBase & { state: "SATISFIED"; document: ChecklistDocument })
  | (SlotBase & { state: "UNVERIFIED" })
  | (SlotBase & { state: "STALE"; document: ChecklistDocument })
  | (SlotBase & { state: "MISSING" });
export type ChecklistBlocker =
  | {
      kind: "DOCUMENT";
      documentTypeId: string;
      state: "UNVERIFIED" | "STALE" | "MISSING";
    }
  | { kind: "UNSORTED"; documentId: string }
  | { kind: "FIELD"; fieldKey: string; label: string };
export type ChecklistResult = {
  slots: ChecklistSlot[];
  unsorted: ChecklistDocument[];
  blockers: ChecklistBlocker[];
  ready: boolean;
  counts: Record<ChecklistSlot["state"], number> & {
    total: number;
    required: number;
    requiredSatisfied: number;
  };
};

export function evaluateChecklist(
  rules: readonly ResolvedRule[],
  documents: readonly ChecklistDocument[],
  now: Date,
  context: { stage: Stage; fields: readonly ReviewedField[] },
): ChecklistResult {
  const unsorted = documents.filter(
    (doc) =>
      doc.documentTypeId === null ||
      doc.status === "FAILED" ||
      (doc.documentTypeKey === "OTHER" && doc.status !== "CONFIRMED"),
  );
  const unsortedIds = new Set(unsorted.map((doc) => doc.id));
  const slots = rules
    .filter((rule) => rule.requirement !== "WAIVED")
    .map((rule): ChecklistSlot => {
      const matches = documents.filter(
        (doc) =>
          doc.documentTypeId === rule.documentTypeId &&
          !unsortedIds.has(doc.id),
      );
      const confirmed = matches.filter((doc) => doc.status === "CONFIRMED");
      // A date-only report is interpreted at IST midnight, not server-local midnight.
      const timestamp = (doc: ChecklistDocument) =>
        doc.documentDate
          ? new Date(`${doc.documentDate}T00:00:00+05:30`).getTime()
          : doc.uploadedAt.getTime();
      const fresh = confirmed.filter(
        (doc) =>
          rule.maxAgeHours === null ||
          now.getTime() - timestamp(doc) <= rule.maxAgeHours * 3_600_000,
      );
      const base = { rule, documents: matches };
      if (fresh.length)
        return { ...base, state: "SATISFIED", document: fresh[0] };
      if (confirmed.length)
        return { ...base, state: "STALE", document: confirmed[0] };
      return { ...base, state: matches.length ? "UNVERIFIED" : "MISSING" };
    });
  const blockers: ChecklistBlocker[] = slots.flatMap((slot) =>
    slot.rule.requirement === "REQUIRED" && slot.state !== "SATISFIED"
      ? [
          {
            kind: "DOCUMENT" as const,
            documentTypeId: slot.rule.documentTypeId,
            state: slot.state,
          },
        ]
      : [],
  );
  for (const doc of unsorted)
    if (doc.status !== "CONFIRMED")
      blockers.push({ kind: "UNSORTED", documentId: doc.id });
  if (context.stage === "PREAUTH")
    for (const field of pendingRequiredFields(context.fields))
      blockers.push({ kind: "FIELD", fieldKey: field.key, label: field.label });
  const counts = {
    SATISFIED: 0,
    UNVERIFIED: 0,
    STALE: 0,
    MISSING: 0,
    total: slots.length,
    required: 0,
    requiredSatisfied: 0,
  };
  for (const slot of slots) {
    counts[slot.state]++;
    if (slot.rule.requirement === "REQUIRED") {
      counts.required++;
      if (slot.state === "SATISFIED") counts.requiredSatisfied++;
    }
  }
  return { slots, unsorted, blockers, ready: blockers.length === 0, counts };
}
