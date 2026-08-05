import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import {
  getPdfLayoutContract,
  normalizePdfLayoutVersion,
} from "./pdf-layout-contract.js";
import { fingerprintDecodedUnderwritingPageContent } from "./pdf-layout-fingerprint.js";

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
    .map((stream) =>
      Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"),
    )
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
    throw new PdfLayoutValidationError(
      "PDF_LAYOUT_INVALID_PDF",
      "Invalid application PDF",
    );
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
  const underwritingContent = decodePageContent(document, pages.at(-1));
  let actualFingerprint;
  try {
    actualFingerprint = fingerprintDecodedUnderwritingPageContent(
      underwritingContent,
      pages.length,
    );
  } catch {
    throw new PdfLayoutValidationError(
      "PDF_LAYOUT_FINGERPRINT_MISMATCH",
      "Underwriting page content fingerprint does not match the declared version",
    );
  }
  if (actualFingerprint !== contract.decodedLastPageContentSha256) {
    throw new PdfLayoutValidationError(
      "PDF_LAYOUT_FINGERPRINT_MISMATCH",
      "Underwriting page content fingerprint does not match the declared version",
    );
  }
  return version;
}
