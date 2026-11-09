"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import {
  FILE_MIME_TYPES,
  FILE_SIZE_ERROR,
  MAX_FILE_BYTES,
} from "@/domain/document-upload";

async function compressImage(file: File) {
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Could not resize this photo. Upload a smaller scan.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Could not resize this photo. Upload a smaller scan.")),
        "image/jpeg",
        0.85,
      ),
    );
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } finally {
    image.close();
  }
}

function sendFile(body: FormData, update: (state: string) => void) {
  return new Promise<Response>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/documents/upload");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        update(`Uploading · ${Math.round((event.loaded / event.total) * 100)}%`);
    };
    request.upload.onload = () => update("Uploaded. The AI is reading it…");
    request.onload = () =>
      resolve(new Response(request.responseText, { status: request.status }));
    request.onerror = () => reject(new TypeError("The connection was lost."));
    request.send(body);
  });
}
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
      if (!FILE_MIME_TYPES.some((type) => type === file.type)) {
        update("Use a PDF, JPG, PNG or WebP file.", true);
        continue;
      }
      if (!file.size) {
        update("This file is empty. Choose another file.", true);
        continue;
      }
      update("Getting ready to upload…");
      try {
        let prepared = file;
        if (file.size > MAX_FILE_BYTES && file.type.startsWith("image/")) {
          update("Resizing photo…");
          prepared = await compressImage(file);
        }
        if (prepared.size > MAX_FILE_BYTES) throw new Error(FILE_SIZE_ERROR);
        const body = new FormData();
        body.set("claimId", claimId);
        body.set("file", prepared);
        const response = await sendFile(body, update);
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Upload failed. Retry this file.");
        if (result.status === "FAILED") {
          update(
            "Saved, but the AI could not read it. Try AI again or sort it yourself.",
            true,
          );
          toast.warning("File saved. The AI could not read it.");
        } else {
          update("AI sorted · needs confirmation");
          toast.success(
            "Document uploaded. Check what the AI suggests, then confirm.",
          );
        }
        router.refresh();
      } catch (error) {
        update(
          error instanceof TypeError
            ? "The connection was lost. The file may already be saved. Check the checklist before you try again."
            : error instanceof Error
              ? error.message
              : "Upload failed. Please retry.",
          true,
        );
        // The server may have finished even though the response was lost.
        router.refresh();
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
      <small>AI suggests what each file is. You check and confirm it.</small>
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
      <small className="block mt-2">PDF, JPG, PNG or WebP. Up to 4 MB per file. Large photos are resized before upload.</small>
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
