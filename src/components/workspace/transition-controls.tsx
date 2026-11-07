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
export const ACTION_LABELS: Record<ClaimAction, string> = {
  submit_preauth: "Mark pre-auth sent",
  record_query: "Log incoming query",
  answer_query: "Return to pre-auth",
  record_approval: "Record approval",
  request_enhancement: "Request enhancement",
  submit_enhancement: "Mark enhancement sent",
  submit_final_bill: "Mark final bill sent",
  record_settlement: "Record settlement",
  record_rejection: "Record rejection",
};
export function TransitionControls({ file }: { file: ClaimFile }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<ClaimAction | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
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
                    : "Resolve checklist gaps before submission"
                  : undefined
              }
              onClick={() => {
                setAction(option.action);
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
              Review all {blockers.length} items
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
          to return to pre-auth sent.
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
          {action?.startsWith("submit")
            ? "Only record this after sending the completed packet through the payer’s channel. Nothing is sent from ClaimDesk."
            : "This change will be added to the claim timeline and audit log."}
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
