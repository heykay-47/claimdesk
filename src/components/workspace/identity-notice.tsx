"use client";
import type { WorkspaceDocument } from "@/server/workspace";
import { hasIdentityMismatch, identityWarning } from "@/domain/identity";
import { formatIST } from "@/domain/format";
import { ActionButton } from "./action-form";

export function IdentityNotice({ file }: { file: WorkspaceDocument }) {
  if (file.identity.kind !== "MISMATCH") return null;
  const blocked = hasIdentityMismatch(file);
  return (
    <div
      className={`identity-notice ${blocked ? "danger-text" : "muted"}`}
      role={blocked ? "alert" : undefined}
    >
      {file.identity.differences.map((difference, index) => (
        <div key={`${difference.field}-${index}`}>
          <p className="text-sm font-medium">{identityWarning(difference)}</p>
          {difference.sourceSnippet && (
            <blockquote className="source-quote">
              {difference.sourceSnippet}
            </blockquote>
          )}
        </div>
      ))}
      {blocked ? (
        <>
          <p className="text-xs mb-3">
            Until you decide, this document does not count toward the
            checklist. Its details are also left out of the pre-auth fields and
            the packet.
          </p>
          <div className="button-row">
            <ActionButton
              action="reviewDocument"
              values={{
                documentId: file.id,
                action: "REMOVE",
                confirmedRemoval: true,
              }}
              confirm="Remove this document, and the details read from it, from this claim? It will no longer appear in the claim or the packet. The removal is saved in the activity log."
              success="Document removed from claim"
              className="btn small ghost"
            >
              Remove from claim
            </ActionButton>
            {file.documentTypeId &&
              file.status !== "FAILED" &&
              file.status !== "PROCESSING" && (
                <ActionButton
                  action="reviewDocument"
                  values={{ documentId: file.id, action: "CONFIRM_IDENTITY" }}
                  confirm="Have you opened the document and checked that it belongs to this patient, even though the details differ? Your name and the time will be saved in the activity log, and the document will be confirmed."
                  success="Marked as the same patient. Your decision is saved in the activity log."
                >
                  Confirm same patient
                </ActionButton>
              )}
          </div>
        </>
      ) : (
        <p className="text-xs">
          The desk confirmed this is the same patient. Saved in the activity
          log
          {file.identityOverrideAt
            ? ` · ${formatIST(file.identityOverrideAt)} IST`
            : ""}
          .
        </p>
      )}
    </div>
  );
}
