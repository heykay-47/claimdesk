"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { runAction } from "@/app/actions";
export function ReplyComposer({
  queryId,
  code,
  patient,
  subject,
  documentNames,
}: {
  queryId: string;
  code: string;
  patient: string;
  subject: string;
  documentNames: string[];
}) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Record your reply</h2>
        <button
          className="btn small"
          type="button"
          onClick={() =>
            setBody(
              `Dear Claims Team,\n\nRe: ${subject}\nClaim ${code} · ${patient}\n\nPlease find the following confirmed documents, to be attached through your channel:\n${documentNames.length ? documentNames.map((name) => `- ${name}`).join("\n") : "[Attach the requested documents before sending.]"}\n\nPlease review the submitted information and advise on pre-authorisation.\n\nRegards,\nHospital Insurance Desk`,
            )
          }
        >
          Draft reply
        </button>
      </div>
      <div className="panel-body">
        <p className="muted text-xs mb-4">
          This helper inserts a template, not an AI-generated clinical answer.
          Nothing is emailed. Send through the payer’s channel, then record it
          here.
        </p>
        <label className="field">
          Reply body
          <textarea
            className="control"
            rows={12}
            maxLength={50000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        <button
          className="btn primary mt-4"
          disabled={!body.trim()}
          type="button"
          onClick={() => dialog.current?.showModal()}
        >
          Mark reply as sent
        </button>
      </div>
      <dialog ref={dialog} className="modal" aria-label="Confirm reply has been sent">
        <h2>Has this reply been sent?</h2>
        <p className="muted">
          Confirm only after sending it through the payer’s portal or email.
          ClaimDesk records the reply and closes this query.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button
            className="btn"
            disabled={pending}
            type="button"
            onClick={() => dialog.current?.close()}
          >
            Not yet
          </button>
          <button
            className="btn primary"
            disabled={pending}
            type="button"
            onClick={() =>
              startTransition(async () => {
                const result = await runAction("answerQuery", {
                  queryId,
                  replyBody: body,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                toast.success("Reply recorded as sent");
                dialog.current?.close();
                router.refresh();
              })
            }
          >
            {pending ? "Recording…" : "Yes, record as sent"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
