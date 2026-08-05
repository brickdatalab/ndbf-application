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
const MUTED = rgb(120 / 255, 120 / 255, 120 / 255);
const RULE = rgb(220 / 255, 220 / 255, 220 / 255);
const GREEN = rgb(24 / 255, 145 / 255, 87 / 255);

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

export function formatExactDecimal(value, { currency = false } = {}) {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value).trim();
  const match = text.match(/^(-?)([0-9]+)(\.[0-9]+)?$/);
  if (!match) return "—";
  const grouped = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const amount = `${grouped}${match[3] ?? ""}`;
  if (!currency) return `${match[1]}${amount}`;
  return match[1] ? `-$${amount}` : `$${amount}`;
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

function statementCells(row) {
  const detected =
    row.mca_detected === "Yes"
      ? "Yes"
      : row.mca_detected === "Review" || row.quality_status === "REVIEW_REQUIRED"
        ? "Review"
        : "—";
  return [
    formatPeriod(row.statement_start_date, row.statement_end_date),
    formatExactDecimal(row.deposits, { currency: true }),
    displayValue(row.deposit_count),
    formatExactDecimal(row.true_revenue, { currency: true }),
    formatExactDecimal(row.withdrawals, { currency: true }),
    displayValue(row.negative_ending_days),
    formatExactDecimal(row.average_daily_balance, { currency: true }),
    detected,
  ];
}

function mcaDepositCells(row) {
  const account = /^[0-9]{4}$/.test(row.account_last_four ?? "")
    ? `**** ${row.account_last_four}`
    : "—";
  return [
    account,
    displayValue(row.lender),
    formatDate(row.deposit_date),
    formatExactDecimal(row.amount, { currency: true }),
    formatPeriod(row.statement_start_date, row.statement_end_date),
  ];
}

