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

function numberPattern() {
  return "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
}

function decodePdfString(value) {
  return value
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_match, octal) =>
      String.fromCharCode(Number.parseInt(octal, 8)),
    );
}

function parseTextEntries(content) {
  const entries = [];
  for (const textObject of content.matchAll(/BT\n([\s\S]*?)\nET/g)) {
    const body = textObject[1];
    const font = body.match(new RegExp(`/([^\\s]+) (${numberPattern()}) Tf`));
    if (!font) continue;
    const renderingMode = Number(
      body.match(new RegExp(`(${numberPattern()}) Tr`))?.[1] ?? 0,
    );
    const leading = Number(
      body.match(new RegExp(`(${numberPattern()}) TL`))?.[1] ?? 0,
    );
    const tokenPattern = new RegExp(
      `(${numberPattern()}) (${numberPattern()}) Td|(T\\*)|\\(((?:\\\\.|[^\\)])*)\\) Tj`,
      "g",
    );
    let x = 0;
    let y = 0;
    let positioned = false;
    for (const token of body.matchAll(tokenPattern)) {
      if (token[1] !== undefined) {
        const dx = Number(token[1]);
        const dy = Number(token[2]);
        if (positioned) {
          x += dx;
          y += dy;
        } else {
          x = dx;
          y = dy;
          positioned = true;
        }
      } else if (token[3] !== undefined) {
        y -= leading;
      } else {
        entries.push({
          text: decodePdfString(token[4]),
          x: positioned ? x : null,
          y: positioned ? y : null,
          fontName: font[1],
          fontSize: Number(font[2]),
          renderingMode,
        });
      }
    }
  }
  return entries;
}

function parseLines(content) {
  const n = numberPattern();
  const widthPattern = new RegExp(`^(${n}) w$`);
  const movePattern = new RegExp(`^(${n}) (${n}) m$`);
  const linePattern = new RegExp(`^(${n}) (${n}) l$`);
  const lines = [];
  let width = 0;
  let start = null;
  let end = null;
  for (const operator of content.split("\n")) {
    const widthMatch = operator.match(widthPattern);
    if (widthMatch) {
      width = Number(widthMatch[1]);
      continue;
    }
    const moveMatch = operator.match(movePattern);
    if (moveMatch) {
      start = { x: Number(moveMatch[1]), y: Number(moveMatch[2]) };
      end = null;
      continue;
    }
    const lineMatch = operator.match(linePattern);
    if (lineMatch && start) {
      end = { x: Number(lineMatch[1]), y: Number(lineMatch[2]) };
      continue;
    }
    if (operator === "S" && start && end) {
      lines.push({
        width,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      });
      start = null;
      end = null;
    }
  }
  return lines;
}

function parseRectangles(content) {
  const n = numberPattern();
  const pattern = new RegExp(`(${n}) (${n}) (${n}) (${n}) re\\n(?:f|S)`, "g");
  return [...content.matchAll(pattern)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4]),
  }));
}

function approximatelyEqual(left, right, tolerance = 0.06) {
  return Math.abs(left - right) <= tolerance;
}

function expectedShellText(contract, pageHeight) {
  const toX = (mm) => mm * POINTS_PER_MM;
  const toY = (mm) => pageHeight - mm * POINTS_PER_MM;
  const entries = [
    {
      text: contract.rendering.label.text,
      x: toX(contract.rendering.label.xMm),
      y: toY(contract.rendering.label.yMm),
      fontName: "F2",
      fontSize: contract.rendering.label.fontSizePt,
      renderingMode: 0,
    },
  ];
  for (const section of contract.sections) {
    entries.push({
      text: section.title,
      x: toX(contract.writableRect.xMm),
      y: toY(section.titleYMm),
      fontName: "F2",
      fontSize: contract.rendering.sectionTitleFontSizePt,
      renderingMode: 0,
    });
    for (const column of section.columns) {
      for (const [lineIndex, text] of column.label.split("\n").entries()) {
        entries.push({
          text,
          x: toX(column.xMm),
          y:
            toY(section.titleYMm + contract.rendering.columnYOffsetMm) -
            lineIndex *
              contract.rendering.columnFontSizePt *
              contract.rendering.columnLineHeightFactor,
          fontName: "F2",
          fontSize: contract.rendering.columnFontSizePt,
          renderingMode: 0,
        });
      }
    }
  }
  entries.push({
    text: contract.anchor,
    x: toX(contract.writableRect.xMm),
    y: toY(contract.writableRect.yMm),
    fontName: "F1",
    fontSize: contract.rendering.anchorFontSizePt,
    renderingMode: contract.rendering.anchorRenderingMode,
  });
  return entries;
}

function expectedShellLines(contract, pageHeight) {
  const toX = (mm) => mm * POINTS_PER_MM;
  const toY = (mm) => pageHeight - mm * POINTS_PER_MM;
  return contract.sections.flatMap((section) => [
    {
      width: contract.rendering.titleRuleWidthMm * POINTS_PER_MM,
      x1: toX(contract.writableRect.xMm),
      y1: toY(section.titleYMm + contract.rendering.titleRuleOffsetMm),
      x2: toX(contract.writableRect.xMm + contract.writableRect.widthMm),
      y2: toY(section.titleYMm + contract.rendering.titleRuleOffsetMm),
    },
    {
      width: contract.rendering.columnRuleWidthMm * POINTS_PER_MM,
      x1: toX(contract.writableRect.xMm),
      y1: toY(section.titleYMm + contract.rendering.columnRuleOffsetMm),
      x2: toX(contract.writableRect.xMm + contract.writableRect.widthMm),
      y2: toY(section.titleYMm + contract.rendering.columnRuleOffsetMm),
    },
  ]);
}

