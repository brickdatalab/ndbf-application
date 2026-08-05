import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import {
  getPdfLayoutContract,
  normalizePdfLayoutVersion,
} from "../shared/pdf-layout-contract.js";

const POINTS_PER_MM = 72 / 25.4;

export class PdfLayoutValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PdfLayoutValidationError";
    this.code = code;
    this.statusCode = 400;
  }
}

function decodePageContent(document, page) {
  const contents = page.node.Contents();
  if (!contents) return "";
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => document.context.lookup(ref))
    .filter((stream) => stream instanceof PDFRawStream)
    .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"))
    .join("\n");
}

function assertMetadata(document, contract) {
  const actual = {
    title: document.getTitle() ?? "",
    subject: document.getSubject() ?? "",
    keywords: document.getKeywords() ?? "",
    creator: document.getCreator() ?? "",
  };
  for (const [key, expected] of Object.entries(contract.metadata)) {
    if (actual[key] !== expected) {
      throw new PdfLayoutValidationError(
        "PDF_LAYOUT_METADATA_MISMATCH",
        `PDF layout metadata ${key} does not match the declared version`,
      );
    }
  }
}

export async function validateDeclaredPdfLayout({ declaredVersion, pdfBuffer }) {
  const version = normalizePdfLayoutVersion(declaredVersion);
  if (version === null) return null;
  const contract = getPdfLayoutContract(version);
  if (!contract) {
    throw new PdfLayoutValidationError(
      "PDF_LAYOUT_UNSUPPORTED",
      "Unsupported PDF layout version",
    );
  }
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new PdfLayoutValidationError(
      "PDF_LAYOUT_PDF_REQUIRED",
      "A PDF is required for a versioned submission",
    );
  }

  let document;
  try {
    document = await PDFDocument.load(pdfBuffer, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
  } catch {
    throw new PdfLayoutValidationError("PDF_LAYOUT_INVALID_PDF", "Invalid application PDF");
  }

  assertMetadata(document, contract);
  const pages = document.getPages();
  if (pages.length < 2) {
    throw new PdfLayoutValidationError(
      "PDF_LAYOUT_PAGE_MISSING",
      "Dedicated underwriting page is missing",
    );
  }

  const expectedWidth = contract.page.widthMm * POINTS_PER_MM;
  const expectedHeight = contract.page.heightMm * POINTS_PER_MM;
  for (const page of pages) {
    const { width, height } = page.getSize();
    if (
      Math.abs(width - expectedWidth) > contract.page.tolerancePoints ||
      Math.abs(height - expectedHeight) > contract.page.tolerancePoints
    ) {
      throw new PdfLayoutValidationError(
        "PDF_LAYOUT_PAGE_SIZE_MISMATCH",
        "Every source PDF page must be A4 portrait",
      );
    }
  }

  const pageContents = pages.map((page) => decodePageContent(document, page));
  const anchoredPages = pageContents
    .map((content, index) => (content.includes(contract.anchor) ? index : -1))
    .filter((index) => index >= 0);
  if (anchoredPages.length !== 1 || anchoredPages[0] !== pages.length - 1) {
    throw new PdfLayoutValidationError(
      "PDF_LAYOUT_ANCHOR_MISMATCH",
      "Underwriting layout anchor is missing or on the wrong page",
    );
  }

  const underwritingContent = pageContents.at(-1);
  const requiredText = [
    "BANK STATEMENT UNDERWRITING",
    ...contract.sections.flatMap((section) => [
      section.title,
      ...section.columns.flatMap((column) => column.label.split("\n")),
    ]),
  ];
  for (const text of requiredText) {
    if (!underwritingContent.includes(`(${text})`)) {
      throw new PdfLayoutValidationError(
        "PDF_LAYOUT_SHELL_MISMATCH",
        "Underwriting page headings do not match the declared version",
      );
    }
  }

  return version;
}
