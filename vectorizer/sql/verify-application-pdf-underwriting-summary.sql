-- Run after installing create-application-pdf-underwriting-summary.sql in a guarded sandbox.
ASSERT (
  SELECT COUNT(*) = COUNT(DISTINCT entry_id)
  FROM `lithe-hallway-493420-r4.ndbf_applications.application_pdf_underwriting_summary`
) AS 'PDF summary must contain at most one row per entry_id';

ASSERT (
  SELECT COUNTIF(
    NOT all_documents_processed
    AND (statements IS NOT NULL OR mca_deposits IS NOT NULL OR debt_accounts IS NOT NULL)
  ) = 0
  FROM `lithe-hallway-493420-r4.ndbf_applications.application_pdf_underwriting_summary`
) AS 'Incomplete submissions must not expose partial PDF financial arrays';

ASSERT (
  SELECT COUNTIF(
    all_documents_processed
    AND (
      statements IS NULL
      OR mca_deposits IS NULL
      OR debt_accounts IS NULL
      OR summary_fingerprint IS NULL
      OR NOT REGEXP_CONTAINS(summary_fingerprint, r'^[0-9A-F]{64}$')
    )
  ) = 0
  FROM `lithe-hallway-493420-r4.ndbf_applications.application_pdf_underwriting_summary`
) AS 'Complete summaries require all arrays and a SHA-256 fingerprint';

ASSERT (
  SELECT COUNTIF(ARRAY_LENGTH(statements) != expected_document_count) = 0
  FROM `lithe-hallway-493420-r4.ndbf_applications.application_pdf_underwriting_summary`
  WHERE all_documents_processed
) AS 'Every expected statement must appear exactly once';

ASSERT (
  SELECT COUNTIF(deposit.amount IS NULL OR deposit.lender IS NULL) = 0
  FROM `lithe-hallway-493420-r4.ndbf_applications.application_pdf_underwriting_summary`,
  UNNEST(mca_deposits) AS deposit
  WHERE all_documents_processed
) AS 'MCA deposits must contain only confirmed display-ready rows';
