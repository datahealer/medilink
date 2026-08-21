import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The invoice has ONE representation: the PDF built by supabase/functions/generate-invoice.
 *
 * ── THE BUG THIS PINS ──
 *
 * Preview and Download showed different invoices, and Print matched Preview rather than the
 * downloaded file. There were three representations, not one:
 *
 *   1. the pdf-lib PDF in supabase/functions/generate-invoice  (authoritative)
 *   2. a bespoke MediLink `InvoiceContent` JSX template        (Preview + Print)
 *   3. an html2canvas + jsPDF client-side generator            (Download fallback)
 *
 * Print matched Preview because Print rendered the same JSX node — a hidden
 * `#invoice-print-root` mirror revealed by an `@media print` rule.
 *
 * It was also a DATA problem, not only a template one. GET /api/payments returns no
 * invoice_number, appointment_id, facility, doctor or payment method, so the JSX template could
 * not have matched the PDF and fabricated instead — most visibly an invoice number of
 * `INV-<id[0:8]>` rather than payments.invoice_number, and no subtotal or tax line at all.
 * Verified against a real invoice: the PDF read `Invoice No: INV-2026-991677` with
 * Subtotal 210.00 / Tax 10.50 / Total 220.50 OMR, while the Preview showed a fabricated number
 * and a bare total of 210.000.
 *
 * The page now embeds the generated PDF, so the three actions are the same artefact by
 * construction. These assertions exist so a future change cannot quietly reintroduce a parallel
 * template or a second PDF generator.
 */

// The suite runs from the frontend workspace root (`npm test` -> node --test "src/**/*.test.ts"),
// and these .ts files are loaded as ES modules, where __dirname does not exist.
const PAGE = path.resolve("src/app/dashboard/payments/page.tsx");
const source = () => readFileSync(PAGE, "utf8");

/** Source with comments stripped, so prose mentioning an old symbol is not read as code. */
function code(): string {
  return source()
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the payments page has a single invoice source", () => {
  it("does not render a bespoke invoice template", () => {
    const c = code();
    assert.ok(
      !/function\s+InvoiceContent\b/.test(c),
      "InvoiceContent is back — that is a second invoice template, which is what made Preview differ from the downloaded PDF"
    );
    assert.ok(
      !/Thank you for choosing MediLink/.test(c),
      "the MediLink invoice footer is back, so a parallel template has been reintroduced"
    );
  });

  it("contains no client-side PDF generator", () => {
    const c = code();
    for (const lib of ["html2canvas", "jspdf", "jsPDF"]) {
      assert.ok(
        !c.includes(lib),
        `${lib} is back — a second PDF generator produces a different document from the authoritative one`
      );
    }
  });

  it("does not print a DOM mirror of the invoice", () => {
    const c = code();
    assert.ok(
      !/invoice-print-root/.test(c),
      "the hidden print mirror is back; printing it is why Print matched Preview instead of the PDF"
    );
    assert.ok(
      !/window\.print\(\)/.test(c),
      "window.print() prints the page DOM, not the generated PDF"
    );
  });

  it("previews the generated PDF itself", () => {
    const c = code();
    assert.match(c, /<iframe/, "the preview must embed the PDF");
    assert.match(
      c,
      /invoice\?format=json/,
      "the signed URL must come from the invoice route, which authenticates and ownership-scopes"
    );
  });

  it("feeds preview, download and print from the same URL", () => {
    const c = code();
    // one piece of state, used by all three
    assert.match(c, /setInvoiceUrl\(/, "expected a single invoiceUrl state");
    assert.match(c, /pdfUrl=\{invoiceUrl\}/, "the preview must read that state");

    const download = c.slice(c.indexOf("function handleDownload"), c.indexOf("function handlePrint"));
    assert.ok(download.includes("invoiceUrl"), "download must use the previewed URL");

    const print = c.slice(c.indexOf("function handlePrint"));
    assert.ok(print.includes("invoiceUrl"), "print must use the previewed URL");
  });

  it("asks the backend to generate a missing invoice rather than building one locally", () => {
    assert.match(
      code(),
      /invoice\/regenerate/,
      "a missing invoice must go through the authenticated regenerate route"
    );
  });
});
