import type { ChecklistBlocker } from "./checklist";
import { identityWarning } from "./identity";

export function blockerText(
  blocker: ChecklistBlocker,
  types: readonly { id: string; label: string }[],
) {
  if (blocker.kind === "FIELD") return `${blocker.label} needs review`;
  if (blocker.kind === "IDENTITY")
    return `${identityWarning(blocker.differences[0])}. Document excluded until identity is resolved`;
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
