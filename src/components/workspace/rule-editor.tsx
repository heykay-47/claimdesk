"use client";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
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
  sourceLabel = "New override",
}: {
  rule?: ResolvedRule;
  types: { id: string; label: string }[];
  payerId: string | null;
  procedureId: string | null;
  stage: Stage;
  affected: number;
  sourceLabel?: string;
}) {
  const formId = useId();
  const [requirement, setRequirement] = useState(
    rule?.requirement ?? "REQUIRED",
  );
  const [maxAge, setMaxAge] = useState(String(rule?.maxAgeHours ?? ""));
  const [note, setNote] = useState(rule?.note ?? "");
  const [documentTypeId, setDocumentTypeId] = useState(
    rule?.documentTypeId ?? "",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const dirty = !rule
    ? !!documentTypeId
    : requirement !== rule.requirement ||
      maxAge !== String(rule.maxAgeHours ?? "") ||
      note !== rule.note;
  const exact =
    rule && rule.payerId === payerId && rule.procedureId === procedureId;
  const label =
    types.find((type) => type.id === documentTypeId)?.label ?? "new document";
  function save(confirmedWaiver = false) {
    setError("");
    startTransition(async () => {
      const result = await runAction("saveRule", {
        payerId,
        procedureId,
        stage,
        documentTypeId,
        requirement,
        maxAgeHours: maxAge ? Number(maxAge) : null,
        note,
        confirmedWaiver,
      });
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
    if (requirement === "WAIVED") dialog.current?.showModal();
    else save();
  }
  return (
    <tr className={!rule ? "rule-add-row" : undefined}>
      <td>
        {rule ? (
          <span className="font-medium">{label}</span>
        ) : (
          <>
            <span className="sub mb-2">Add document requirement</span>
            <select
              className="control"
              form={formId}
              required
              aria-label="New document type"
              value={documentTypeId}
              onChange={(event) => setDocumentTypeId(event.target.value)}
            >
              <option value="">Choose document</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </>
        )}
      </td>
      <td>
        <select
          className="control"
          form={formId}
          disabled={pending}
          aria-label={`Requirement for ${label}`}
          value={requirement}
          onChange={(event) =>
            setRequirement(event.target.value as typeof requirement)
          }
        >
          <option value="REQUIRED">Required</option>
          <option value="OPTIONAL">Optional</option>
          <option value="WAIVED">Waived</option>
        </select>
      </td>
      <td>
        <input
          className="control rule-age"
          form={formId}
          disabled={pending}
          aria-label={`Max age for ${label}`}
          type="number"
          min="1"
          max="87600"
          placeholder="None"
          value={maxAge}
          onChange={(event) => setMaxAge(event.target.value)}
        />
      </td>
      <td>
        <span className="pill neutral rule-source">{sourceLabel}</span>
      </td>
      <td>
        <input
          className="control rule-note"
          form={formId}
          disabled={pending}
          aria-label={`Note for ${label}`}
          maxLength={5000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Desk note"
        />
      </td>
      <td>
        <div className="rule-actions">
          <form id={formId} onSubmit={submit}>
            {dirty && (
              <button
                className="btn small primary"
                disabled={pending}
                type="submit"
              >
                {pending ? "Saving…" : rule ? "Save" : "Add"}
              </button>
            )}
          </form>
          {exact && (
            <ActionButton
              action="deleteRule"
              values={{ ruleId: rule.id }}
              confirm="Remove this rule? Any less-specific rule will apply again."
              success="Rule removed"
              className="text-link text-xs"
            >
              Remove {rule.source === "DEFAULT" ? "rule" : "override"}
            </ActionButton>
          )}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <dialog
          ref={dialog}
          className="modal"
          aria-label="Confirm document waiver"
        >
          <h2>Waive this document requirement?</h2>
          <p className="muted text-sm">
            This removes {label.toLowerCase()} from the effective checklist for
            this scope. It may make a blocked claim ready without that document.
            Affects {affected} open claims.
          </p>
          <div className="modal-footer">
            <button
              className="btn"
              type="button"
              disabled={pending}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={pending}
              onClick={() => save(true)}
            >
              {pending ? "Saving…" : "Confirm waiver"}
            </button>
          </div>
        </dialog>
      </td>
    </tr>
  );
}
