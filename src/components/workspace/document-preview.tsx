"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { X, ExternalLink } from "lucide-react";
import type { WorkspaceDocument } from "@/server/workspace";
export function FileContent({
  file,
}: {
  file: Pick<WorkspaceDocument, "id" | "fileName" | "mimeType">;
}) {
  const url = `/api/documents/${file.id}/file`;
  return file.mimeType === "application/pdf" ? (
    <iframe src={`${url}#view=FitH&navpanes=0`} title={`Preview of ${file.fileName}`} />
  ) : (
    <Image
      unoptimized
      src={url}
      width={1000}
      height={1400}
      style={{ height: "auto" }}
      alt={`Document ${file.fileName}`}
    />
  );
}
export function DocumentLink({
  file,
  className = "document-name text-link",
}: {
  file: Pick<WorkspaceDocument, "id" | "fileName" | "mimeType">;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  function close() {
    ref.current?.close();
    setOpen(false);
  }
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setOpen(true);
          ref.current?.showModal();
        }}
      >
        {file.fileName}
      </button>
      <dialog
        aria-label={`Preview ${file.fileName}`}
        ref={ref}
        className="preview-sheet"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <header>
          <strong className="text-sm break-all">{file.fileName}</strong>
          <div className="button-row">
            <a
              href={`/api/documents/${file.id}/file?download=1`}
              className="btn small"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} />
              Download
            </a>
            <button
              className="btn small"
              type="button"
              onClick={close}
              aria-label="Close document preview"
            >
              <X size={16} />
            </button>
          </div>
        </header>
        {open && <FileContent file={file} />}
      </dialog>
    </>
  );
}
