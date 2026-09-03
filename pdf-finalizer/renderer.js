import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
} from "pdf-lib";
import { getPdfLayoutContract } from "@ndbf/pdf-layout/pdf-layout-contract.js";

const POINTS_PER_MM = 72 / 25.4;
const A4_WIDTH = 210 * POINTS_PER_MM;
const A4_HEIGHT = 297 * POINTS_PER_MM;
const LEFT_MM = 18;
const RIGHT_MM = 192;
const NAVY = rgb(0, 33 / 255, 64 / 255);
const BLUE = rgb(0, 117 / 255, 223 / 255);
const BODY = rgb(48 / 255, 55 / 255, 62 / 255);
const MUTED = rgb(120 / 255, 120 / 255, 120 / 255);
const RULE = rgb(220 / 255, 220 / 255, 220 / 255);
const GREEN = rgb(24 / 255, 145 / 255, 87 / 255);
// Watermark size, pinned literally rather than measured at runtime, so the
// finalized PDF keeps the same footprint as the source PDF it mirrors.
// 72 x (223.520 / 280.924) — the widths of "nextdaybizfunding" and
// "theapprovaldepartment" at 72pt.
const WATERMARK_FONT_SIZE_PT = 57.2875226039783;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function mm(value) {
  return value * POINTS_PER_MM;
}

function yFromTop(page, topMm) {
  return page.getHeight() - mm(topMm);
}

export function safePdfText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\u2013\u2014]/g, "?")
    .trim();
}

function displayValue(value) {
  const text = safePdfText(value);
  return text || "—";
}

function scaledDecimalParts(integer, fraction, scale) {
  const padded = fraction.padEnd(scale, "0");
  const keptFraction = padded.slice(0, scale);
  let units = BigInt(`${integer}${keptFraction}` || "0");
  if (fraction.length > scale && Number.parseInt(fraction[scale], 10) >= 5) {
    units += 1n;
  }
  const divisor = 10n ** BigInt(scale);
  return {
    integer: (units / divisor).toString(),
    fraction:
      scale > 0 ? (units % divisor).toString().padStart(scale, "0") : "",
    isZero: units === 0n,
  };
}

export function formatExactDecimal(
  value,
  { currency = false, scale = null } = {},
) {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value).trim();
  const match = text.match(/^(-?)([0-9]+)(?:\.([0-9]+))?$/);
  if (!match) return "—";

  let integer = match[2];
  let fraction = match[3] ?? "";
  let isZero = /^0+$/.test(integer) && (!fraction || /^0+$/.test(fraction));
  if (Number.isInteger(scale) && scale >= 0) {
    const scaled = scaledDecimalParts(integer, fraction, scale);
    integer = scaled.integer;
    fraction = scaled.fraction;
    isZero = scaled.isZero;
  }

  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const amount = `${grouped}${fraction ? `.${fraction}` : ""}`;
  const negative = match[1] && !isZero;
  if (!currency) return negative ? `-${amount}` : amount;
  return negative ? `-$${amount}` : `$${amount}`;
}

function formatCurrency(value) {
  return formatExactDecimal(value, { currency: true, scale: 2 });
}

function formatDate(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "—";
  const month = MONTHS[Number.parseInt(match[2], 10) - 1];
  if (!month) return "—";
  return `${month} ${String(Number.parseInt(match[3], 10))}, ${match[1]}`;
}

function formatPeriod(start, end) {
  if (!start || !end) return "—";
  return `${formatDate(start)}–${formatDate(end)}`;
}

function statementBlock(row) {
  const detected =
    row.mca_detected === "Yes"
      ? "Yes"
      : row.mca_detected === "Review" || row.quality_status === "REVIEW_REQUIRED"
        ? "Review"
        : "—";
  const lastFour = /^\d{4}$/.test(String(row.account_last_four ?? ""))
    ? `**** ${row.account_last_four}`
    : "—";
  return {
    heading: `${formatPeriod(row.statement_start_date, row.statement_end_date)} | Account ${lastFour}`,
    details: [
      `Deposits: ${formatCurrency(row.deposits)} | Deposit count: ${displayValue(row.deposit_count)} | True revenue: ${formatCurrency(row.true_revenue)} | Withdrawals: ${formatCurrency(row.withdrawals)}`,
      `Negative ending days: ${displayValue(row.negative_ending_days)} | Avg. daily balance: ${formatCurrency(row.average_daily_balance)} | MCA detected: ${detected}`,
    ],
    review: detected === "Review",
  };
}

