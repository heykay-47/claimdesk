import type { ChecklistBlocker } from "./checklist";

export function blockerText(
  blocker: ChecklistBlocker,
  types: readonly { id: string; label: string }[],
) {
  if (blocker.kind === "FIELD") return `${blocker.label} needs review`;
  if (blocker.kind === "UNSORTED") return "Unsorted document needs review";
  const label =
    types.find((type) => type.id === blocker.documentTypeId)?.label ??
    "Document";
  const state = {
    MISSING: "missing",
    STALE: "is stale",
    UNVERIFIED: "needs confirmation",
  };
  return `${label} ${state[blocker.state]}`;
}
