import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import {
  formatExactDecimal,
  renderFinalizedPdf,
  verifyFinalizedPdf,
} from "./renderer.js";
import { ENTRY_ID, sourcePdf, summaryRow } from "./test-fixtures.js";

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function extractedText(buffer) {
  const document = await PDFDocument.load(buffer, { updateMetadata: false });
  const output = [];
  for (const page of document.getPages()) {
    const contents = page.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    for (const ref of refs) {
      const stream = document.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      const content = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
      for (const match of content.matchAll(/<([0-9A-Fa-f]+)> Tj/g)) {
        output.push(Buffer.from(match[1], "hex").toString("latin1"));
      }
    }
  }
  return output.join(" ");
}

test("formats exact decimal strings without floating-point conversion", () => {
  assert.equal(
    formatExactDecimal("9007199254740993.123456789", { currency: true }),
    "$9,007,199,254,740,993.123456789",
  );
  assert.equal(formatExactDecimal("-1234.500", { currency: true }), "-$1,234.500");
  assert.equal(formatExactDecimal(null, { currency: true }), "—");
  assert.equal(formatExactDecimal("not-a-decimal", { currency: true }), "—");
});

test("renders every row, paginates, preserves source, and embeds authoritative ID", async () => {
  const source = sourcePdf();
  const before = hash(source);
  const summary = summaryRow({ debtCount: 90 });
  const rendered = await renderFinalizedPdf({
    sourcePdf: source,
    entryId: ENTRY_ID,
    status: "READY",
    summary,
  });
  assert.equal(hash(source), before);
  assert.equal(rendered.metrics.statementRows, 1);
  assert.equal(rendered.metrics.mcaDepositRows, 1);
  assert.equal(rendered.metrics.debtRows, 90);
  assert.equal(rendered.metrics.clippedRows, 0);
  assert.ok(rendered.metrics.pageCount > 2);
  assert.equal(await verifyFinalizedPdf(rendered.buffer, ENTRY_ID), true);
  const text = await extractedText(rendered.buffer);
  assert.match(text, /Entry #ndbf_synthetic123/);
  assert.match(text.replace(/\s/g, ""), /9,007,199,254,740,993\.123456789/);
  assert.match(text, /Synthetic Lender 090/);
  assert.match(text, /Merchant Cash Advance/);
});

test("review-required output renders Review and safe missing-value markers", async () => {
  const summary = summaryRow({ status: "REVIEW_REQUIRED", debtCount: 1 });
  summary.statements[0].deposits = null;
  const rendered = await renderFinalizedPdf({
    sourcePdf: sourcePdf(),
    entryId: ENTRY_ID,
    status: "REVIEW_REQUIRED",
    summary,
  });
  const text = await extractedText(rendered.buffer);
  assert.match(text, /Review required/);
  assert.match(text, /Review/);
  assert.equal(await verifyFinalizedPdf(rendered.buffer, ENTRY_ID), true);
});
