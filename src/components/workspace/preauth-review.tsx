"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PREAUTH_FIELDS } from "@/domain/preauth-fields";
import type { ClaimFile } from "@/server/workspace";
import { runAction } from "@/app/actions";
import { FileContent } from "./document-preview";
function FieldReview({
  definition,
  file,
  preview,
}: {
  definition: (typeof PREAUTH_FIELDS)[number];
  file: ClaimFile;
  preview: (id: string) => void;
}) {
  const suggestions = file.fields.filter(
    (field) => field.fieldKey === definition.key,
  );
  const initial =
    suggestions.find((field) => field.status === "CONFIRMED") ??
    suggestions.find((field) => field.status === "PENDING") ??
    suggestions[0];
  const [selected, setSelected] = useState(initial?.id ?? "");
  const source = suggestions.find((field) => field.id === selected);
  const [value, setValue] = useState(initial?.value ?? "");
  const [documentId, setDocumentId] = useState(file.files[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  const conflict =
    new Set(
      suggestions
        .filter((s) => s.status !== "REJECTED")
        .map((s) => s.value.trim().toLowerCase()),
    ).size > 1;
  function review(action: "CONFIRM" | "REJECT") {
    setError("");
    startTransition(async () => {
      const result = await runAction("reviewField", {
        claimId: file.claim.id,
        fieldKey: definition.key,
        value,
        action,
        ...(source ? { fieldId: source.id } : { documentId }),
      });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(
        action === "CONFIRM" ? "Field confirmed" : "Suggestion rejected",
      );
      router.refresh();
    });
  }
  const sourceDocument = file.files.find(
    (doc) => doc.id === source?.documentId,
  );
  return (
    <section className="field-review">
      <div className="flex justify-between gap-3 items-start">
        <label
          htmlFor={`field-${definition.key}`}
          className="font-medium text-sm"
        >
          {definition.label}
          {definition.required && (
            <span className="muted text-xs ml-2">Required</span>
          )}
        </label>
        <span
          className={`pill ${source?.status === "CONFIRMED" ? "success" : "warning"}`}
        >
          {source?.status === "CONFIRMED"
            ? "Confirmed"
            : source?.status === "REJECTED"
              ? "Rejected"
              : "Pending"}
        </span>
      </div>
      {conflict && (
        <p className="warning-text text-xs mt-2">
          Conflicting values found. Choose the supported value before
          confirming.
        </p>
      )}
      {suggestions.length > 1 && (
        <label className="field mt-2">
          <span className="sr-only">
            Source suggestion for {definition.label}
          </span>
          <select
            className="control"
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              const next = suggestions.find((f) => f.id === event.target.value);
              setValue(next?.value ?? "");
              if (next) preview(next.documentId);
            }}
          >
            {suggestions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.value.slice(0, 70)} ·{" "}
                {file.files.find((d) => d.id === s.documentId)?.fileName} ·{" "}
                {s.status.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
      )}
      {definition.type === "textarea" ? (
        <textarea
          id={`field-${definition.key}`}
          className="control"
          value={value}
          rows={3}
          maxLength={5000}
          onChange={(e) => setValue(e.target.value)}
        />
      ) : (
        <input
          id={`field-${definition.key}`}
          className="control"
          value={value}
          type={
            definition.type === "date"
              ? "date"
              : definition.type === "money" || definition.type === "number"
                ? "number"
                : "text"
          }
          min={
            definition.type === "money" || definition.type === "number"
              ? "0"
              : undefined
          }
          step={definition.type === "money" ? "0.01" : undefined}
          maxLength={5000}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      {source && (
        <>
          <blockquote className="source-quote">
            “{source.sourceSnippet}”
          </blockquote>
          <div className="flex flex-wrap gap-2 text-xs mb-3">
            {sourceDocument && (
              <button
                type="button"
                className="text-link text-left break-all"
                onClick={() => preview(sourceDocument.id)}
              >
                {sourceDocument.fileName}
              </button>
            )}
            <span className="muted">
              {Math.round(source.confidence * 100)}% confidence
            </span>
          </div>
        </>
      )}
      {!source && (
        <label className="field mt-3 mb-3">
          Source document
          <select
            className="control"
            value={documentId}
            onChange={(event) => {
              setDocumentId(event.target.value);
              preview(event.target.value);
            }}
            disabled={!file.files.length}
          >
            {!file.files.length && (
              <option value="">Upload a source document first</option>
            )}
            {file.files.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.fileName}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button
          className="btn small"
          disabled={pending || !value.trim() || (!source && !documentId)}
          type="button"
          onClick={() => review("CONFIRM")}
        >
          {pending
            ? "Saving…"
            : value !== source?.value
              ? "Edit + confirm"
              : "Confirm"}
        </button>
        {source && (
          <button
            className="btn small ghost"
            disabled={pending || source.status === "REJECTED"}
            type="button"
            onClick={() => review("REJECT")}
          >
            Reject
          </button>
        )}
      </div>
    </section>
  );
}
export function PreauthReview({ file }: { file: ClaimFile }) {
  const [previewId, setPreviewId] = useState(
    file.files.find((doc) => doc.documentTypeKey === "PREAUTH_FORM")?.id ??
      file.files[0]?.id ??
      "",
  );
  const source = file.files.find((doc) => doc.id === previewId);
  return (
    <div className="field-review-grid">
      <div className="panel">
        {PREAUTH_FIELDS.map((definition) => (
          <FieldReview
            key={`${definition.key}-${file.fields
              .filter((f) => f.fieldKey === definition.key)
              .map((f) => `${f.id}:${f.status}`)
              .join()}`}
            definition={definition}
            file={file}
            preview={setPreviewId}
          />
        ))}
      </div>
      <aside className="document-preview panel">
        <div className="panel-heading">
          <h2>Source document</h2>
          <select
            className="control"
            aria-label="Preview source document"
            value={previewId}
            onChange={(e) => setPreviewId(e.target.value)}
          >
            {!file.files.length && (
              <option value="">No documents uploaded</option>
            )}
            {file.files.map((doc) => (
              <option value={doc.id} key={doc.id}>
                {doc.fileName}
              </option>
            ))}
          </select>
        </div>
        {source ? (
          <FileContent file={source} />
        ) : (
          <p className="panel-body muted text-sm">
            Upload documents in the claim file to review extracted evidence
            here.
          </p>
        )}
      </aside>
    </div>
  );
}
