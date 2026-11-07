import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { SEED_CLAIMS } from "../seed/data";
import { syntheticPdf } from "../seed/pdf";

async function main() {
  const now = new Date();
  await mkdir("seed/files", { recursive: true });
  let count = 0;
  for (const claim of SEED_CLAIMS)
    for (const key of claim.docs) {
      await writeFile(
        `seed/files/${claim.code}-${key}.pdf`,
        await syntheticPdf(key, claim, now),
      );
      count++;
    }
  await writeFile(
    "seed/files/preauth-form.pdf",
    await syntheticPdf("PREAUTH_FORM", SEED_CLAIMS[0], now),
  );
  await writeFile(
    "seed/files/CLM-3381-ULTRASOUND_REPORT.pdf",
    await syntheticPdf("ULTRASOUND_REPORT", SEED_CLAIMS[0], now),
  );
  const lines = [
    "Sahyadri Demo Hospital - Admission note",
    "Patient: Imran Shaikh, 31/M",
    `Date: ${now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" })}`,
    "Fever x 4 days. NS1 positive.",
    "Platelets falling, 48,000 /uL.",
    "No active bleeding. Vitals stable.",
    "Dx: Dengue with thrombocytopenia",
    "Admit for IV fluids & serial CBC.",
    "Dr. Kavita Bendre",
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000"><rect width="1200" height="1000" fill="#fffdf5"/>${Array.from({ length: 13 }, (_, i) => `<path d="M60 ${110 + i * 62}H1140" stroke="#d6e1ec"/>`).join("")}<g fill="#1c355b" font-family="URW Bookman,DejaVu Serif,serif" font-style="italic" font-size="34">${lines.map((line, i) => `<text x="80" y="${110 + i * 75}" transform="rotate(${i % 2 ? -0.6 : 0.4} 80 ${110 + i * 75})">${line.replaceAll("&", "&amp;")}</text>`).join("")}</g><text x="80" y="940" font-family="sans-serif" font-size="28" fill="#a22">SYNTHETIC — FICTIONAL PATIENT</text></svg>`;
  await sharp(Buffer.from(svg))
    .png()
    .toFile("seed/files/handwritten-notes.png");
  console.log(
    `Generated ${count + 2} synthetic PDFs and one handwritten-style PNG.`,
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Fixture generation failed",
  );
  process.exitCode = 1;
});
