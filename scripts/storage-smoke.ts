import "./env";
import { putDocument, readDocument } from "../src/server/storage";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

async function main() {
  const bytes = await readFile("seed/files/preauth-form.pdf");
  const stored = await putDocument({
    claimId: randomUUID(),
    fileName: "synthetic-smoke.pdf",
    mimeType: "application/pdf",
    bytes,
  });
  const result = await readDocument(stored.pathname);
  if (!result || result.statusCode !== 200)
    throw new Error("Private blob read failed");
  const downloaded = Buffer.from(
    await new Response(result.stream).arrayBuffer(),
  );
  const sha = (buffer: Buffer) =>
    createHash("sha256").update(buffer).digest("hex");
  if (sha(bytes) !== sha(downloaded))
    throw new Error("Private blob round trip differs");
  console.log(
    JSON.stringify({
      privateRoundTrip: "PASS",
      bytes: bytes.byteLength,
      sha256: sha(downloaded),
    }),
  );
}
main().catch(() => {
  console.error("Private storage smoke failed");
  process.exitCode = 1;
});
