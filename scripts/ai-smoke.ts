import "./env";
import { readFile } from "node:fs/promises";
import { GeminiAiClient } from "../src/ai/gemini";
import { DOCUMENT_CATALOGUE, seedId } from "../seed/data";
async function main() {
  const client = new GeminiAiClient(
    undefined,
    Number(process.env.AI_SMOKE_TIMEOUT_MS ?? 25_000),
  );
  const catalogue = DOCUMENT_CATALOGUE.map(([key, label, aiHint]) => ({
    id: seedId(`type:${key}`),
    key,
    label,
    aiHint,
  }));
  for (const [file, mime] of [
    ["preauth-form.pdf", "application/pdf"],
    ["handwritten-notes.png", "image/png"],
  ]) {
    try {
      const result = await client.classifyAndExtract(
        await readFile(`seed/files/${file}`),
        mime,
        catalogue,
      );
      console.log(JSON.stringify({ file, result }, null, 2));
    } catch (error) {
      // The provider message may contain request data, so the smoke report uses only its status.
      const status =
        error instanceof Error && "status" in error ? error.status : undefined;
      console.error(
        JSON.stringify({
          file,
          failed: true,
          errorType: error instanceof Error ? error.name : "Unknown",
          status,
        }),
      );
      process.exitCode = 1;
    }
  }
}
main().catch(() => {
  console.error("AI smoke could not start");
  process.exitCode = 1;
});
