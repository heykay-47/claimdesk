"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { put } from "@vercel/blob/client";
export function UploadZone({ claimId }: { claimId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<
    { name: string; state: string; error?: boolean }[]
  >([]);
  const router = useRouter();
  async function upload(files: File[]) {
    if (busy) return;
    if (files.length > 10) {
      toast.error("Upload up to 10 files at a time.");
      return;
    }
    setBusy(true);
    setProgress(files.map((file) => ({ name: file.name, state: "Waiting" })));
    for (const [index, file] of files.entries()) {
      const update = (state: string, error = false) =>
        setProgress((all) =>
          all.map((row, i) => (i === index ? { ...row, state, error } : row)),
        );
      if (
        file.size === 0 ||
        file.size > 10 * 1024 * 1024 ||
        !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
          file.type,
        )
      ) {
        update("Use PDF, JPG, PNG or WebP, up to 10 MB", true);
        continue;
      }
      update("Preparing private upload…");
      const metadata = {
        claimId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      };
      try {
        const permitResponse = await fetch("/api/documents/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "prepare", data: metadata }),
        });
        const permit = await permitResponse.json();
        if (!permitResponse.ok)
          throw new Error(
            permit.error ?? "Could not prepare upload. Try again.",
          );
        await put(permit.pathname, file, {
          access: "private",
          token: permit.token,
          contentType: file.type,
          multipart: file.size > 4 * 1024 * 1024,
          onUploadProgress: ({ percentage }) =>
            update(`Uploading privately · ${Math.round(percentage)}%`),
        });
        update("Uploaded · AI sorting…");
        const response = await fetch("/api/documents/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "complete",
            data: { ...metadata, uploadId: permit.uploadId },
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Upload failed. Retry this file.");
        if (result.status === "FAILED") {
          update(
            "Saved to unsorted · AI failed. Retry or sort manually.",
            true,
          );
          toast.warning("File saved. AI could not sort it.");
        } else {
          update("AI sorted · needs confirmation");
          toast.success("Document uploaded. Review the suggested slot.");
        }
        router.refresh();
      } catch (error) {
        update(
          error instanceof Error
            ? error.message
            : "Upload failed. Please retry.",
          true,
        );
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }
  return (
    <div
      id="upload"
      className={`upload-zone ${dragging ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void upload(Array.from(event.dataTransfer.files));
      }}
    >
      <Upload size={20} strokeWidth={1.5} className="mx-auto muted" />
      <p>Drop documents here</p>
      <small>AI suggests a slot. You make the final call.</small>
      <label className="block">
        <span className="sr-only">Upload documents</span>
        <input
          ref={input}
          aria-label="Upload documents"
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) =>
            void upload(Array.from(event.target.files ?? []))
          }
        />
      </label>
      <small className="block mt-2">PDF, JPG, PNG, WebP · 10 MB per file</small>
      {progress.length > 0 && (
        <ul className="upload-progress" aria-live="polite">
          {progress.map((row, index) => (
            <li key={index}>
              <strong>{row.name}</strong>
              <br />
              <span className={row.error ? "danger-text" : "muted"}>
                {row.state}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
