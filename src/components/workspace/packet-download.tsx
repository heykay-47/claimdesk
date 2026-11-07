"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import type { Stage } from "@/domain/checklist";

export function PacketDownload({
  code,
  blockers,
  stage,
}: {
  code: string;
  blockers: number;
  stage: Stage;
}) {
  const [pending, setPending] = useState(false);
  return (
    <div>
      <button
        className="btn small"
        type="button"
        disabled={pending}
        onClick={async () => {
          if (
            blockers &&
            !window.confirm(
              `This packet has ${blockers} unresolved ${blockers === 1 ? "blocker" : "blockers"}. The cover will list them. Download the incomplete packet? Nothing is sent to the payer.`,
            )
          )
            return;
          setPending(true);
          try {
            const response = await fetch(
              `/api/claims/${encodeURIComponent(code)}/packet`,
              { cache: "no-store" },
            );
            if (!response.ok) {
              const result = await response
                .json()
                .catch(() => ({ error: "Packet unavailable. Try again." }));
              throw new Error(result.error ?? "Packet unavailable. Try again.");
            }
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement("a");
            link.href = url;
            link.download = `${code}-${stage.toLowerCase()}-packet.pdf`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast.success("Packet downloaded. Nothing was sent to the payer.");
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Packet unavailable. Try again.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <Download size={14} />
        {pending ? "Preparing packet…" : "Download packet"}
      </button>
      <p className={`text-xs mt-2 ${blockers ? "warning-text" : "muted"}`}>
        {stage === "PREAUTH"
          ? "Pre-auth"
          : stage === "DISCHARGE"
            ? "Discharge"
            : "Enhancement"}
        {blockers
          ? ` · Incomplete, ${blockers} ${blockers === 1 ? "blocker" : "blockers"} on cover`
          : " · Confirmed files only"}
      </p>
    </div>
  );
}
