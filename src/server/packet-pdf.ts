import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { formatIST } from "@/domain/format";

export type PacketCover = {
  code: string;
  patient: string;
  payer: string;
  procedure: string;
  policy: string;
  stage: string;
  preparedBy: string;
  generatedAt: Date;
  blockers: string[];
  checklist: { label: string; requirement: string; state: string }[];
  fields: { label: string; value: string }[];
};
export type PacketAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};
export class PacketError extends Error {}

export async function buildPacket(
  cover: PacketCover,
  files: readonly PacketAttachment[],
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${cover.code} ${cover.stage} packet`);
  pdf.setAuthor(cover.preparedBy);
  pdf.setCreationDate(cover.generatedAt);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const charset = new Set(font.getCharacterSet());
  const clean = (text: string) =>
    [...text.replaceAll("₹", "INR ").replaceAll("\t", " ")]
      .map((character) =>
        charset.has(character.codePointAt(0)!) ? character : "?",
      )
      .join("");
  let page = pdf.addPage([595, 842]);
  let y = 0;
  function newCoverPage(first = false) {
    if (!first) page = pdf.addPage([595, 842]);
    page.drawText("CLAIMDESK | CLAIM PACKET", {
      x: 44,
      y: 795,
      size: 15,
      font: bold,
      color: rgb(0.08, 0.3, 0.29),
    });
    page.drawText(
      `${cover.code} | ${cover.stage}${first ? "" : " | continued"}`,
      { x: 44, y: 773, size: 9, font },
    );
    page.drawLine({
      start: { x: 44, y: 755 },
      end: { x: 551, y: 755 },
      color: rgb(0.82, 0.85, 0.85),
    });
    page.drawText("SYNTHETIC — FICTIONAL PATIENT", {
      x: 44,
      y: 48,
      size: 10,
      font: bold,
      color: rgb(0.62, 0.15, 0.15),
    });
    page.drawText(
      "Prepared for manual review. Nothing has been sent to a payer.",
      { x: 44, y: 32, size: 8, font },
    );
    y = 732;
  }
  function write(value: string, heading = false, danger = false) {
    const size = heading ? 11 : 9.5;
    const face = heading ? bold : font;
    const lines: string[] = [];
    for (const paragraph of value.split("\n")) {
      let line = "";
      for (const char of clean(paragraph)) {
        if (face.widthOfTextAtSize(line + char, size) > 500) {
          const space = line.lastIndexOf(" ");
          lines.push(space > 0 ? line.slice(0, space) : line);
          line = space > 0 ? line.slice(space + 1) : "";
        }
        line += char;
      }
      lines.push(line);
    }
    if (heading) y -= 9;
    for (const line of lines) {
      if (y < 90) newCoverPage();
      page.drawText(line, {
        x: 44,
        y,
        size,
        font: face,
        color: danger ? rgb(0.65, 0.12, 0.12) : rgb(0.12, 0.14, 0.16),
      });
      y -= 15;
    }
    y -= 2;
  }
  newCoverPage(true);
  if (cover.blockers.length) {
    write(
      `INCOMPLETE PACKET | ${cover.blockers.length} unresolved ${cover.blockers.length === 1 ? "blocker" : "blockers"}`,
      true,
      true,
    );
    cover.blockers.forEach((blocker) => write(`- ${blocker}`, false, true));
    write("Do not treat this export as clearance to submit.", false, true);
  } else write("CHECKLIST READY | Human review still required", true);
  write(`Patient: ${cover.patient}`);
  write(`Payer: ${cover.payer} | Policy: ${cover.policy}`);
  write(`Procedure: ${cover.procedure}`);
  write(`Prepared by: ${cover.preparedBy}`);
  write(`Generated: ${formatIST(cover.generatedAt)} IST`);
  write("Document checklist", true);
  cover.checklist.forEach((slot) =>
    write(`${slot.label} | ${slot.requirement} | ${slot.state}`),
  );
  write("Confirmed pre-auth fields", true);
  if (!cover.fields.length)
    write(
      "No confirmed pre-auth fields. Unconfirmed suggestions are excluded.",
    );
  cover.fields.forEach((field) => write(`${field.label}: ${field.value}`));
  write(`Included confirmed documents (${files.length})`, true);
  if (!files.length) write("No confirmed documents are available.");
  files.forEach((file, index) => write(`${index + 1}. ${file.fileName}`));
  const coverPages = pdf.getPageCount();
  for (const file of files) {
    try {
      if (pdf.getPageCount() >= 300)
        throw new PacketError(
          "The packet exceeds 300 pages. Download files individually.",
        );
      if (file.mimeType === "application/pdf") {
        const source = await PDFDocument.load(file.bytes);
        if (source.getPageCount() + pdf.getPageCount() > 300)
          throw new PacketError(
            "The packet exceeds 300 pages. Download files individually.",
          );
        const pages = await pdf.copyPages(source, source.getPageIndices());
        pages.forEach((page) => pdf.addPage(page));
      } else {
        const bytes =
          file.mimeType === "image/webp"
            ? await sharp(file.bytes).png().toBuffer()
            : file.bytes;
        const image =
          file.mimeType === "image/jpeg"
            ? await pdf.embedJpg(bytes)
            : await pdf.embedPng(bytes);
        const page = pdf.addPage([595, 842]);
        const size = image.scaleToFit(507, 720);
        page.drawImage(image, {
          x: (595 - size.width) / 2,
          y: (842 - size.height) / 2,
          ...size,
        });
        page.drawText("SYNTHETIC — FICTIONAL PATIENT", {
          x: 44,
          y: 35,
          size: 9,
          font: bold,
        });
      }
    } catch (error) {
      if (error instanceof PacketError) throw error;
      throw new PacketError(
        `Could not merge ${file.fileName}. Check that it is a readable PDF or image, or download it individually.`,
      );
    }
  }
  return {
    bytes: await pdf.save(),
    coverPages,
    totalPages: pdf.getPageCount(),
  };
}
