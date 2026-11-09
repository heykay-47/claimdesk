import type { ChecklistBlocker } from "./checklist";
import { identityWarning } from "./identity";

export function blockerText(
  blocker: ChecklistBlocker,
  types: readonly { id: string; label: string }[],
) {
  if (blocker.kind === "FIELD") return `${blocker.label} needs checking`;
  if (blocker.kind === "IDENTITY")
    return `${identityWarning(blocker.differences[0])} The document is left out until you settle this.`;
  if (blocker.kind === "UNSORTED")
    return "A document has not been sorted yet. Choose its type and confirm it";
  const label =
    types.find((type) => type.id === blocker.documentTypeId)?.label ??
    "Document";
  const state = {
    MISSING: "is missing",
    STALE: "is too old",
    UNVERIFIED: "needs your confirmation",
  };
  return `${label} ${state[blocker.state]}`;
}
