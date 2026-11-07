import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import sharp from "sharp";
import {
  DOCUMENT_CATALOGUE,
  PROCEDURES,
  SEED_CLAIMS,
  seedAdmission,
  seedFields,
  type SeedClaim,
} from "../seed/data";

export async function syntheticPdf(
  key: string,
  claim: SeedClaim,
  reportDate = "2026-11-07",
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Synthetic ${key} - ${claim.code}`);
  pdf.setCreationDate(new Date("2026-11-07T00:00:00Z"));
  pdf.setModificationDate(new Date("2026-11-07T00:00:00Z"));
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const handwritten = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const label = DOCUMENT_CATALOGUE.find(([type]) => type === key)?.[1] ?? key;
  page.drawText("SAHYADRI DEMO HOSPITAL", {
    x: 45,
    y: 790,
    size: 19,
    font: bold,
    color: rgb(0.12, 0.2, 0.25),
  });
  page.drawText("Nashik | Fictional care facility | Insurance desk", {
    x: 45,
    y: 769,
    size: 10,
    font: regular,
  });
  page.drawLine({
    start: { x: 45, y: 752 },
    end: { x: 550, y: 752 },
    color: rgb(0.7, 0.75, 0.8),
  });
  page.drawText(label.toUpperCase(), { x: 45, y: 720, size: 15, font: bold });
  const common = [
    `Patient: ${claim.name}   |   Age: ${claim.age}   |   Gender: ${claim.gender}`,
    `Claim reference: ${claim.code}   |   UHID: SYN-${claim.code.slice(4)}`,
    `Report date: ${reportDate}`,
    `Treating doctor: Dr. Kavita Bendre`,
  ];
  const content: Record<string, string[]> = {
    PREAUTH_FORM: Object.entries(seedFields(claim, seedAdmission(claim))).map(
      ([field, value]) => `${field.replaceAll("_", " ")}: ${value}`,
    ),
    PHOTO_ID: [
      "SYNTHETIC IDENTITY CARD - NOT A GOVERNMENT DOCUMENT",
      `Name: ${claim.name}`,
      `Age: ${claim.age}; Gender: ${claim.gender}`,
      "Identifier: DEMO-0000-0000",
    ],
    POLICY_CARD: [
      `Member: ${claim.name}`,
      `Policy number: SYN-${claim.code.slice(4)}-2026`,
      "Plan: Fictional family health cover",
      "Sum insured: INR 5,00,000",
      "Coverage shown for demonstration only",
    ],
    DOCTOR_NOTES: [
      `Provisional diagnosis: ${PROCEDURES[claim.procedure].diagnosis}`,
      ...(seedFields(
        claim,
        seedAdmission(claim),
      ).clinical_history_summary.match(/.{1,75}(?:\s|$)/g) ?? []),
      "Vitals stable. Admit for monitoring and treatment.",
      "Discussed plan and estimated costs with family.",
      `Proposed procedure: ${PROCEDURES[claim.procedure].name}`,
      "Dr Kavita Bendre / signed for synthetic demonstration",
    ],
    ULTRASOUND_REPORT: [
      "USG abdomen",
      "Gall bladder: multiple mobile echogenic calculi.",
      "Largest calculus measures 12 mm. No biliary dilatation.",
      "Impression: Cholelithiasis. Clinical correlation advised.",
    ],
    XRAY_REPORT: [
      "X-ray bilateral knees, AP and lateral views",
      "Medial joint space narrowing with osteophytes.",
      "Impression: Advanced degenerative osteoarthritis.",
    ],
    MRI_REPORT: [
      "MRI knee - synthetic report",
      "Degenerative changes. No acute fracture.",
    ],
    CBC_REPORT: [
      "Haemoglobin: 12.5 g/dL (reference 12-16)",
      "Total WBC: 4,200 /uL (reference 4,000-11,000)",
      "Platelets: 62,000 /uL (reference 150,000-450,000)",
      "Flag: Thrombocytopenia. Review with treating physician.",
    ],
    PLATELET_COUNT: [
      "HAEMATOLOGY - PLATELET COUNT",
      `Sample collected: ${reportDate} at 08:00 IST`,
      "Platelet count: 48,000 /uL",
      "Reference range: 150,000 - 450,000 /uL",
      "Low result verified on peripheral smear.",
      "Repeat monitoring as clinically indicated.",
    ],
    COST_ESTIMATE: [
      `Treatment: ${PROCEDURES[claim.procedure].name}`,
      `Estimated cost: INR ${claim.amount.toLocaleString("en-IN")}`,
      "Includes room, nursing, procedure, pharmacy and investigations.",
      "Final bill depends on clinical course. Not a receipt.",
    ],
    DISCHARGE_SUMMARY: [
      `Final diagnosis: ${PROCEDURES[claim.procedure].diagnosis}`,
      "Condition at discharge: stable",
      "Follow-up in seven days. Medication counselling completed.",
    ],
    FINAL_BILL: [
      `Total hospital bill: INR ${claim.amount.toLocaleString("en-IN")}`,
      "Room and nursing: 20% | Procedure: 50%",
      "Pharmacy: 20% | Investigations: 10%",
      "Synthetic bill. Not valid for reimbursement.",
    ],
    INVESTIGATION_BILLS: [
      "Laboratory and imaging receipts",
      "CBC: INR 650 | Imaging: INR 1,800",
      "Synthetic receipt. No payment taken.",
    ],
  };
  let y = 686;
  for (const line of [
    ...common,
    "",
    ...(content[key] ?? ["Supporting document"]),
  ]) {
    const chunks = line.match(/.{1,78}(?:\s|$)|.{1,78}/g) ?? [""];
    for (const chunk of chunks) {
      page.drawText(chunk.trim(), {
        x: 45,
        y,
        size: key === "DOCTOR_NOTES" ? 13 : 11,
        font: key === "DOCTOR_NOTES" ? handwritten : regular,
        color:
          key === "DOCTOR_NOTES" ? rgb(0.1, 0.2, 0.4) : rgb(0.15, 0.15, 0.15),
        rotate: key === "DOCTOR_NOTES" ? degrees(-0.7) : undefined,
      });
      y -= 23;
    }
  }
  page.drawLine({
    start: { x: 45, y: 100 },
    end: { x: 550, y: 100 },
    color: rgb(0.7, 0.75, 0.8),
  });
  page.drawText("SYNTHETIC — FICTIONAL PATIENT", {
    x: 45,
    y: 75,
    size: 14,
    font: bold,
    color: rgb(0.6, 0.15, 0.15),
  });
  page.drawText(
    "For software demonstration only. No real patient or insurer information.",
    { x: 45, y: 55, size: 9, font: regular },
  );
  return pdf.save();
}
async function main() {
  await mkdir("seed/files", { recursive: true });
  let count = 0;
  for (const claim of SEED_CLAIMS)
    for (const key of claim.docs) {
      const date =
        claim.code === "CLM-3385" && key === "PLATELET_COUNT"
          ? "2026-11-04"
          : "2026-11-07";
      await writeFile(
        `seed/files/${claim.code}-${key}.pdf`,
        await syntheticPdf(key, claim, date),
      );
      count++;
    }
  await writeFile(
    "seed/files/preauth-form.pdf",
    await syntheticPdf("PREAUTH_FORM", SEED_CLAIMS[0]),
  );
  const lines = [
    "Sahyadri Demo Hospital - Admission note",
    "Patient: Imran Shaikh, 31/M",
    "Date: 07 Nov 2026",
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
    `Generated ${count + 1} synthetic PDFs and one handwritten-style PNG.`,
  );
}
if (process.argv[1]?.endsWith("generate-seed-pdfs.ts"))
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Fixture generation failed",
    );
    process.exitCode = 1;
  });
