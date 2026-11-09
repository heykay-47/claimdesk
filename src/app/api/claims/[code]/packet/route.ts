import { z } from "zod";
import { requireUser, AuthenticationError } from "@/server/auth";
import { claimFile } from "@/server/workspace";
import { audit } from "@/server/audit";
import { readDocument } from "@/server/storage";
import { buildPacket, PacketError } from "@/server/packet-pdf";
import { PREAUTH_FIELDS } from "@/domain/preauth-fields";
import { blockerText } from "@/domain/checklist-labels";
import { hasIdentityMismatch } from "@/domain/identity";

export const maxDuration = 60;
export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await requireUser();
    const code = z
      .string()
      .regex(/^CLM-[A-Z0-9-]{1,40}$/)
      .safeParse((await context.params).code);
    if (!code.success)
      return Response.json(
        { error: "Claim not found" },
        { status: 404, headers },
      );
    const file = await claimFile(code.data);
    const order = new Map(
      file.resolved.map((rule, index) => [rule.documentTypeId, index]),
    );
    const confirmed = file.files
      .filter(
        (document) =>
          document.status === "CONFIRMED" && !hasIdentityMismatch(document),
      )
      .sort(
        (a, b) =>
          (order.get(a.documentTypeId ?? "") ?? Infinity) -
            (order.get(b.documentTypeId ?? "") ?? Infinity) ||
          a.uploadedAt.getTime() - b.uploadedAt.getTime() ||
          a.fileName.localeCompare(b.fileName),
      );
    if (
      confirmed.length > 100 ||
      confirmed.reduce((total, document) => total + document.sizeBytes, 0) >
        50 * 1024 * 1024
    )
      throw new PacketError(
        "The packet exceeds 100 files or 50 MB. Download files individually.",
      );
    const attachments = [];
    for (const document of confirmed) {
      const stored = await readDocument(document.id);
      if (!stored)
        throw new PacketError(
          `File unavailable: ${document.fileName}. Try again or download the file individually.`,
        );
      attachments.push({
        id: document.id,
        fileName: document.fileName,
        mimeType: document.mimeType,
        bytes: stored.bytes,
      });
    }
    const generatedAt = new Date();
    const packet = await buildPacket(
      {
        code: file.claim.code,
        patient: `${file.claim.patientName}, ${file.claim.patientAge} years, ${file.claim.patientGender}`,
        payer: file.payer.name,
        policy: file.claim.policyNumber,
        procedure: file.procedure.name,
        stage: file.stage,
        preparedBy: user.name,
        generatedAt,
        blockers: file.checklist.blockers.map((blocker) =>
          blockerText(blocker, file.ref.types),
        ),
        checklist: file.resolved.map((rule) => ({
          label:
            file.ref.types.find((type) => type.id === rule.documentTypeId)
              ?.label ?? "Document",
          requirement: rule.requirement,
          state:
            rule.requirement === "WAIVED"
              ? "WAIVED"
              : (file.checklist.slots.find((slot) => slot.rule.id === rule.id)
                  ?.state ?? "MISSING"),
        })),
        fields: PREAUTH_FIELDS.flatMap((definition) => {
          const field = file.fields.find(
            (field) =>
              field.fieldKey === definition.key &&
              field.status === "CONFIRMED" &&
              file.files.some(
                (document) =>
                  document.id === field.documentId &&
                  !hasIdentityMismatch(document),
              ),
          );
          return field ? [{ label: definition.label, value: field.value }] : [];
        }),
      },
      attachments,
    );
    await audit({
      actorId: user.id,
      action: "PACKET_DOWNLOAD",
      entityType: "claim",
      entityId: file.claim.id,
      detail: {
        stage: file.stage,
        ready: file.checklist.ready,
        blockerCount: file.checklist.blockers.length,
        documentIds: confirmed.map((document) => document.id),
        generatedAt: generatedAt.toISOString(),
        pages: packet.totalPages,
      },
    });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(packet.bytes);
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.claim.code}-${file.stage.toLowerCase()}-packet.pdf"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError)
      return Response.json(
        { error: "Sign in to download this packet" },
        { status: 401, headers },
      );
    if (error instanceof PacketError)
      return Response.json({ error: error.message }, { status: 422, headers });
    throw error;
  }
}
