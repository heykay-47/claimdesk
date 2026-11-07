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
            Excluded from readiness, pre-auth values and the packet until
            resolved.
          </p>
          <div className="button-row">
            <ActionButton
              action="reviewDocument"
              values={{
                documentId: file.id,
                action: "REMOVE",
                confirmedRemoval: true,
              }}
              confirm="Remove this document and its extracted values from this claim? It will no longer be available in the claim or packet. The removal is audited."
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
                  confirm="Have you checked the source and verified that it belongs to this patient despite the identity difference? Your identity override will be recorded and this document will be confirmed."
                  success="Same patient confirmed. Identity override recorded."
                >
                  Same patient — confirm
                </ActionButton>
              )}
          </div>
        </>
      ) : (
        <p className="text-xs">
          Same patient confirmed by the desk. Audited override
          {file.identityOverrideAt
            ? ` · ${formatIST(file.identityOverrideAt)} IST`
            : ""}
          .
        </p>
      )}
    </div>
  );
}