function wrapText(font, text, size, maxWidth) {
  const normalized = displayValue(text);
  const words = normalized.split(/\s+/);
  const lines = [];
  let line = "";
  const pushToken = (token) => {
    if (font.widthOfTextAtSize(token, size) <= maxWidth) {
      const candidate = line ? `${line} ${token}` : token;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = token;
      }
      return;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    let piece = "";
    for (const character of token) {
      const candidate = `${piece}${character}`;
      if (piece && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(piece);
        piece = character;
      } else {
        piece = candidate;
      }
    }
    line = piece;
  };
  for (const word of words) pushToken(word);
  if (line) lines.push(line);
  return lines.length ? lines : ["—"];
}

function prepareStatementBlock(fonts, block) {
  const width = mm(RIGHT_MM - LEFT_MM);
  const headingSize = 7.2;
  const detailSize = 6.2;
  const headingLineHeight = 9;
  const detailLineHeight = 7.6;
  const headingLines = wrapText(fonts.bold, block.heading, headingSize, width);
  const detailLines = block.details.flatMap((line) =>
    wrapText(fonts.normal, line, detailSize, width),
  );
  return {
    ...block,
    headingSize,
    detailSize,
    headingLineHeight,
    detailLineHeight,
    headingLines,
    detailLines,
    height:
      headingLines.length * headingLineHeight +
      detailLines.length * detailLineHeight +
      6,
  };
}

function drawPreparedStatementBlock({ page, block, fonts, topY }) {
  let cursorY = topY;
  for (const line of block.headingLines) {
    page.drawText(line, {
      x: mm(LEFT_MM),
      y: cursorY - block.headingSize,
      size: block.headingSize,
      font: fonts.bold,
      color: NAVY,
    });
    cursorY -= block.headingLineHeight;
  }
  cursorY -= 1;
  for (const line of block.detailLines) {
    page.drawText(line, {
      x: mm(LEFT_MM),
      y: cursorY - block.detailSize,
      size: block.detailSize,
      font: fonts.normal,
      color: block.review ? MUTED : BODY,
    });
    cursorY -= block.detailLineHeight;
  }
  return topY - block.height;
}

function drawBlocksInBand({ page, blocks, fonts, topMm, bottomMm }) {
  let topY = yFromTop(page, topMm);
  const bottomY = yFromTop(page, bottomMm);
  let index = 0;
  for (; index < blocks.length; index += 1) {
    const block = prepareStatementBlock(fonts, blocks[index]);
    if (topY - block.height < bottomY) break;
    topY = drawPreparedStatementBlock({ page, block, fonts, topY });
  }
  return blocks.slice(index);
}

function drawWatermark(page, font) {
  page.drawText("theapprovaldepartment", {
    x: mm(35),
    y: mm(95),
    size: WATERMARK_FONT_SIZE_PT,
    font,
    color: NAVY,
    opacity: 0.07,
    rotate: degrees(30),
  });
}