function debtCells(row) {
  return [
    displayValue(row.lender),
    displayValue(row.debt_type),
    formatDate(row.first_payment_date),
    formatDate(row.last_payment_date),
    row.status === "Review" ? "Review" : displayValue(row.status),
    displayValue(row.payments),
    formatExactDecimal(row.total_paid, { currency: true }),
    row.frequency === "Unconfirmed" ? "Review" : displayValue(row.frequency),
    formatExactDecimal(row.estimated_monthly, { currency: true }),
  ];
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

function columnWidths(columns) {
  return columns.map((column, index) => {
    const right = columns[index + 1]?.xMm ?? RIGHT_MM;
    return mm(Math.max(4, right - column.xMm - 1.5));
  });
}

function prepareRow(font, cells, columns, fontSize) {
  const widths = columnWidths(columns);
  const lines = cells.map((cell, index) =>
    wrapText(font, cell, fontSize, widths[index]),
  );
  const lineCount = Math.max(...lines.map((value) => value.length));
  const lineHeight = fontSize + 1.2;
  return {
    lines,
    height: Math.max(mm(5), lineCount * lineHeight + 3),
    lineHeight,
  };
}

function drawPreparedRow({ page, row, columns, font, fontSize, topY, color }) {
  for (const [columnIndex, lines] of row.lines.entries()) {
    for (const [lineIndex, text] of lines.entries()) {
      page.drawText(text, {
        x: mm(columns[columnIndex].xMm),
        y: topY - fontSize - 1.5 - lineIndex * row.lineHeight,
        size: fontSize,
        font,
        color,
      });
    }
  }
  const bottomY = topY - row.height;
  page.drawLine({
    start: { x: mm(LEFT_MM), y: bottomY },
    end: { x: mm(RIGHT_MM), y: bottomY },
    thickness: 0.35,
    color: RULE,
  });
  return bottomY;
}

function drawRowsInBand({
  page,
  cells,
  columns,
  font,
  topMm,
  bottomMm,
  fontSize = 5.2,
}) {
  let topY = yFromTop(page, topMm);
  const bottomY = yFromTop(page, bottomMm);
  let index = 0;
  for (; index < cells.length; index += 1) {
    const row = prepareRow(font, cells[index], columns, fontSize);
    if (topY - row.height < bottomY) break;
    topY = drawPreparedRow({
      page,
      row,
      columns,
      font,
      fontSize,
      topY,
      color: cells[index].includes("Review") ? MUTED : NAVY,
    });
  }
  return cells.slice(index);
}

function drawContinuationFrame(page, fonts, entryId, section, layout) {
  page.drawText("nextdaybizfunding", {
    x: mm(35),
    y: mm(95),
    size: 72,
    font: fonts.bold,
    color: NAVY,
    opacity: 0.07,
    rotate: degrees(30),
  });
  page.drawRectangle({
    x: 0,
    y: page.getHeight() - mm(14),
    width: page.getWidth(),
    height: mm(14),
    color: NAVY,
  });
  page.drawText("NextDay Biz Funding — Application", {
    x: mm(LEFT_MM),
    y: page.getHeight() - mm(9.5),
    size: 13,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  drawEntryId(page, fonts.bold, entryId);
  page.drawText(`${section.title} — continued`, {
    x: mm(LEFT_MM),
    y: yFromTop(page, 28),
    size: 10.5,
    font: fonts.bold,
    color: NAVY,
  });
  page.drawLine({
    start: { x: mm(LEFT_MM), y: yFromTop(page, 31) },
    end: { x: mm(RIGHT_MM), y: yFromTop(page, 31) },
    thickness: 1,
    color: BLUE,
  });
  for (const column of section.columns) {
    const labels = column.label.split("\n");
    for (const [index, label] of labels.entries()) {
      page.drawText(label, {
        x: mm(column.xMm),
        y: yFromTop(page, 38) - index * 5.6,
        size: layout.rendering.columnFontSizePt,
        font: fonts.bold,
        color: MUTED,
      });
    }
  }
  page.drawLine({
    start: { x: mm(LEFT_MM), y: yFromTop(page, 44) },
    end: { x: mm(RIGHT_MM), y: yFromTop(page, 44) },
    thickness: 0.45,
    color: RULE,
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
  page.drawText("NextDay Biz Funding  |  Confidential Application", {
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

function drawContinuationPages({ document, fonts, entryId, cells, section, layout }) {
  let remaining = cells;
  while (remaining.length > 0) {
    const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
    drawContinuationFrame(page, fonts, entryId, section, layout);
    const next = drawRowsInBand({
      page,
      cells: remaining,
      columns: section.columns,
      font: fonts.normal,
      topMm: 46,
      bottomMm: 280,
    });
    if (next.length === remaining.length) {
      throw new Error("PDF_ROW_CANNOT_FIT");
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
  const page = document.getPages().at(-1);
  drawEntryId(page, fonts.bold, entryId);
  page.drawText(status === "REVIEW_REQUIRED" ? "Review required" : "Complete", {
    x: mm(LEFT_MM),
    y: yFromTop(page, 31),
    size: 5.2,
    font: fonts.bold,
    color: status === "REVIEW_REQUIRED" ? MUTED : GREEN,
  });

  const statementSection = layout.sections.find((item) => item.id === "statement-summary");
  const depositSection = layout.sections.find((item) => item.id === "mca-deposits");
  const debtSection = layout.sections.find((item) => item.id === "debt-summary");
  const statements = summary.statements.map(statementCells);
  const deposits = summary.mca_deposits.length
    ? summary.mca_deposits.map(mcaDepositCells)
    : [[status === "REVIEW_REQUIRED" ? "Review" : "None detected"]];
  const debts = summary.debt_accounts.length
    ? summary.debt_accounts.map(debtCells)
    : [[status === "REVIEW_REQUIRED" ? "Review" : "None detected"]];

  const statementOverflow = drawRowsInBand({
    page,
    cells: statements,
    columns: statementSection.columns,
    font: fonts.normal,
    topMm: 49,
    bottomMm: 63,
  });
  const depositOverflow = drawRowsInBand({
    page,
    cells: deposits,
    columns: depositSection.columns,
    font: fonts.normal,
    topMm: 79,
    bottomMm: 93,
  });
  const debtOverflow = drawRowsInBand({
    page,
    cells: debts,
    columns: debtSection.columns,
    font: fonts.normal,
    topMm: 109,
    bottomMm: 280,
  });

  drawContinuationPages({
    document,
    fonts,
    entryId,
    cells: statementOverflow,
    section: statementSection,
    layout,
  });
  drawContinuationPages({
    document,
    fonts,
    entryId,
    cells: depositOverflow,
    section: depositSection,
    layout,
  });
  drawContinuationPages({
    document,
    fonts,
    entryId,
    cells: debtOverflow,
    section: debtSection,
    layout,
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
      mcaDepositRows: summary.mca_deposits.length,
      debtRows: summary.debt_accounts.length,
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
