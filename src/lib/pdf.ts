import jsPDF from "jspdf";
import type { FormData } from "../store";
import { TERMS_PARAGRAPHS } from "./terms";
import {
  MONTHS,
  SALES_BUCKETS,
  US_STATE_NAMES,
} from "./constants";
import {
  formatUSD,
  redactEmail,
  redactPhone,
  salesBucketLabel,
} from "./utils";
import {
  PDF_LAYOUT_VERSION,
  getPdfLayoutContract,
} from "../../shared/pdf-layout-contract.js";
import {
  addUnderwritingSourcePage,
  drawSourcePdfFooter,
} from "../../shared/pdf-underwriting-page.js";

type PdfArgs = {
  submittedAtIso: string;
  appParam: string | null;
  formData: FormData;
};

const PAGE_W = 210; // A4 mm
const MARGIN_X = 18;
const RIGHT = PAGE_W - MARGIN_X;

// Brand colors (RGB)
const C_NAVY: [number, number, number] = [0, 33, 64];
const C_BLUE: [number, number, number] = [0, 117, 223];
const C_BODY: [number, number, number] = [51, 51, 51];
const C_MUTED: [number, number, number] = [120, 120, 120];
const C_RULE: [number, number, number] = [220, 220, 220];

/**
 * Render a clean, Gravity-Forms-style PDF of the application.
 * Shows field label / field value. Redacts contact phone + email.
 * Includes the full Part 5 legal clause and the drawn signature image.
 * Returns a data URL for the multipart submission upload.
 */