function drawHeader(page, fonts, entryId) {
  page.drawRectangle({
    x: 0,
    y: page.getHeight() - mm(14),
    width: page.getWidth(),
    height: mm(14),
    color: NAVY,
  });
  page.drawText("The Approval Department — Application", {
    x: mm(LEFT_MM),
    y: page.getHeight() - mm(9.5),
    size: 13,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  drawEntryId(page, fonts.bold, entryId);
}

function drawUnderwritingFrame(page, fonts, entryId, status, continued = false) {
  drawWatermark(page, fonts.bold);
  drawHeader(page, fonts, entryId);
  page.drawText("BANK STATEMENT UNDERWRITING", {
    x: mm(LEFT_MM),
    y: yFromTop(page, 27),
    size: 6.2,
    font: fonts.bold,
    color: BLUE,
  });
  if (!continued) {
    page.drawText(status === "REVIEW_REQUIRED" ? "Review required" : "Complete", {
      x: mm(LEFT_MM),
      y: yFromTop(page, 31),
      size: 5.2,
      font: fonts.bold,
      color: status === "REVIEW_REQUIRED" ? MUTED : GREEN,
    });
  }
  page.drawText(continued ? "Statement Summary — continued" : "Statement Summary", {
    x: mm(LEFT_MM),
    y: yFromTop(page, 37),
    size: 10.5,
    font: fonts.bold,
    color: NAVY,
  });
  page.drawLine({
    start: { x: mm(LEFT_MM), y: yFromTop(page, 39.5) },
    end: { x: mm(RIGHT_MM), y: yFromTop(page, 39.5) },
    thickness: 1,
    color: BLUE,
  });
  drawFooter(page, fonts.normal);
}

function drawFooter(page, font) {
  page.drawLine({
    start: { x: mm(LEFT_MM), y: mm(14) },
    end: { x: mm(RIGHT_MM), y: mm(14) },
    thickness: 0.55,
    color: RULE,
  });
  page.drawText("The Approval Department  |  Confidential Application", {
    x: mm(LEFT_MM),
    y: mm(8),
    size: 7.5,
    font,
    color: MUTED,
  });
}

function drawEntryId(page, font, entryId) {
  let size = 7.5;
  const text = `Entry #${entryId}`;
  while (size > 4.5 && font.widthOfTextAtSize(text, size) > mm(62)) size -= 0.25;
  page.drawText(text, {
    x: mm(RIGHT_MM) - font.widthOfTextAtSize(text, size),
    y: page.getHeight() - mm(9.5),
    size,
    font,
    color: rgb(1, 1, 1),
  });
}

function drawContinuationPages({ document, fonts, entryId, status, blocks }) {
  let remaining = blocks;
  while (remaining.length > 0) {
    const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
    drawUnderwritingFrame(page, fonts, entryId, status, true);
    const next = drawBlocksInBand({
      page,
      blocks: remaining,
      fonts,
      topMm: 45,
      bottomMm: 280,
    });
    if (next.length === remaining.length) {
      throw new Error("PDF_STATEMENT_BLOCK_CANNOT_FIT");
    }
    remaining = next;
  }
}

export async function renderFinalizedPdf({
  sourcePdf,
  entryId,
  status,
  summary,
}) {
  const layout = getPdfLayoutContract("underwriting-v1");
  if (!layout) throw new Error("PDF_LAYOUT_CONTRACT_MISSING");
  const document = await PDFDocument.load(sourcePdf, { updateMetadata: false });
  const fonts = {
    normal: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
  };

  if (document.getPageCount() < 1) throw new Error("PDF_SOURCE_PAGE_MISSING");
  document.removePage(document.getPageCount() - 1);
  const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
  drawUnderwritingFrame(page, fonts, entryId, status);

  const statements = summary.statements.map(statementBlock);
  const statementOverflow = drawBlocksInBand({
    page,
    blocks: statements,
    fonts,
    topMm: 45,
    bottomMm: 280,
  });

  drawContinuationPages({
    document,
    fonts,
    entryId,
    status,
    blocks: statementOverflow,
  });

  document.setTitle("NextDay Biz Funding Underwritten Application");
  document.setSubject("NDBF finalized application PDF underwriting-v1");
  document.setCreator("ndbf-pdf-finalizer");
  document.setKeywords(["ndbf", "underwritten-v1", `entry:${entryId}`]);
  const buffer = Buffer.from(await document.save());
  return {
    buffer,
    metrics: {
      statementRows: summary.statements.length,
      pageCount: document.getPageCount(),
      clippedRows: 0,
    },
  };
}

export async function verifyFinalizedPdf(buffer, entryId) {
  let document;
  try {
    document = await PDFDocument.load(buffer, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
  } catch {
    throw new Error("FINAL_PDF_INVALID");
  }
  if (
    document.getTitle() !== "NextDay Biz Funding Underwritten Application" ||
    document.getSubject() !== "NDBF finalized application PDF underwriting-v1" ||
    document.getCreator() !== "ndbf-pdf-finalizer" ||
    !document.getKeywords()?.includes(`entry:${entryId}`)
  ) {
    throw new Error("FINAL_PDF_METADATA_INVALID");
  }
  for (const page of document.getPages()) {
    const { width, height } = page.getSize();
    if (Math.abs(width - A4_WIDTH) > 1 || Math.abs(height - A4_HEIGHT) > 1) {
      throw new Error("FINAL_PDF_PAGE_SIZE_INVALID");
    }
  }
  return true;
}
