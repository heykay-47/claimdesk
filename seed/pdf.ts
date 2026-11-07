import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { PREAUTH_FIELDS } from "../src/domain/preauth-fields";
import {
  DOCUMENT_CATALOGUE,
  PAYERS,
  PROCEDURES,
  seedAdmission,
  seedFields,
  type SeedClaim,
} from "./data";

export function seedReportDate(claim: SeedClaim, key: string, now: Date) {
  const date = new Date(
    now.getTime() -
      (claim.code === "CLM-3385" && key === "PLATELET_COUNT"
        ? 70 * 3600000
        : 0),
  );
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    date,
  );
}
export async function syntheticPdf(
  key: string,
  claim: SeedClaim,
  now = new Date(),
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(
    `${DOCUMENT_CATALOGUE.find(([type]) => type === key)?.[1] ?? key} - ${claim.code} - Synthetic`,
  );
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const ink = rgb(0.12, 0.17, 0.21);
  const muted = rgb(0.38, 0.42, 0.45);
  const line = rgb(0.82, 0.85, 0.86);
  const date = seedReportDate(claim, key, now);
  const fields = seedFields(claim, seedAdmission(claim, now));
  let y = 789;
  function text(
    value: string,
    x: number,
    at: number,
    size = 10,
    font = regular,
    color = ink,
  ) {
    page.drawText(value, { x, y: at, size, font, color });
  }
  function wrap(value: string, width: number, size: number, font: PDFFont) {
    const rows: string[] = [];
    let row = "";
    for (const word of value.split(/\s+/)) {
      const next = row ? `${row} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && row) {
        rows.push(row);
        row = word;
      } else row = next;
    }
    if (row) rows.push(row);
    return rows;
  }
  function section(title: string) {
    y -= 23;
    text(title.toUpperCase(), 44, y, 9, bold, muted);
    y -= 14;
  }
  function paragraph(value: string, hand = false) {
    const font = hand ? italic : regular;
    const size = hand ? 13 : 10.5;
    for (const row of wrap(value, 505, size, font)) {
      text(row, 44, y, size, font, hand ? rgb(0.12, 0.24, 0.39) : ink);
      y -= hand ? 23 : 17;
    }
    y -= 7;
  }
  function grid(rows: [string, string][], columns = 2) {
    const width = 507 / columns;
    for (let index = 0; index < rows.length; index += columns) {
      const group = rows.slice(index, index + columns);
      const height =
        Math.max(
          ...group.map(
            ([, value]) => wrap(value, width - 24, 10.5, regular).length,
          ),
        ) *
          15 +
        28;
      group.forEach(([label, value], column) => {
        const x = 44 + column * width;
        page.drawRectangle({
          x,
          y: y - height,
          width,
          height,
          borderColor: line,
          borderWidth: 0.6,
        });
        text(`${label}:`, x + 10, y - 14, 8, regular, muted);
        wrap(value, width - 24, 10.5, regular).forEach((row, i) =>
          text(row, x + 10, y - 31 - i * 15, 10.5),
        );
      });
      y -= height;
    }
  }
  function table(headers: string[], rows: string[][], widths: number[]) {
    page.drawRectangle({
      x: 44,
      y: y - 27,
      width: 507,
      height: 27,
      color: rgb(0.94, 0.96, 0.96),
    });
    let x = 54;
    headers.forEach((header, i) => {
      text(header, x, y - 17, 9, bold);
      x += widths[i];
    });
    y -= 27;
    rows.forEach((row) => {
      let x = 54;
      row.forEach((value, i) => {
        text(value, x, y - 20, 10);
        x += widths[i];
      });
      y -= 34;
      page.drawLine({
        start: { x: 44, y },
        end: { x: 551, y },
        color: line,
        thickness: 0.6,
      });
    });
  }
  text("SAHYADRI DEMO HOSPITAL", 44, y, 19, bold);
  text(
    "Fictional multispeciality hospital | Nashik, Maharashtra",
    44,
    y - 20,
    9,
    regular,
    muted,
  );
  text(
    "Insurance & patient services | DEMO FACILITY",
    44,
    y - 35,
    8,
    regular,
    muted,
  );
  page.drawLine({
    start: { x: 44, y: 736 },
    end: { x: 551, y: 736 },
    color: ink,
  });
  text(
    (
      DOCUMENT_CATALOGUE.find(([type]) => type === key)?.[1] ?? key
    ).toUpperCase(),
    44,
    710,
    13,
    bold,
  );
  text(`${claim.code} | ${date}`, 44, 691, 9, regular, muted);
  y = 670;
  grid([
    ["Patient name", claim.name],
    ["Age / sex", `${claim.age} years / ${claim.gender}`],
    ["UHID", `SYN-${claim.code.slice(4)}`],
    ["Treating doctor", "Dr. Kavita Bendre"],
  ]);

  switch (key) {
    case "PREAUTH_FORM":
      section("Cashless treatment request");
      grid(
        PREAUTH_FIELDS.filter(
          (field) => field.key !== "clinical_history_summary",
        ).map((field) => [
          field.label,
          fields[field.key as keyof typeof fields],
        ]),
      );
      section("Clinical history");
      paragraph(fields.clinical_history_summary);
      break;
    case "DOCTOR_NOTES":
      section("Admission details");
      grid([
        ["Age", String(claim.age)],
        ["Gender", claim.gender],
        ["Policy number", fields.policy_number],
        ["Estimated cost", String(claim.amount)],
      ]);
      section("Admission and progress notes");
      paragraph(`Date of admission: ${fields.date_of_admission}`, true);
      paragraph(
        `Provisional diagnosis: ${fields.provisional_diagnosis}. ICD-10: ${fields.icd10_code}.`,
        true,
      );
      paragraph(fields.clinical_history_summary, true);
      paragraph(
        `Plan: ${fields.proposed_procedure}. Vitals stable. Discussed treatment and estimated cost of INR ${claim.amount.toLocaleString("en-IN")} with the family.`,
        true,
      );
      paragraph(
        "Continue monitoring. Review investigations before procedure. No active bleeding at the time of examination.",
        true,
      );
      break;
    case "CBC_REPORT":
    case "PLATELET_COUNT":
      section("Department of laboratory medicine");
      paragraph(
        `Specimen: EDTA whole blood | Collected: ${date}, 08:00 IST | Method: Automated analyser with smear review.`,
      );
      table(
        ["Investigation", "Result", "Unit", "Reference interval"],
        key === "CBC_REPORT"
          ? [
              ["Haemoglobin", "12.5", "g/dL", "12.0 - 16.0"],
              ["Total leucocyte count", "4,200", "/uL", "4,000 - 11,000"],
              ["Platelet count", "62,000  LOW", "/uL", "150,000 - 450,000"],
            ]
          : [["Platelet count", "48,000  LOW", "/uL", "150,000 - 450,000"]],
        [190, 105, 60, 142],
      );
      section("Laboratory comment");
      paragraph(
        "Thrombocytopenia. Low platelet count verified on peripheral smear. Correlate with clinical findings and repeat monitoring as advised by the treating physician.",
      );
      break;
    case "ULTRASOUND_REPORT":
      section("Department of radiology");
      paragraph(
        "Examination: Ultrasound abdomen and pelvis. Real-time grayscale examination performed with a curvilinear transducer.",
      );
      section("Findings");
      paragraph(
        "Liver is normal in size and echotexture. Gall bladder contains multiple mobile echogenic calculi with posterior acoustic shadowing, the largest measuring 12 mm. No intrahepatic biliary dilatation. Common bile duct is not dilated. Kidneys and visualised pancreas are unremarkable. No free fluid.",
      );
      section("Impression");
      paragraph(
        "Cholelithiasis. No sonographic evidence of biliary obstruction. Correlate clinically with right upper quadrant pain and the treating surgeon's assessment.",
      );
      break;
    case "XRAY_REPORT":
    case "MRI_REPORT":
      section("Department of radiology");
      paragraph(
        key === "XRAY_REPORT"
          ? "Examination: Bilateral knees, anteroposterior and lateral views. Medial compartment joint-space narrowing, marginal osteophytes and subchondral sclerosis. No acute fracture."
          : "Examination: MRI knee. Degenerative articular cartilage thinning with marginal osteophytes. No acute fracture or focal marrow lesion.",
      );
      section("Impression");
      paragraph(
        "Advanced degenerative osteoarthritis. Orthopaedic review advised.",
      );
      break;
    case "PHOTO_ID":
      section("Demo patient identity record");
      grid([
        ["Patient name", claim.name],
        ["Age", String(claim.age)],
        ["Gender", claim.gender],
        ["Identifier", "DEMO-0000-0000"],
      ]);
      section("Identity statement");
      paragraph(
        "Fictional hospital identity record for a software demonstration. This is not a government identity document and cannot be used as proof of identity.",
      );
      break;
    case "POLICY_CARD":
      section("Fictional health cover membership");
      grid([
        ["Member", claim.name],
        ["Policy number", fields.policy_number],
        ["Payer", PAYERS[claim.payer].name],
        ["Sum insured", "INR 5,00,000"],
        ["Plan", "Demo family health cover"],
        ["Member category", "Principal insured"],
      ]);
      section("Cover note");
      paragraph(
        "Coverage is shown for demonstration only. No insurance contract exists for this fictional member.",
      );
      break;
    case "COST_ESTIMATE":
    case "FINAL_BILL":
      section(
        key === "FINAL_BILL"
          ? "Patient billing statement"
          : "Proposed treatment estimate",
      );
      paragraph(
        `${PROCEDURES[claim.procedure].name} | ${key === "FINAL_BILL" ? "Final" : "Estimated"} cost in INR.`,
      );
      table(
        ["Particulars", "Amount (INR)"],
        [
          [
            "Room, nursing and ward services",
            (claim.amount * 0.2).toLocaleString("en-IN"),
          ],
          [
            "Procedure, surgeon and anaesthetist fees",
            (claim.amount * 0.5).toLocaleString("en-IN"),
          ],
          [
            "Pharmacy and consumables",
            (claim.amount * 0.2).toLocaleString("en-IN"),
          ],
          [
            "Laboratory and imaging",
            (claim.amount * 0.1).toLocaleString("en-IN"),
          ],
          ["Total", claim.amount.toLocaleString("en-IN")],
        ],
        [365, 142],
      );
      section("Billing note");
      paragraph(
        "Synthetic statement. No payment taken. Not valid for reimbursement. Estimates may vary with the clinical course.",
      );
      break;
    case "DISCHARGE_SUMMARY":
      section("Inpatient discharge record");
      grid([
        ["Final diagnosis", fields.provisional_diagnosis],
        ["Treatment", fields.proposed_procedure],
        ["Condition at discharge", "Stable"],
        ["Follow-up", "Review in seven days"],
      ]);
      section("Clinical course and advice");
      paragraph(
        "Inpatient treatment completed without recorded complication. Medication counselling and warning signs explained to the patient. Return immediately for fever, bleeding, severe pain or breathlessness. Follow the treating doctor's prescription.",
      );
      break;
    default:
      section(
        key === "IMPLANT_INVOICE"
          ? "Implant supply record"
          : "Diagnostic investigation receipts",
      );
      table(
        ["Description", "Reference", "Amount (INR)"],
        key === "IMPLANT_INVOICE"
          ? [["Demo knee prosthesis", "SYN-IMPLANT-001", "45,000"]]
          : [
              ["Complete blood count", "LAB-SYN-001", "650"],
              ["Abdominal imaging", "RAD-SYN-002", "1,800"],
            ],
        [255, 145, 107],
      );
      section("Statement");
      paragraph(
        "Fictional item and reference numbers. No goods supplied and no payment taken.",
      );
  }
  const signatureY = Math.min(y - 25, 170);
  page.drawLine({
    start: { x: 350, y: signatureY },
    end: { x: 551, y: signatureY },
    color: line,
  });
  text(
    key === "CBC_REPORT" || key === "PLATELET_COUNT"
      ? "Dr. Neha Desai, MD Pathology"
      : key.includes("REPORT")
        ? "Dr. R. Kulkarni, MD Radiology"
        : "Dr. Kavita Bendre / Authorised desk",
    350,
    signatureY - 15,
    9,
    italic,
  );
  text(
    "Signature line | Synthetic document",
    350,
    signatureY - 29,
    8,
    regular,
    muted,
  );
  page.drawLine({
    start: { x: 44, y: 87 },
    end: { x: 551, y: 87 },
    color: line,
  });
  text(
    "SYNTHETIC — FICTIONAL PATIENT",
    44,
    65,
    12,
    bold,
    rgb(0.62, 0.15, 0.15),
  );
  text(
    "For software demonstration only. No real patient or insurer information.",
    44,
    48,
    8,
    regular,
    muted,
  );
  return pdf.save();
}
