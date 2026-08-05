import assert from "node:assert/strict";
import test from "node:test";
import { jsPDF } from "jspdf";
import {
  PDF_LAYOUT_VERSION,
  getPdfLayoutContract,
} from "../shared/pdf-layout-contract.js";
import {
  PdfLayoutValidationError,
  validateDeclaredPdfLayout,
} from "./pdf-layout-validator.js";
import { createSubmitHandler } from "./server.js";

function createPdf({ metadata = {}, includeAnchor = true, includeShell = true, format = "a4" } = {}) {
  const contract = getPdfLayoutContract(PDF_LAYOUT_VERSION);
  const document = new jsPDF({ unit: "mm", format });
  document.setProperties({ ...contract.metadata, ...metadata });
  document.text("Signed application", 18, 25);
  document.addPage(format, "portrait");
  if (includeShell) {
    document.text("BANK STATEMENT UNDERWRITING", 18, 25);
    for (const section of contract.sections) {
      document.text(section.title, 18, section.titleYMm);
      for (const column of section.columns) {
        document.text(column.label.split("\n"), column.xMm, section.titleYMm + 8);
      }
    }
  }
  if (includeAnchor) document.text(contract.anchor, 18, 38);
  return Buffer.from(document.output("arraybuffer"));
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("accepts the supported source layout and rejects contract mismatches", async () => {
  assert.equal(
    await validateDeclaredPdfLayout({
      declaredVersion: PDF_LAYOUT_VERSION,
      pdfBuffer: createPdf(),
    }),
    PDF_LAYOUT_VERSION,
  );
  assert.equal(await validateDeclaredPdfLayout({ declaredVersion: undefined }), null);

  for (const fixture of [
    { declaredVersion: "future-layout", pdfBuffer: createPdf() },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ metadata: { subject: "wrong" } }) },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ includeAnchor: false }) },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ includeShell: false }) },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ format: "letter" }) },
  ]) {
    await assert.rejects(
      validateDeclaredPdfLayout(fixture),
      (error) => error instanceof PdfLayoutValidationError,
    );
  }
});

test("rejects an invalid declared layout before any persistence call", async () => {
  const calls = { upload: 0, insert: 0, publish: 0 };
  const handler = createSubmitHandler({
    uploadFile: async () => { calls.upload += 1; },
    insertRows: async () => { calls.insert += 1; },
    publishMessage: async () => { calls.publish += 1; },
  });
  const response = responseRecorder();
  await handler(
    {
      body: { payload: JSON.stringify({ pdfLayoutVersion: PDF_LAYOUT_VERSION, formData: {} }) },
      files: {
        pdf: [{ buffer: Buffer.from("not a pdf") }],
        banks: [{ buffer: Buffer.from("bank"), originalname: "bank.pdf" }],
      },
      headers: {},
      socket: {},
    },
    response,
  );
  assert.equal(response.statusCode, 400);
  assert.deepEqual(calls, { upload: 0, insert: 0, publish: 0 });
});

test("stores and publishes the validated version while legacy remains NULL", async () => {
  for (const versioned of [false, true]) {
    const rows = [];
    const events = [];
    const handler = createSubmitHandler({
      uploadFile: async ({ filename }) => `gs://test/${filename}`,
      insertRows: async (value) => { rows.push(...value); },
      publishMessage: async (message) => { events.push(message); return "message-1"; },
      now: () => "2026-08-05T12:00:00.000Z",
    });
    const response = responseRecorder();
    await handler(
      {
        body: {
          payload: JSON.stringify({
            ...(versioned ? { pdfLayoutVersion: PDF_LAYOUT_VERSION } : {}),
            formData: { businessLegalName: "Synthetic", termsAccepted: true },
          }),
        },
        files: versioned ? { pdf: [{ buffer: createPdf() }] } : {},
        headers: {},
        socket: {},
      },
      response,
    );
    assert.equal(response.statusCode, 200);
    assert.equal(rows[0].pdf_layout_version, versioned ? PDF_LAYOUT_VERSION : null);
    assert.equal(events[0].json.pdf_layout_version, versioned ? PDF_LAYOUT_VERSION : null);
  }
});
