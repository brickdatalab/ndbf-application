import { jsPDF } from "jspdf";
import { createHash } from "node:crypto";
import {
  PDF_LAYOUT_VERSION,
  getPdfLayoutContract,
} from "@ndbf/pdf-layout/pdf-layout-contract.js";
import {
  addUnderwritingSourcePage,
  drawSourcePdfFooter,
} from "@ndbf/pdf-layout/pdf-underwriting-page.js";

export const ENTRY_ID = "ndbf_synthetic123";

function createSourcePdf() {
  const contract = getPdfLayoutContract(PDF_LAYOUT_VERSION);
  const document = new jsPDF({ unit: "mm", format: "a4" });
  document.setProperties(contract.metadata);
  document.text("Synthetic signed application", 18, 25);
  addUnderwritingSourcePage(document, contract);
  for (let page = 1; page <= 2; page += 1) {
    document.setPage(page);
    drawSourcePdfFooter(document, page, 2);
  }
  return Buffer.from(document.output("arraybuffer"));
}

const SOURCE_PDF = createSourcePdf();

export function sourcePdf() {
  return Buffer.from(SOURCE_PDF);
}

export const SOURCE_PDF_SHA256 = createHash("sha256")
  .update(SOURCE_PDF)
  .digest("hex");

export function readyEvent(status = "READY") {
  return {
    event_type: "bank_statement_underwriting_ready",
    schema_version: 1,
    analysis_version: 1,
    event_key: `bank_statement_underwriting:${ENTRY_ID}:v1`,
    entry_id: ENTRY_ID,
    status,
    expected_document_count: 1,
    extracted_document_count: 1,
  };
}

export function summaryRow({
  status = "READY",
  fingerprint = "A".repeat(64),
  statementCount = 1,
} = {}) {
  return {
    entry_id: ENTRY_ID,
    analysis_version: 1,
    analysis_status: status,
    expected_document_count: statementCount,
    extracted_document_count: statementCount,
    all_documents_processed: true,
    pdf_layout_version: "underwriting-v1",
    pdf_source_generation: "10",
    pdf_source_sha256: SOURCE_PDF_SHA256,
    pdf_gcs_key: `gs://app_banks/synthetic_${ENTRY_ID}/synthetic.pdf`,
    summary_fingerprint: fingerprint,
    statements: Array.from({ length: statementCount }, (_value, index) => {
      const suffix = String(index + 1).padStart(3, "0");
      return {
        document_id: `doc_synthetic${suffix}`,
        openai_file_id: `file_synthetic${suffix}`,
        account_last_four: "0371",
        statement_start_date: "2024-06-03",
        statement_end_date: "2024-06-30",
        deposits: "9007199254740993.123456789",
        deposit_count: 7,
        true_revenue: "278945.82",
        withdrawals: "292535.84",
        negative_ending_days: 0,
        average_daily_balance: "52197.31",
        mca_detected: status === "READY" ? "Yes" : "Review",
        quality_status: status,
      };
    }),
  };
}
