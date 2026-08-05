const INPUT_KEYS = new Set([
  "event_type",
  "schema_version",
  "analysis_version",
  "event_key",
  "entry_id",
  "status",
  "expected_document_count",
  "extracted_document_count",
]);

const ENTRY_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SHA256_PATTERN = /^[A-Fa-f0-9]{64}$/;
const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const ALLOWED_STATUSES = new Set(["READY", "REVIEW_REQUIRED"]);

export class NonRetryableFinalizerError extends Error {
  constructor(code) {
    super(code);
    this.name = "NonRetryableFinalizerError";
    this.code = code;
  }
}

export class RetryableFinalizerError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = "RetryableFinalizerError";
    this.code = code;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseUnderwritingReadyEvent(data) {
  let value;
  try {
    value = JSON.parse(Buffer.from(data ?? "").toString("utf8"));
  } catch {
    throw new NonRetryableFinalizerError("EVENT_JSON_INVALID");
  }
  if (!isPlainObject(value)) {
    throw new NonRetryableFinalizerError("EVENT_SHAPE_INVALID");
  }
  if (
    value.event_type !== "bank_statement_underwriting_ready" ||
    value.schema_version !== 1 ||
    value.analysis_version !== 1
  ) {
    return { kind: "irrelevant" };
  }
  if (
    Object.keys(value).some((key) => !INPUT_KEYS.has(key)) ||
    !ENTRY_ID_PATTERN.test(value.entry_id ?? "") ||
    value.event_key !== `bank_statement_underwriting:${value.entry_id}:v1` ||
    !ALLOWED_STATUSES.has(value.status) ||
    !Number.isInteger(value.expected_document_count) ||
    value.expected_document_count < 1 ||
    !Number.isInteger(value.extracted_document_count) ||
    value.extracted_document_count !== value.expected_document_count
  ) {
    throw new NonRetryableFinalizerError("EVENT_CONTRACT_INVALID");
  }
  return { kind: "accepted", event: value };
}

function assertArray(value, field) {
  if (!Array.isArray(value)) {
    throw new RetryableFinalizerError(`SUMMARY_${field.toUpperCase()}_INVALID`);
  }
}

function assertBoundedString(value, field, { nullable = true, max = 512 } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return;
    throw new RetryableFinalizerError(`SUMMARY_${field.toUpperCase()}_INVALID`);
  }
  if (typeof value !== "string" || value.length > max) {
    throw new RetryableFinalizerError(`SUMMARY_${field.toUpperCase()}_INVALID`);
  }
}

function validateRows(rows, fields, name, status) {
  for (const row of rows) {
    if (!isPlainObject(row)) {
      throw new RetryableFinalizerError(`SUMMARY_${name}_INVALID`);
    }
    for (const [field, options = {}] of fields) {
      const value = row[field];
      const required = status === "READY" && options.requiredReady;
      if (options.type === "decimal") {
        if (
          (value === null || value === undefined) &&
          !required
        ) continue;
        if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
          throw new RetryableFinalizerError(`SUMMARY_${name}_INVALID`);
        }
      } else if (options.type === "count") {
        if ((value === null || value === undefined) && !required) continue;
        if (
          !(Number.isInteger(value) && value >= 0) &&
          !(typeof value === "string" && INTEGER_PATTERN.test(value))
        ) {
          throw new RetryableFinalizerError(`SUMMARY_${name}_INVALID`);
        }
      } else {
        assertBoundedString(value, `${name}_${field}`, {
          ...options,
          nullable: required ? false : options.nullable,
        });
      }
    }
  }
}

