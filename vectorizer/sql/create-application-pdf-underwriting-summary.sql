-- Additive schema/version boundary for finalized application PDFs.
ALTER TABLE `lithe-hallway-493420-r4.ndbf_applications.submissions`
ADD COLUMN IF NOT EXISTS pdf_layout_version STRING
OPTIONS(description = 'Versioned PDF layout declared by the submitting client; NULL means legacy.');

CREATE OR REPLACE VIEW
  `lithe-hallway-493420-r4.ndbf_applications.application_pdf_underwriting_summary`
OPTIONS (
  description = 'One privacy-safe, presentation-ready underwritten PDF model per completed submission.'
)
AS
WITH statement_rows AS (
  SELECT
    underwriting.entry_id,
    underwriting.document_id,
    underwriting.document_index,
    underwriting.openai_file_id,
    underwriting.statement_start_date,
    underwriting.statement_end_date,
    REGEXP_EXTRACT(
      REGEXP_REPLACE(COALESCE(calculated.statement.summary.account_number, ''), r'[^0-9]', ''),
      r'([0-9]{4})$'
    ) AS account_last_four,
    CAST(underwriting.total_deposits AS STRING) AS deposits,
    calculated.statement.summary.num_credits AS deposit_count,
    CAST(underwriting.true_deposits AS STRING) AS true_revenue,
    CAST(calculated.statement.summary.calculated_total_debits AS STRING) AS withdrawals,
    underwriting.negative_balance_days AS negative_ending_days,
    CAST(underwriting.average_daily_balance AS STRING) AS average_daily_balance,
    CASE
      WHEN ARRAY_LENGTH(underwriting.mca_positions) > 0 THEN 'Yes'
      WHEN 'MCA_CANDIDATE_UNCONFIRMED' IN UNNEST(underwriting.quality_reasons) THEN 'Review'
      ELSE '—'
    END AS mca_detected,
    underwriting.quality_status,
    underwriting.quality_reasons
  FROM `lithe-hallway-493420-r4.ndbf_applications.bank_statement_underwriting_summary` AS underwriting
  JOIN `lithe-hallway-493420-r4.ndbf_applications.bank_statement_calculated` AS calculated
    USING (entry_id, document_id, document_index, openai_file_id)
),
statement_arrays AS (
  SELECT
    entry_id,
    ARRAY_AGG(
      STRUCT(
        document_id,
        document_index,
        openai_file_id,
        account_last_four,
        CAST(statement_start_date AS STRING) AS statement_start_date,
        CAST(statement_end_date AS STRING) AS statement_end_date,
        deposits,
        deposit_count,
        true_revenue,
        withdrawals,
        negative_ending_days,
        average_daily_balance,
        mca_detected,
        quality_status,
        quality_reasons
      )
      ORDER BY statement_start_date, statement_end_date, document_index, document_id
    ) AS statements
  FROM statement_rows
  GROUP BY entry_id
),
mca_deposit_rows AS (
  SELECT
    transactions.entry_id,
    transactions.document_id,
    transactions.document_index,
    transactions.openai_file_id,
    statements.account_last_four,
    transactions.canonical_counterparty AS lender,
    transactions.transaction_date AS deposit_date,
    CAST(transactions.amount AS STRING) AS amount,
    statements.statement_start_date,
    statements.statement_end_date,
    transactions.transaction_id
  FROM `lithe-hallway-493420-r4.ndbf_applications.bank_statement_transactions_classified` AS transactions
  JOIN statement_rows AS statements
    USING (entry_id, document_id, document_index, openai_file_id)
  WHERE transactions.amount > 0
    AND transactions.classification = 'MCA_FUNDING'
    AND transactions.confidence = 'CONFIRMED'
    AND transactions.paired_reversal_transaction_id IS NULL
    AND NOT transactions.is_reversed_original
    AND transactions.canonical_counterparty IS NOT NULL
),
mca_deposit_arrays AS (
  SELECT
    entry_id,
    ARRAY_AGG(
      STRUCT(
        document_id,
        document_index,
        openai_file_id,
        account_last_four,
        lender,
        CAST(deposit_date AS STRING) AS deposit_date,
        amount,
        CAST(statement_start_date AS STRING) AS statement_start_date,
        CAST(statement_end_date AS STRING) AS statement_end_date
      )
      ORDER BY deposit_date, document_index, lender, amount, transaction_id
    ) AS mca_deposits
  FROM mca_deposit_rows
  GROUP BY entry_id
),
position_rows AS (
  SELECT
    positions.entry_id,
    positions.account_key,
    positions.position_key,
    positions.canonical_lender AS lender,
    'Merchant Cash Advance' AS debt_type,
    MIN(positions.first_payment_date) AS first_payment_date,
    MAX(positions.last_payment_date) AS last_payment_date,
    CASE
      WHEN LOGICAL_OR(positions.position_review_required)
        OR LOGICAL_OR(positions.position_confidence != 'CONFIRMED')
        OR LOGICAL_OR(positions.status = 'CADENCE_UNCONFIRMED') THEN 'Review'
      WHEN LOGICAL_OR(positions.status = 'CURRENT_PAYING') THEN 'Current'
      WHEN LOGICAL_OR(positions.status = 'CURRENT_WITH_MISSES') THEN 'Current + misses'
      ELSE 'Inactive'
    END AS status,
    SUM(positions.successful_payment_count) AS payments,
    CAST(SUM(positions.total_paid) AS STRING) AS total_paid,
    CASE ANY_VALUE(positions.frequency HAVING MAX positions.last_payment_date)
      WHEN 'WEEKDAY' THEN 'Business daily'
      WHEN 'WEEKLY' THEN 'Weekly'
      WHEN 'BIWEEKLY' THEN 'Biweekly'
      WHEN 'MONTHLY' THEN 'Monthly'
      ELSE 'Unconfirmed'
    END AS frequency,
    CAST(
      CASE ANY_VALUE(positions.frequency HAVING MAX positions.last_payment_date)
        WHEN 'WEEKDAY' THEN ROUND(MAX(positions.payment_amount) * NUMERIC '21.75', 2)
        WHEN 'WEEKLY' THEN ROUND(MAX(positions.payment_amount) * NUMERIC '4.345', 2)
        WHEN 'BIWEEKLY' THEN ROUND(MAX(positions.payment_amount) * NUMERIC '2.1725', 2)
        WHEN 'MONTHLY' THEN ROUND(MAX(positions.payment_amount), 2)
        ELSE NULL
      END AS STRING
    ) AS estimated_monthly
  FROM `lithe-hallway-493420-r4.ndbf_applications.bank_statement_mca_positions` AS positions
  GROUP BY positions.entry_id, positions.account_key, positions.position_key, positions.canonical_lender
),
position_arrays AS (
  SELECT
    entry_id,
    ARRAY_AGG(
      STRUCT(
        position_key,
        lender,
        debt_type,
        CAST(first_payment_date AS STRING) AS first_payment_date,
        CAST(last_payment_date AS STRING) AS last_payment_date,
        status,
        payments,
        total_paid,
        frequency,
        estimated_monthly
      )
      ORDER BY first_payment_date, last_payment_date, lender, position_key
    ) AS debt_accounts
  FROM position_rows
  GROUP BY entry_id
),
assembled AS (
  SELECT
    summary.entry_id,
    summary.analysis_version,
    summary.analysis_status,
    summary.expected_document_count,
    summary.extracted_document_count,
    summary.all_documents_processed,
    IF(summary.all_documents_processed, statement_arrays.statements, NULL) AS statements,
    IF(
      summary.all_documents_processed,
      COALESCE(
        mca_deposit_arrays.mca_deposits,
        ARRAY<STRUCT<
          document_id STRING,
          document_index INT64,
          openai_file_id STRING,
          account_last_four STRING,
          lender STRING,
          deposit_date STRING,
          amount STRING,
          statement_start_date STRING,
          statement_end_date STRING
        >>[]
      ),
      NULL
    ) AS mca_deposits,
    IF(
      summary.all_documents_processed,
      COALESCE(
        position_arrays.debt_accounts,
        ARRAY<STRUCT<
          position_key STRING,
          lender STRING,
          debt_type STRING,
          first_payment_date STRING,
          last_payment_date STRING,
          status STRING,
          payments INT64,
          total_paid STRING,
          frequency STRING,
          estimated_monthly STRING
        >>[]
      ),
      NULL
    ) AS debt_accounts
  FROM `lithe-hallway-493420-r4.ndbf_applications.submission_underwriting_summary` AS summary
  LEFT JOIN statement_arrays USING (entry_id)
  LEFT JOIN mca_deposit_arrays USING (entry_id)
  LEFT JOIN position_arrays USING (entry_id)
)
SELECT
  assembled.*,
  IF(
    all_documents_processed,
    TO_HEX(
      SHA256(
        TO_JSON_STRING(
          STRUCT(
            analysis_version,
            analysis_status,
            expected_document_count,
            extracted_document_count,
            statements,
            mca_deposits,
            debt_accounts
          )
        )
      )
    ),
    NULL
  ) AS summary_fingerprint
FROM assembled;