export async function generateApplicationPdf({
  submittedAtIso,
  appParam,
  formData,
}: PdfArgs): Promise<string> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const layout = getPdfLayoutContract(PDF_LAYOUT_VERSION);
  if (!layout) throw new Error(`Missing PDF layout contract: ${PDF_LAYOUT_VERSION}`);
  doc.setProperties(layout.metadata);
  let y = 18;

  // Diagonal "nextdaybizfunding" watermark drawn first on every page so it sits
  // behind all subsequent content. Faint navy at low opacity, rotated ~30° so it
  // runs from the bottom-left toward the upper-right corner of the page.
  const drawWatermark = () => {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.saveGraphicsState();
    // jsPDF's GState API isn't fully typed in older @types — cast to any so TS doesn't complain.
    // Opacity 0.07 keeps the mark visible on screen but unobtrusive over text.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const GState = (doc as any).GState;
    if (GState) doc.setGState(new GState({ opacity: 0.07 }));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(72);
    doc.setTextColor(...C_NAVY);
    doc.text("nextdaybizfunding", pageW / 2, pageH / 2, {
      align: "center",
      angle: 30,
      baseline: "middle",
    });
    doc.restoreGraphicsState();
  };

  const drawHeader = () => {
    // Draw the watermark first so it sits underneath the header bar + page content.
    drawWatermark();
    doc.setFillColor(...C_NAVY);
    doc.rect(0, 0, PAGE_W, 14, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("NextDay Biz Funding — Application", MARGIN_X, 9.5);
    y = 22;
  };

  const ensureSpace = (needed: number) => {
    const h = doc.internal.pageSize.getHeight();
    if (y + needed > h - 18) {
      doc.addPage();
      drawHeader();
    }
  };

  const sectionTitle = (label: string) => {
    ensureSpace(14);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...C_NAVY);
    doc.text(label.toUpperCase(), MARGIN_X, y);
    y += 2;
    doc.setDrawColor(...C_BLUE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN_X, y, RIGHT, y);
    y += 5;
  };

  const field = (label: string, value: string | undefined | null) => {
    ensureSpace(9);
    const v = value && String(value).trim() ? String(value) : "—";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...C_MUTED);
    doc.text(label.toUpperCase(), MARGIN_X, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...C_BODY);
    const wrapped = doc.splitTextToSize(v, RIGHT - MARGIN_X);
    doc.text(wrapped, MARGIN_X, y);
    y += 4.2 * wrapped.length + 2;
  };

  const twoFields = (
    l1: string,
    v1: string | undefined | null,
    l2: string,
    v2: string | undefined | null
  ) => {
    ensureSpace(12);
    const colW = (RIGHT - MARGIN_X) / 2;
    const yStart = y;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...C_MUTED);
    doc.text(l1.toUpperCase(), MARGIN_X, y);
    doc.text(l2.toUpperCase(), MARGIN_X + colW, y);

    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...C_BODY);
    const w1 = doc.splitTextToSize(
      (v1 && String(v1).trim()) || "—",
      colW - 4
    );
    const w2 = doc.splitTextToSize(
      (v2 && String(v2).trim()) || "—",
      colW - 4
    );
    doc.text(w1, MARGIN_X, y);
    doc.text(w2, MARGIN_X + colW, y);

    y = yStart + 4 + 4.2 * Math.max(w1.length, w2.length) + 2;
  };

  drawHeader();

  // META block
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C_BODY);
  doc.text(`Submitted: ${new Date(submittedAtIso).toLocaleString("en-US")}`, MARGIN_X, y);
  doc.text(`Rep (app): ${appParam ?? "n/a"}`, RIGHT, y, { align: "right" });
  y += 8;

  // Section 1 — Contact (phone + email REDACTED per scope)
  sectionTitle("Primary Contact Information");
  field("Full Name", formData.contactName);
  twoFields(
    "Email Address (redacted)",
    redactEmail(formData.contactEmail),
    "Phone Number (redacted)",
    redactPhone(formData.contactPhone)
  );

  // Section 2 — Business
  sectionTitle("Business Information");
  twoFields("Legal Business Name", formData.businessLegalName, "DBA", formData.dba || "—");
  const physicalLine =
    [
      formData.physicalAddress.street,
      formData.physicalAddress.city,
      formData.physicalAddress.state,
      formData.physicalAddress.zip,
    ]
      .filter(Boolean)
      .join(", ") || "—";
  field("Physical Address", physicalLine);

  const industryLabel =
    formData.industry === "Other" && formData.industryOther
      ? `Other — ${formData.industryOther}`
      : formData.industry;
  twoFields(
    "Industry Type",
    industryLabel,
    "State of Incorporation",
    formData.stateOfIncorporation
      ? `${formData.stateOfIncorporation} — ${US_STATE_NAMES[formData.stateOfIncorporation] ?? ""}`
      : ""
  );

  const monthLabel =
    MONTHS.find((m) => m.value === formData.businessStartedMonth)?.label ?? "";
  const startedLabel =
    monthLabel && formData.businessStartedYear
      ? `${monthLabel} ${formData.businessStartedYear}`
      : "—";
  twoFields("Date Business Started", startedLabel, "Federal Tax ID (EIN)", formData.federalTaxId);

  twoFields(
    "Type of Business Entity",
    formData.businessEntityType,
    "Gross Annual Sales",
    salesBucketLabel(formData.grossAnnualSalesBucket, SALES_BUCKETS)
  );
  field(
    "Requested Funding Amount",
    formData.requestedFundingAmount ? formatUSD(formData.requestedFundingAmount) : "—"
  );

  // Section 3 — Ownership
  sectionTitle("Ownership Details (Primary Owner)");
  twoFields(
    "Full Name",
    formData.owner.fullName,
    "Ownership Percentage",
    formData.owner.ownershipPercentage !== "" &&
      formData.owner.ownershipPercentage !== null
      ? `${formData.owner.ownershipPercentage}%`
      : "—"
  );
  twoFields("Social Security Number", formData.owner.ssn, "Date of Birth", formData.owner.dateOfBirth);
  const ownerAddress =
    [
      formData.owner.address.street,
      formData.owner.address.city,
      formData.owner.address.state,
      formData.owner.address.zip,
    ]
      .filter(Boolean)
      .join(", ") || "—";
  field("Home Address", ownerAddress);

  // Section 4 — Bank statements (metadata only; files live in GCS in production)
  sectionTitle("Bank Statements");
  if (formData.bankStatements.length === 0) {
    field("Files Uploaded", "None");
  } else {
    const lines = formData.bankStatements
      .map(
        (f, i) =>
          `${i + 1}. ${f.name}  •  ${f.type || "unknown type"}  •  ${(f.size / 1024 / 1024).toFixed(2)} MB`
      )
      .join("\n");
    field(`Files Uploaded (${formData.bankStatements.length})`, lines);
  }

  // Section 5 — Authorization + signature
  // Compact legal fine print so the complete clause remains readable without
  // consuming disproportionate vertical space in the application PDF.
  sectionTitle("Authorization and Agreement");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.25);
  doc.setTextColor(...C_BODY);
  for (const para of TERMS_PARAGRAPHS) {
    ensureSpace(6);
    const lines = doc.splitTextToSize(para, RIGHT - MARGIN_X);
    doc.text(lines, MARGIN_X, y);
    y += 2.15 * lines.length + 0.8;
  }

  // Signature block
  ensureSpace(34);
  y += 4;
  doc.setDrawColor(...C_RULE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_X, y + 22, MARGIN_X + 80, y + 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_NAVY);
  doc.text("Signature", MARGIN_X, y + 26);

  if (formData.signature && formData.signature.startsWith("data:image")) {
    try {
      doc.addImage(formData.signature, "PNG", MARGIN_X, y, 80, 22);
    } catch {
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...C_MUTED);
      doc.text("Signature not embeddable", MARGIN_X, y + 12);
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...C_MUTED);
    doc.text("No signature provided", MARGIN_X, y + 12);
  }

  // Date + certifier
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_NAVY);
  doc.text("Signed On", RIGHT - 50, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_BODY);
  doc.setFontSize(10);
  doc.text(new Date(submittedAtIso).toLocaleDateString("en-US"), RIGHT - 50, y + 11);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_NAVY);
  doc.text("Printed Name", RIGHT - 50, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_BODY);
  doc.setFontSize(10);
  doc.text(formData.owner.fullName || formData.contactName || "—", RIGHT - 50, y + 25);

  y += 30;

  // Dedicated versioned underwriting shell. It intentionally contains headings
  // only: the immutable signed source never carries provisional or fake values.
  addUnderwritingSourcePage(doc, layout);

  // Footer on every page
  const pageTotal = doc.getNumberOfPages();
  for (let i = 1; i <= pageTotal; i++) {
    doc.setPage(i);
    drawSourcePdfFooter(doc, i, pageTotal);
  }

  return doc.output("datauristring");
}
