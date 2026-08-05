import assert from "node:assert/strict";
import test from "node:test";
import { jsPDF } from "jspdf";
import {
  PDF_LAYOUT_VERSION,
  getPdfLayoutContract,
} from "../shared/pdf-layout-contract.js";
import {
  addUnderwritingSourcePage,
  drawSourcePdfFooter,
} from "../shared/pdf-underwriting-page.js";
import {
  PdfLayoutValidationError,
  validateDeclaredPdfLayout,
} from "./pdf-layout-validator.js";
import { createSubmitHandler } from "./server.js";

const ADVERSARIAL_OPERATORS = Object.freeze({
  literalText: "BT\n/F1 10 Tf\n10 10 Td\n(Injected) Tj\nET",
  hexText: "BT\n/F1 10 Tf\n10 10 Td\n<496E6A6563746564> Tj\nET",
  textArray: "BT\n/F1 10 Tf\n10 10 Td\n[(In) 0 (jected)] TJ\nET",
  transformedText:
    "q\n1 0 0 1 10 10 cm\nBT\n/F1 10 Tf\n0 0 Td\n(Injected) Tj\nET\nQ",
  filledPath: "10 10 m\n20 10 l\n20 20 l\nh\nf",
  inlineImage: `BI\n/W 1\n/H 1\n/BPC 8\n/CS /DeviceGray\nID\n${String.fromCharCode(0)}\nEI`,
});

function createPdf({
  metadata = {},
  canonical = true,
  format = "a4",
  appendOperators = "",
} = {}) {
  const contract = getPdfLayoutContract(PDF_LAYOUT_VERSION);
  const document = new jsPDF({ unit: "mm", format });
  document.setProperties({ ...contract.metadata, ...metadata });
  document.text("Signed application", 18, 25);
  if (canonical && format === "a4") addUnderwritingSourcePage(document, contract);
  else {
    document.addPage(format, "portrait");
    document.text("Noncanonical underwriting page", 18, 25);
  }
  drawSourcePdfFooter(document, 2, 2);
  if (appendOperators) document.internal.write(appendOperators);
  return Buffer.from(document.output("arraybuffer"));
}

function invalidLayoutFixtures() {
  return [
    { declaredVersion: "future-layout", pdfBuffer: createPdf() },
    {
      declaredVersion: PDF_LAYOUT_VERSION,
      pdfBuffer: createPdf({ metadata: { subject: "wrong" } }),
    },
    {
      declaredVersion: PDF_LAYOUT_VERSION,
      pdfBuffer: createPdf({ canonical: false }),
    },
    ...Object.values(ADVERSARIAL_OPERATORS).map((appendOperators) => ({
      declaredVersion: PDF_LAYOUT_VERSION,
      pdfBuffer: createPdf({ appendOperators }),
    })),
    {
      declaredVersion: PDF_LAYOUT_VERSION,
      pdfBuffer: createPdf({ format: "letter" }),
    },
  ];
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

test("accepts the canonical source and rejects every altered content stream", async () => {
  assert.equal(
    await validateDeclaredPdfLayout({
      declaredVersion: PDF_LAYOUT_VERSION,
      pdfBuffer: createPdf(),
    }),
    PDF_LAYOUT_VERSION,
  );
  assert.equal(await validateDeclaredPdfLayout({ declaredVersion: undefined }), null);

  for (const [index, fixture] of invalidLayoutFixtures().entries()) {
    await assert.rejects(
      validateDeclaredPdfLayout(fixture),
      (error) => error instanceof PdfLayoutValidationError,
      `invalid fixture ${index} unexpectedly passed`,
    );
  }
});

test("rejects invalid declarations and content before persistence", async () => {
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
    ...invalidLayoutFixtures()
      .filter((fixture) => fixture.declaredVersion === PDF_LAYOUT_VERSION)
      .map((fixture) => ({
        version: fixture.declaredVersion,
        pdf: fixture.pdfBuffer,
      })),
  ];

  for (const [index, fixture] of invalidCases.entries()) {
    const calls = { upload: 0, insert: 0, publish: 0 };
    const handler = createSubmitHandler({
      uploadFile: async () => {
        calls.upload += 1;
      },
      insertRows: async () => {
        calls.insert += 1;
      },
      publishMessage: async () => {
        calls.publish += 1;
      },
    });
    const response = responseRecorder();
    await handler(
      {
        body: {
          payload: JSON.stringify({
            pdfLayoutVersion: fixture.version,
            formData: {},
          }),
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
    assert.equal(
      response.statusCode,
      400,
      `invalid handler fixture ${index} unexpectedly passed`,
    );
    assert.deepEqual(calls, { upload: 0, insert: 0, publish: 0 });
  }
});

test("stores the validated version while absent legacy declarations remain NULL", async () => {
  for (const declaration of [undefined, null, PDF_LAYOUT_VERSION]) {
    const versioned = declaration === PDF_LAYOUT_VERSION;
    const rows = [];
    const events = [];
    const handler = createSubmitHandler({
      uploadFile: async ({ filename }) => `gs://test/${filename}`,
      insertRows: async (value) => {
        rows.push(...value);
      },
      publishMessage: async (message) => {
        events.push(message);
        return "message-1";
      },
      now: () => "2026-08-05T12:00:00.000Z",
    });
    const response = responseRecorder();
    await handler(
      {
        body: {
          payload: JSON.stringify({
            ...(declaration === undefined
              ? {}
              : { pdfLayoutVersion: declaration }),
            formData: {
              businessLegalName: "Synthetic",
              termsAccepted: true,
            },
          }),
        },
        files: versioned ? { pdf: [{ buffer: createPdf() }] } : {},
        headers: {},
        socket: {},
      },
      response,
    );
    assert.equal(response.statusCode, 200);
    assert.equal(
      rows[0].pdf_layout_version,
      versioned ? PDF_LAYOUT_VERSION : null,
    );
    assert.equal(
      events[0].json.pdf_layout_version,
      versioned ? PDF_LAYOUT_VERSION : null,
    );
  }
});