function entryMatches(actual, expected) {
  return (
    actual.text === expected.text &&
    actual.fontName === expected.fontName &&
    actual.renderingMode === expected.renderingMode &&
    actual.x !== null &&
    actual.y !== null &&
    approximatelyEqual(actual.x, expected.x) &&
    approximatelyEqual(actual.y, expected.y) &&
    approximatelyEqual(actual.fontSize, expected.fontSize, 0.001)
  );
}

function lineMatches(actual, expected) {
  return Object.keys(expected).every((key) =>
    approximatelyEqual(actual[key], expected[key]),
  );
}

function assertCanonicalUnderwritingPage(pageContents, contract, pageHeight) {
  const allEntries = pageContents.flatMap(parseTextEntries);
  const anchors = allEntries.filter((entry) => entry.text === contract.anchor);
  if (anchors.length !== 1) {
    throw new PdfLayoutValidationError(
      "PDF_LAYOUT_ANCHOR_MISMATCH",
      "Underwriting layout anchor must occur exactly once",
    );
  }

  const underwritingContent = pageContents.at(-1);
  const actualEntries = parseTextEntries(underwritingContent);
  const topMm = (entry) => (pageHeight - entry.y) / POINTS_PER_MM;
  const shellEntries = actualEntries.filter(
    (entry) =>
      entry.x !== null &&
      entry.y !== null &&
      entry.x >= (contract.writableRect.xMm - 0.1) * POINTS_PER_MM &&
      entry.x <=
        (contract.writableRect.xMm + contract.writableRect.widthMm + 0.1) *
          POINTS_PER_MM &&
      topMm(entry) >= contract.rendering.label.yMm - 0.1 &&
      topMm(entry) <=
        contract.writableRect.yMm + contract.writableRect.heightMm + 0.1,
  );
  const expectedEntries = expectedShellText(contract, pageHeight);
  const unmatched = [...shellEntries];
  for (const expected of expectedEntries) {
    const index = unmatched.findIndex((actual) => entryMatches(actual, expected));
    if (index < 0) {
      throw new PdfLayoutValidationError(
        expected.text === contract.anchor
          ? "PDF_LAYOUT_ANCHOR_MISMATCH"
          : "PDF_LAYOUT_SHELL_MISMATCH",
        "Underwriting page text/operator fingerprint does not match",
      );
    }
    unmatched.splice(index, 1);
  }
  if (unmatched.length > 0) {
    throw new PdfLayoutValidationError(
      "PDF_LAYOUT_SOURCE_NOT_BLANK",
      "Underwriting source contains unexpected data",
    );
  }

  const expectedLines = expectedShellLines(contract, pageHeight);
  const actualLines = parseLines(underwritingContent).filter((line) => {
    const top = (pageHeight - line.y1) / POINTS_PER_MM;
    return (
      top >= contract.rendering.label.yMm &&
      top <= contract.writableRect.yMm + contract.writableRect.heightMm
    );
  });
  const unmatchedLines = [...actualLines];
  for (const expected of expectedLines) {
    const index = unmatchedLines.findIndex((actual) => lineMatches(actual, expected));
    if (index < 0) {
      throw new PdfLayoutValidationError(
        "PDF_LAYOUT_SHELL_MISMATCH",
        "Underwriting page line geometry does not match",
      );
    }
    unmatchedLines.splice(index, 1);
  }
  if (unmatchedLines.length > 0) {
    throw new PdfLayoutValidationError(
      "PDF_LAYOUT_SOURCE_NOT_BLANK",
      "Underwriting source contains unexpected rules",
    );
  }

  const rect = contract.writableRect;
  const xMin = rect.xMm * POINTS_PER_MM;
  const xMax = (rect.xMm + rect.widthMm) * POINTS_PER_MM;
  const yMin = pageHeight - (rect.yMm + rect.heightMm) * POINTS_PER_MM;
  const yMax = pageHeight - rect.yMm * POINTS_PER_MM;
  const intersectingRectangle = parseRectangles(underwritingContent).some((item) => {
    const left = Math.min(item.x, item.x + item.width);
    const right = Math.max(item.x, item.x + item.width);
    const bottom = Math.min(item.y, item.y + item.height);
    const top = Math.max(item.y, item.y + item.height);
    return right > xMin && left < xMax && top > yMin && bottom < yMax;
  });
  if (intersectingRectangle || /\/[^\s]+ Do(?:\n|$)/.test(underwritingContent)) {
    throw new PdfLayoutValidationError(
      "PDF_LAYOUT_SOURCE_NOT_BLANK",
      "Underwriting source contains a background or image",
    );
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
  assertCanonicalUnderwritingPage(pageContents, contract, expectedHeight);

  return version;
}
