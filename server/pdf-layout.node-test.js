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

function createPdf({
  metadata = {},
  includeAnchor = true,
  includeShell = true,
  format = "a4",
  anchorX = 18,
  anchorRenderingMode = "invisible",
  duplicateAnchor = false,
  extraRow = false,
  background = false,
  extraRule = false,
} = {}) {
  const contract = getPdfLayoutContract(PDF_LAYOUT_VERSION);
  const document = new jsPDF({ unit: "mm", format });
  document.setProperties({ ...contract.metadata, ...metadata });
  document.text("Signed application", 18, 25);
  document.addPage(format, "portrait");
  if (includeShell) {
    document.setFont("helvetica", "bold");
    document.setFontSize(contract.rendering.label.fontSizePt);
    document.text(
      contract.rendering.label.text,
      contract.rendering.label.xMm,
      contract.rendering.label.yMm,
    );
    for (const section of contract.sections) {
      document.setFontSize(contract.rendering.sectionTitleFontSizePt);
      document.text(section.title, contract.writableRect.xMm, section.titleYMm);
      document.setLineWidth(contract.rendering.titleRuleWidthMm);
      document.line(
        contract.writableRect.xMm,
        section.titleYMm + contract.rendering.titleRuleOffsetMm,
        contract.writableRect.xMm + contract.writableRect.widthMm,
        section.titleYMm + contract.rendering.titleRuleOffsetMm,
      );
      document.setFontSize(contract.rendering.columnFontSizePt);
      for (const column of section.columns) {
        document.text(
          column.label.split("\n"),
          column.xMm,
          section.titleYMm + contract.rendering.columnYOffsetMm,
          { lineHeightFactor: contract.rendering.columnLineHeightFactor },
        );
      }
      document.setLineWidth(contract.rendering.columnRuleWidthMm);
      document.line(
        contract.writableRect.xMm,
        section.titleYMm + contract.rendering.columnRuleOffsetMm,
        contract.writableRect.xMm + contract.writableRect.widthMm,
        section.titleYMm + contract.rendering.columnRuleOffsetMm,
      );
    }
  }
  if (extraRow) {
    document.setFont("helvetica", "normal");
    document.setFontSize(6);
    document.text("$10,000.00", 18, 55);
  }
  if (background) {
    document.setFillColor(245, 245, 245);
    document.rect(18, 50, 174, 12, "F");
  }
  if (extraRule) document.line(18, 55, 192, 55);
  if (includeAnchor) {
    document.setFont("helvetica", "normal");
    document.setFontSize(contract.rendering.anchorFontSizePt);
    document.text(contract.anchor, anchorX, contract.writableRect.yMm, {
      renderingMode: anchorRenderingMode,
    });
    if (duplicateAnchor) {
      document.text(contract.anchor, anchorX, contract.writableRect.yMm + 1, {
        renderingMode: anchorRenderingMode,
      });
    }
  }
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

  for (const [index, fixture] of [
    { declaredVersion: "future-layout", pdfBuffer: createPdf() },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ metadata: { subject: "wrong" } }) },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ includeAnchor: false }) },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ anchorX: 19 }) },
    {
      declaredVersion: PDF_LAYOUT_VERSION,
      pdfBuffer: createPdf({ anchorRenderingMode: "fill" }),
    },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ duplicateAnchor: true }) },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ extraRow: true }) },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ background: true }) },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ extraRule: true }) },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ includeShell: false }) },
    { declaredVersion: PDF_LAYOUT_VERSION, pdfBuffer: createPdf({ format: "letter" }) },
  ].entries()) {
    await assert.rejects(
      validateDeclaredPdfLayout(fixture),
      (error) => error instanceof PdfLayoutValidationError,
      `invalid fixture ${index} unexpectedly passed`,
    );
  }
});

test("rejects every invalid declaration/layout branch before persistence", async () => {
  const invalidCases = [
    { version: "", pdf: createPdf() },
    { version: "   ", pdf: createPdf() },
    { version: 0, pdf: createPdf() },
    { version: false, pdf: createPdf() },
    { version: {}, pdf: createPdf() },
    { version: [], pdf: createPdf() },
    { version: "future-layout", pdf: createPdf() },
    { version: PDF_LAYOUT_VERSION, pdf: undefined },
    { version: PDF_LAYOUT_VERSION, pdf: Buffer.from("not a pdf") },
    {
      version: PDF_LAYOUT_VERSION,
      pdf: createPdf({ metadata: { subject: "wrong" } }),
    },
    { version: PDF_LAYOUT_VERSION, pdf: createPdf({ format: "letter" }) },
    { version: PDF_LAYOUT_VERSION, pdf: createPdf({ includeAnchor: false }) },
    { version: PDF_LAYOUT_VERSION, pdf: createPdf({ includeShell: false }) },
    { version: PDF_LAYOUT_VERSION, pdf: createPdf({ anchorX: 19 }) },
    {
      version: PDF_LAYOUT_VERSION,
      pdf: createPdf({ anchorRenderingMode: "fill" }),
    },
    { version: PDF_LAYOUT_VERSION, pdf: createPdf({ duplicateAnchor: true }) },
    { version: PDF_LAYOUT_VERSION, pdf: createPdf({ extraRow: true }) },
    { version: PDF_LAYOUT_VERSION, pdf: createPdf({ background: true }) },
    { version: PDF_LAYOUT_VERSION, pdf: createPdf({ extraRule: true }) },
  ];

  for (const [index, fixture] of invalidCases.entries()) {
    const calls = { upload: 0, insert: 0, publish: 0 };
    const handler = createSubmitHandler({
      uploadFile: async () => { calls.upload += 1; },
      insertRows: async () => { calls.insert += 1; },
      publishMessage: async () => { calls.publish += 1; },
    });
    const response = responseRecorder();
    await handler(
      {
        body: {
          payload: JSON.stringify({ pdfLayoutVersion: fixture.version, formData: {} }),
        },
        files: {
          ...(fixture.pdf ? { pdf: [{ buffer: fixture.pdf }] } : {}),
          banks: [{ buffer: Buffer.from("bank"), originalname: "bank.pdf" }],
        },
        headers: {},
        socket: {},
      },
      response,
    );
    assert.equal(response.statusCode, 400, `invalid handler fixture ${index} unexpectedly passed`);
    assert.deepEqual(calls, { upload: 0, insert: 0, publish: 0 });
  }
});

test("stores and publishes the validated version while legacy remains NULL", async () => {
  for (const declaration of [undefined, null, PDF_LAYOUT_VERSION]) {
    const versioned = declaration === PDF_LAYOUT_VERSION;
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
            ...(declaration === undefined ? {} : { pdfLayoutVersion: declaration }),
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