export function validateSummaryRow(row, event) {
  if (!isPlainObject(row)) {
    throw new RetryableFinalizerError("SUMMARY_ROW_INVALID");
  }
  if (
    row.entry_id !== event.entry_id ||
    row.analysis_version !== 1 ||
    row.analysis_status !== event.status ||
    row.expected_document_count !== event.expected_document_count ||
    row.extracted_document_count !== event.extracted_document_count ||
    row.all_documents_processed !== true ||
    row.pdf_layout_version !== "underwriting-v1" ||
    !/^[0-9]+$/.test(row.pdf_source_generation ?? "") ||
    !SHA256_PATTERN.test(row.pdf_source_sha256 ?? "") ||
    !SHA256_PATTERN.test(row.summary_fingerprint ?? "")
  ) {
    throw new RetryableFinalizerError("SUMMARY_EVENT_MISMATCH");
  }
  assertBoundedString(row.pdf_gcs_key, "pdf_gcs_key", {
    nullable: false,
    max: 1024,
  });
  assertArray(row.statements, "statements");
  assertArray(row.mca_deposits, "mca_deposits");
  assertArray(row.debt_accounts, "debt_accounts");
  if (
    row.statements.length !== event.extracted_document_count ||
    row.statements.length !== event.expected_document_count
  ) {
    throw new RetryableFinalizerError("SUMMARY_STATEMENT_COUNT_MISMATCH");
  }

  const documentBindings = new Map();
  const fileBindings = new Map();
  for (const statement of row.statements) {
    const documentId = statement?.document_id;
    const fileId = statement?.openai_file_id;
    if (
      typeof documentId !== "string" ||
      typeof fileId !== "string" ||
      !OPAQUE_ID_PATTERN.test(documentId) ||
      !OPAQUE_ID_PATTERN.test(fileId) ||
      (documentBindings.has(documentId) && documentBindings.get(documentId) !== fileId) ||
      (fileBindings.has(fileId) && fileBindings.get(fileId) !== documentId) ||
      documentBindings.has(documentId) ||
      fileBindings.has(fileId)
    ) {
      throw new RetryableFinalizerError("SUMMARY_DOCUMENT_BINDING_INVALID");
    }
    documentBindings.set(documentId, fileId);
    fileBindings.set(fileId, documentId);
  }

  validateRows(
    row.statements,
    [
      ["account_last_four", { max: 4 }],
      ["statement_start_date", { max: 10 }],
      ["statement_end_date", { max: 10 }],
      ["deposits", { type: "decimal", requiredReady: true }],
      ["deposit_count", { type: "count", requiredReady: true }],
      ["true_revenue", { type: "decimal", requiredReady: true }],
      ["withdrawals", { type: "decimal", requiredReady: true }],
      ["negative_ending_days", { type: "count", requiredReady: true }],
      ["average_daily_balance", { type: "decimal", requiredReady: true }],
      ["mca_detected", { max: 16 }],
      ["quality_status", { max: 32 }],
    ],
    "STATEMENT",
    event.status,
  );
  validateRows(
    row.mca_deposits,
    [
      ["account_last_four", { max: 4 }],
      ["lender", { nullable: false, max: 512 }],
      ["deposit_date", { max: 10 }],
      ["amount", { type: "decimal", requiredReady: true }],
      ["statement_start_date", { max: 10 }],
      ["statement_end_date", { max: 10 }],
    ],
    "MCA_DEPOSIT",
    event.status,
  );
  validateRows(
    row.debt_accounts,
    [
      ["lender", { nullable: false, max: 512 }],
      ["debt_type", { max: 64 }],
      ["first_payment_date", { max: 10 }],
      ["last_payment_date", { max: 10 }],
      ["status", { max: 32 }],
      ["payments", { type: "count", requiredReady: true }],
      ["total_paid", { type: "decimal", requiredReady: true }],
      ["frequency", { max: 32 }],
      ["estimated_monthly", { type: "decimal", requiredReady: true }],
    ],
    "DEBT_ACCOUNT",
    event.status,
  );
  return {
    ...row,
    pdf_source_sha256: row.pdf_source_sha256.toLowerCase(),
    summary_fingerprint: row.summary_fingerprint.toLowerCase(),
  };
}

export function isSha256(value) {
  return SHA256_PATTERN.test(value ?? "");
}
