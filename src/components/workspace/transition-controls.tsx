"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  nextActions,
  canTransition,
  STAGE_FOR_STATUS,
  type ClaimAction,
} from "@/domain/claim-status";
import type { ClaimFile } from "@/server/workspace";
import { runAction } from "@/app/actions";
import { blockerText } from "@/domain/checklist-labels";
import { DEDUCTION_REASONS, DEDUCTION_LABELS } from "@/domain/settlement";
export const ACTION_LABELS: Record<ClaimAction, string> = {
  submit_preauth: "Mark pre-auth sent",
  record_query: "Log incoming query",
  answer_query: "Move back to Pre-auth sent",
  record_approval: "Record approval",
  request_enhancement: "Request enhancement",
  submit_enhancement: "Mark enhancement sent",
  submit_final_bill: "Mark final bill sent",
  record_settlement: "Record settlement",
  record_rejection: "Record rejection",
};
const ACTION_HELP: Record<ClaimAction, string> = {
  submit_preauth:
    "Choose Confirm change only after you have sent the pre-auth packet to the insurer or TPA yourself. ClaimDesk does not send anything.",
  record_query:
    "Log the query from the insurer or TPA in the query inbox instead.",
  answer_query:
    "This moves the claim back to Pre-auth sent. It works only when every open query has been answered.",
  record_approval:
    "Record that the insurer or TPA approved the pre-auth. Enter the amount they approved.",
  request_enhancement:
    "Use this when the treatment needs more approval from the insurer or TPA, for example a higher amount. Next, prepare the enhancement documents.",
  submit_enhancement:
    "Choose Confirm change only after you have sent the enhancement request to the insurer or TPA yourself. ClaimDesk does not send anything.",
  submit_final_bill:
    "Choose Confirm change only after you have sent the final bill and discharge documents to the insurer or TPA yourself. ClaimDesk does not send anything.",
  record_settlement:
    "Record that the insurer or TPA has paid the claim. Enter the amount paid. You can also record a deduction.",
  record_rejection:
    "Record that the insurer or TPA rejected this claim. The claim will be closed and cannot be moved to another step.",
};
export function TransitionControls({ file }: { file: ClaimFile }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<ClaimAction | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [hasDeduction, setHasDeduction] = useState(false);
  const router = useRouter();
  const openQueries = file.queries.filter((q) => q.status === "OPEN");
  const options = nextActions(file.claim.status);
  const blocked = options.some(
    (t) =>
      t.gate && t.gate !== "QUERIES_ANSWERED" && !file.currentChecklist.ready,
  );
  const blockers = file.currentChecklist.blockers.map((blocker) =>
    blockerText(blocker, file.ref.types),
  );
  return (
    <>
      <div className="button-row">
        {file.claim.status === "QUERY" && openQueries.length > 0 && (
          <Link className="btn primary" href={`/queries/${openQueries[0].id}`}>
            Review query
          </Link>
        )}
        {options.map((option, index) => {
          if (option.action === "record_query")
            return (
              <Link
                key={option.action}
                className="btn"
                href={`/queries/new?claim=${file.claim.id}`}
              >
                Log incoming query
              </Link>
            );
          const allowed = canTransition(file.claim.status, option.action, {
            readiness: {
              [STAGE_FOR_STATUS[file.claim.status]]:
                file.currentChecklist.ready,
            },
            openQueryCount: openQueries.length,
          });
          return (
            <button
              key={option.action}
              className={`btn ${index === 0 ? "primary" : option.action === "record_rejection" ? "ghost danger-button" : ""}`}
              type="button"
              disabled={!allowed}
              title={
                !allowed
                  ? option.gate === "QUERIES_ANSWERED"
                    ? "Answer every open query in the inbox first"
                    : "Fix the items listed below first"
                  : undefined
              }
              onClick={() => {
                setAction(option.action);
                setHasDeduction(false);
                setError("");
                dialog.current?.showModal();
              }}
            >
              {ACTION_LABELS[option.action]}
            </button>
          );
        })}
      </div>
      {blocked && (
        <details className="blockers" open>
          <summary>
            {blockers.length}{" "}
            {blockers.length === 1 ? "item blocks" : "items block"} submission
          </summary>
          <ul>
            {blockers.slice(0, 5).map((blocker, i) => (
              <li key={i}>{blocker}</li>
            ))}
          </ul>
          {blockers.length > 5 && (
            <Link
              className="text-link"
              href={`/claims/${file.claim.code}/preauth`}
            >
              See all {blockers.length} items
            </Link>
          )}
        </details>
      )}
      {file.claim.status === "QUERY" && openQueries.length > 0 && (
        <p className="muted text-xs mt-3">
          Answer{" "}
          {openQueries.length === 1
            ? "the open query"
            : `all ${openQueries.length} open queries`}{" "}
          to move the claim back to Pre-auth sent.
        </p>
      )}
      <dialog
        aria-label={
          action ? ACTION_LABELS[action] : "Confirm claim status change"
        }
        ref={dialog}
        className="modal"
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <h2>{action && ACTION_LABELS[action]}</h2>
        <p className="muted text-sm">
          {action && ACTION_HELP[action]} This change is added to the
          claim&apos;s activity history and to the activity log.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await runAction("transitionClaim", {
                claimId: file.claim.id,
                action,
                note: form.get("note"),
                ...(action === "record_settlement" && hasDeduction
                  ? {
                      deduction: {
                        amount: form.get("deductionAmount"),
                        reason: form.get("deductionReason"),
                      },
                    }
                  : {}),
                ...(["record_approval", "record_settlement"].includes(
                  action ?? "",
                )
                  ? { amount: form.get("amount") }
                  : {}),
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success("Claim status updated");
              dialog.current?.close();
              router.refresh();
            });
          }}
        >
          <fieldset disabled={pending}>
            {["record_approval", "record_settlement"].includes(
              action ?? "",
            ) && (
              <label className="field">
                {action === "record_approval"
                  ? "Approved amount (₹)"
                  : "Settled amount (₹)"}
                <input
                  className="control mono"
                  type="number"
                  name="amount"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
            )}
            {action === "record_settlement" && (
              <div className="mt-4">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasDeduction}
                    onChange={(event) => setHasDeduction(event.target.checked)}
                  />
                  Record a deduction (an amount the insurer or TPA did not pay)
                </label>
                {hasDeduction && (
                  <>
                    <label className="field">
                      Deduction amount (₹)
                      <input
                        className="control mono"
                        type="number"
                        name="deductionAmount"
                        min="0.01"
                        step="0.01"
                        required
                      />
                    </label>
                    <label className="field">
                      Deduction reason
                      <select
                        className="control"
                        name="deductionReason"
                        required
                      >
                        <option value="">Choose reason</option>
                        {DEDUCTION_REASONS.map((reason) => (
                          <option key={reason} value={reason}>
                            {DEDUCTION_LABELS[reason]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>
            )}
            <label className="field">
              Note (optional)
              <textarea
                className="control"
                name="note"
                rows={3}
                maxLength={5000}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-footer">
              <button
                className="btn"
                type="button"
                onClick={() => dialog.current?.close()}
              >
                Cancel
              </button>
              <button className="btn primary" type="submit">
                {pending ? "Recording…" : "Confirm change"}
              </button>
            </div>
          </fieldset>
        </form>
      </dialog>
    </>
  );
}
