import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { AuthenticationError, requireUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { readDocument } from "@/server/storage";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const parsed = z.uuid().safeParse((await context.params).id);
    if (!parsed.success) return new Response("Not found", { status: 404 });
    const [document] = await db()
      .select()
      .from(documents)
      .where(eq(documents.id, parsed.data));
    if (!document || document.removedAt)
      return new Response("Not found", { status: 404 });
    const blob = await readDocument(document.blobPathname);
    if (!blob || blob.statusCode !== 200)
      return new Response("File not found", { status: 404 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    await audit({
      actorId: user.id,
      action: download ? "DOCUMENT_DOWNLOAD" : "DOCUMENT_VIEW",
      entityType: "document",
      entityId: document.id,
    });
    return new Response(blob.stream, {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError)
      return new Response("Unauthorized", { status: 401 });
    throw error;
  }
}
