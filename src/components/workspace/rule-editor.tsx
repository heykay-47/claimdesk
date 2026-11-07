"use client";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { runAction } from "@/app/actions";
import type { ResolvedRule, Stage } from "@/domain/checklist";
import { ActionButton } from "./action-form";
export function RuleEditor({
  rule,
  types,
  payerId,
  procedureId,
  stage,
  affected,
}: {
  rule?: ResolvedRule;
  types: { id: string; label: string }[];
  payerId: string | null;
  procedureId: string | null;
  stage: Stage;
  affected: number;
}) {
  const [requirement, setRequirement] = useState(
    rule?.requirement ?? "REQUIRED",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  function save(values: Record<string, unknown>) {
    startTransition(async () => {
      const result = await runAction("saveRule", values);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Checklist rule saved. Claim readiness updated.");
      dialog.current?.close();
      router.refresh();
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const values = {
      payerId,
      procedureId,
      stage,
      documentTypeId: rule?.documentTypeId ?? form.get("documentTypeId"),
      requirement,
      maxAgeHours: form.get("maxAgeHours")
        ? Number(form.get("maxAgeHours"))
        : null,
      note: form.get("note"),
      confirmedWaiver: false,
    };
    if (requirement === "WAIVED") {
      setData(values);
      dialog.current?.showModal();
    } else save(values);
  }
  const exact =
    rule && rule.payerId === payerId && rule.procedureId === procedureId;
  return (
    <details className="text-xs">
      <summary className="text-link">
        {rule ? "Edit requirement" : "Add a requirement"}
      </summary>
      <form className="mt-4" onSubmit={submit}>
        <fieldset disabled={pending} className="form-grid">
          {!rule && (
            <label className="field full">
              Document type
              <select className="control" name="documentTypeId" required>
                <option value="">Choose document type</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Requirement
            <select
              className="control"
              value={requirement}
              onChange={(event) =>
                setRequirement(event.target.value as typeof requirement)
              }
            >
              <option value="REQUIRED">Required</option>
              <option value="OPTIONAL">Optional</option>
              <option value="WAIVED">Waived</option>
            </select>
          </label>
          <label className="field">
            Max age (hours)
            <input
              className="control"
              name="maxAgeHours"
              type="number"
              min="1"
              max="87600"
              defaultValue={rule?.maxAgeHours ?? ""}
              placeholder="No age limit"
            />
          </label>
          <label className="field full">
            Desk note
            <textarea
              className="control"
              name="note"
              rows={2}
              maxLength={5000}
              defaultValue={rule?.note ?? ""}
            />
          </label>
          <p className="muted full" style={{ gridColumn: "1 / -1" }}>
            Affects {affected} open {affected === 1 ? "claim" : "claims"}.{" "}
            {rule && !exact
              ? "Saves an override at the selected payer and procedure scope."
              : "Readiness is recalculated immediately."}
          </p>
          <div className="button-row">
            <button className="btn small primary" type="submit">
              {pending ? "Saving…" : "Save requirement"}
            </button>
            {exact && (
              <ActionButton
                action="deleteRule"
                values={{ ruleId: rule.id }}
                confirm="Delete this rule? Any less-specific rule will apply again."
                success="Rule deleted"
                className="btn small danger-button"
              >
                Delete {rule.source === "DEFAULT" ? "rule" : "override"}
              </ActionButton>
            )}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </form>
      <dialog ref={dialog} className="modal" aria-label="Confirm document waiver">
        <h2>Waive this document requirement?</h2>
        <p className="muted text-sm">
          This removes the document from the effective checklist for this scope.
          It may make a blocked claim ready without that document. Affects{" "}
          {affected} open claims.
        </p>
        <div className="modal-footer">
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={pending}
            onClick={() => {
              if (data) save({ ...data, confirmedWaiver: true });
            }}
          >
            {pending ? "Saving…" : "Confirm waiver"}
          </button>
        </div>
      </dialog>
    </details>
  );
}
