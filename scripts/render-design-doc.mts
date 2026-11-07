import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { marked } from "marked";
import { chromium } from "@playwright/test";

const docsDir = path.resolve("docs");
const source = path.join(docsDir, "technical-design.md");
const htmlOut = path.join(docsDir, ".technical-design.html");
const pdfOut = path.resolve(
  process.argv[2] ?? "docs/ClaimDesk-Technical-Design.pdf",
);

const markdown = await readFile(source, "utf8");
if (/\{\{[A-Z_]+\}\}/.test(markdown))
  throw new Error("technical-design.md still has {{PLACEHOLDER}} values");

const body = await marked.parse(markdown);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<base href="${pathToFileURL(docsDir + "/").href}">
<title>ClaimDesk Technical Design Document</title>
<style>
  @page { size: A4; margin: 18mm 16mm 18mm 16mm; }
  :root { --ink:#1c1917; --muted:#57534e; --line:#e7e5e4; --accent:#0f766e; }
  body { font: 10.5pt/1.55 "Geist", "Inter", "Segoe UI", Helvetica, Arial, sans-serif; color: var(--ink); }
  h1 { font-size: 22pt; margin: 0 0 6pt; letter-spacing: -0.01em; }
  h2 { font-size: 14pt; margin: 22pt 0 6pt; padding-top: 8pt; border-top: 1px solid var(--line); break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 14pt 0 4pt; break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  a { color: var(--accent); text-decoration: none; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 14pt 0; }
  code { font: 9pt "Geist Mono", ui-monospace, Menlo, Consolas, monospace; background: #f5f5f4; padding: 0 3px; border-radius: 3px; }
  pre { background: #fafaf9; border: 1px solid var(--line); border-radius: 6px; padding: 8pt 10pt; font-size: 8.5pt; line-height: 1.4; break-inside: avoid; white-space: pre; overflow: hidden; }
  pre code { background: none; padding: 0; font-size: 8.5pt; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 9.5pt; break-inside: auto; }
  th, td { text-align: left; vertical-align: top; padding: 5pt 7pt; border-bottom: 1px solid var(--line); }
  th { font-weight: 600; color: var(--muted); background: #fafaf9; }
  tr { break-inside: avoid; }
  img { max-width: 100%; border: 1px solid var(--line); border-radius: 6px; display: block; margin: 8pt auto 4pt; break-inside: avoid; }
  td img { margin: 0; }
  p:has(> img) { break-inside: avoid; text-align: center; }
  strong { font-weight: 600; }
  body > p:first-of-type, body > p:nth-of-type(2), body > p:nth-of-type(3) { margin: 2pt 0; }
</style></head><body>${body}</body></html>`;

await writeFile(htmlOut, html);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlOut).href, { waitUntil: "load" });
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images).map((image) =>
        image.complete
          ? image.naturalWidth > 0 || Promise.reject(new Error(image.src))
          : new Promise((resolve, reject) => {
              image.onload = resolve;
              image.onerror = () => reject(new Error(image.src));
            }),
      ),
    ),
  );
  await page.pdf({
    path: pdfOut,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="font:8px Helvetica,Arial,sans-serif;color:#78716c;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>ClaimDesk · Technical Design · github.com/heykay-47/claimdesk</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  });
  console.log(`Wrote ${pdfOut}`);
} finally {
  await browser.close();
}
