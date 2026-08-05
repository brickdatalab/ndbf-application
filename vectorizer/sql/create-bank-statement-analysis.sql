CREATE TABLE IF NOT EXISTS
  `lithe-hallway-493420-r4.ndbf_applications.bank_statement_agent_extractions`
(
  entry_id STRING NOT NULL,
  document_id STRING NOT NULL,
  document_index INT64 NOT NULL,
  openai_file_id STRING NOT NULL,
  extracted_at TIMESTAMP NOT NULL,
  statement STRUCT<
    summary STRUCT<
      account_number STRING,
      bank_name STRING,
      company STRING,
      start_balance NUMERIC,
      end_balance NUMERIC,
      statement_start_date DATE,
      statement_end_date DATE,
      total_credits NUMERIC,
      total_debits NUMERIC
    >,
    transactions ARRAY<STRUCT<
      date DATE,
      description STRING,
      amount NUMERIC
    >>
  > NOT NULL
)
PARTITION BY DATE(extracted_at)
CLUSTER BY entry_id, document_id, openai_file_id
OPTIONS (
  description = 'One OpenAI extraction result per bank-statement PDF.',
  labels = [('system', 'ndbf-application'), ('purpose', 'bank-statement-extraction')]
);

CREATE OR REPLACE VIEW
  `lithe-hallway-493420-r4.ndbf_applications.bank_statement_extractions_canonical`
OPTIONS (
  description = 'One deterministic latest extraction per OpenAI file ID, with duplicate diagnostics.'
)
AS
WITH hashed AS (
  SELECT
    entry_id,
    document_id,
    document_index,
    openai_file_id,
    extracted_at,
    statement,
    TO_HEX(SHA256(TO_JSON_STRING(statement))) AS payload_hash,
    TO_HEX(
      SHA256(
        TO_JSON_STRING(
          STRUCT(
            entry_id AS entry_id,
            document_id AS document_id,
            document_index AS document_index,
            openai_file_id AS openai_file_id
          )
        )
      )
    ) AS binding_hash
  FROM
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_agent_extractions`
),
duplicate_diagnostics AS (
  SELECT
    openai_file_id,
    COUNT(*) AS duplicate_count,
    COUNT(DISTINCT payload_hash) > 1 AS duplicate_payload_conflict,
    COUNT(DISTINCT binding_hash) > 1 AS duplicate_binding_conflict
  FROM hashed
  GROUP BY openai_file_id
),
ranked AS (
  SELECT
    hashed.*,
    ROW_NUMBER() OVER (
      PARTITION BY openai_file_id
      ORDER BY
        extracted_at DESC,
        payload_hash DESC,
        binding_hash,
        entry_id,
        document_id,
        document_index
    ) AS canonical_rank
  FROM hashed
)
SELECT
  ranked.entry_id,
  ranked.document_id,
  ranked.document_index,
  ranked.openai_file_id,
  ranked.extracted_at,
  ranked.statement,
  ranked.payload_hash,
  duplicate_diagnostics.duplicate_count,
  duplicate_diagnostics.duplicate_payload_conflict,
  duplicate_diagnostics.duplicate_binding_conflict
FROM ranked
JOIN duplicate_diagnostics USING (openai_file_id)
WHERE ranked.canonical_rank = 1;

CREATE OR REPLACE VIEW
  `lithe-hallway-493420-r4.ndbf_applications.bank_statement_calculated`
OPTIONS (
  description = 'One calculated and reconciled record per extracted bank-statement PDF.'
)
AS
WITH extracted AS (
  SELECT
    entry_id,
    document_id,
    document_index,
    openai_file_id,
    extracted_at,
    statement.summary.account_number AS account_number,
    statement.summary.bank_name AS bank_name,
    statement.summary.company AS company,
    statement.summary.start_balance AS start_balance,
    statement.summary.end_balance AS end_balance,
    statement.summary.statement_start_date AS statement_start_date,
    statement.summary.statement_end_date AS statement_end_date,
    statement.summary.total_credits AS total_credits,
    statement.summary.total_debits AS total_debits,
    statement.transactions AS transactions,
    ARRAY_LENGTH(statement.transactions) AS num_transactions,
    (
      SELECT COUNTIF(transaction.amount > 0)
      FROM UNNEST(statement.transactions) AS transaction
    ) AS num_credits,
    (
      SELECT COUNTIF(transaction.amount < 0)
      FROM UNNEST(statement.transactions) AS transaction
    ) AS num_debits,
    (
      SELECT COUNTIF(transaction.amount IS NULL)
      FROM UNNEST(statement.transactions) AS transaction
    ) AS missing_amount_count,
    (
      SELECT COUNTIF(transaction.date IS NULL)
      FROM UNNEST(statement.transactions) AS transaction
    ) AS missing_date_count,
    (
      SELECT COALESCE(
        SUM(IF(transaction.amount > 0, transaction.amount, NUMERIC '0')),
        NUMERIC '0'
      )
      FROM UNNEST(statement.transactions) AS transaction
    ) AS known_credit_total,
    (
      SELECT COALESCE(
        SUM(IF(transaction.amount < 0, ABS(transaction.amount), NUMERIC '0')),
        NUMERIC '0'
      )
      FROM UNNEST(statement.transactions) AS transaction
    ) AS known_debit_total,
    (
      SELECT COALESCE(SUM(transaction.amount), NUMERIC '0')
      FROM UNNEST(statement.transactions) AS transaction
    ) AS known_signed_total
  FROM
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_extractions_canonical`
),
calculated AS (
  SELECT
    *,
    IF(missing_amount_count = 0, known_credit_total, NULL) AS calculated_total_credits,
    IF(missing_amount_count = 0, known_debit_total, NULL) AS calculated_total_debits,
    IF(
      start_balance IS NOT NULL AND missing_amount_count = 0,
      start_balance + known_signed_total,
      NULL
    ) AS calculated_end_balance,
    start_balance IS NOT NULL
      AND missing_amount_count = 0
      AND missing_date_count = 0 AS running_balances_complete
  FROM extracted
),
completed AS (
  SELECT
    *,
    ARRAY(
      SELECT AS STRUCT
        transaction.date,
        transaction.description,
        transaction.amount,
        IF(
          running_balances_complete,
          start_balance + SUM(transaction.amount) OVER (
            ORDER BY transaction.date, source_offset
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ),
          NULL
        ) AS balance
      FROM UNNEST(transactions) AS transaction WITH OFFSET AS source_offset
      ORDER BY transaction.date IS NULL, transaction.date, source_offset
    ) AS calculated_transactions
  FROM calculated
)
SELECT
  entry_id,
  document_id,
  document_index,
  openai_file_id,
  extracted_at,
  STRUCT(
    STRUCT(
      account_number AS account_number,
      bank_name AS bank_name,
      company AS company,
      start_balance AS start_balance,
      end_balance AS end_balance,
      statement_start_date AS statement_start_date,
      statement_end_date AS statement_end_date,
      total_credits AS total_credits,
      total_debits AS total_debits,
      calculated_total_credits AS calculated_total_credits,
      calculated_total_debits AS calculated_total_debits,
      calculated_end_balance AS calculated_end_balance,
      num_credits AS num_credits,
      num_debits AS num_debits,
      num_transactions AS num_transactions
    ) AS summary,
    calculated_transactions AS transactions
  ) AS statement,
  STRUCT(
    calculated_total_credits - total_credits AS credits_difference,
    CASE
      WHEN total_credits IS NULL THEN 'PRINTED_VALUE_MISSING'
      WHEN calculated_total_credits IS NULL THEN 'CALCULATION_INCOMPLETE'
      WHEN ABS(calculated_total_credits - total_credits) <= NUMERIC '0.01' THEN 'MATCH'
      ELSE 'MISMATCH'
    END AS credits_status,
    calculated_total_debits - total_debits AS debits_difference,
    CASE
      WHEN total_debits IS NULL THEN 'PRINTED_VALUE_MISSING'
      WHEN calculated_total_debits IS NULL THEN 'CALCULATION_INCOMPLETE'
      WHEN ABS(calculated_total_debits - total_debits) <= NUMERIC '0.01' THEN 'MATCH'
      ELSE 'MISMATCH'
    END AS debits_status,
    calculated_end_balance - end_balance AS ending_balance_difference,
    CASE
      WHEN end_balance IS NULL THEN 'PRINTED_VALUE_MISSING'
      WHEN calculated_end_balance IS NULL THEN 'CALCULATION_INCOMPLETE'
      WHEN ABS(calculated_end_balance - end_balance) <= NUMERIC '0.01' THEN 'MATCH'
      ELSE 'MISMATCH'
    END AS ending_balance_status
  ) AS reconciliation
FROM completed;

CREATE OR REPLACE VIEW
  `lithe-hallway-493420-r4.ndbf_applications.submission_bank_statement_summary`
OPTIONS (
  description = 'One underwriting summary per application across all tracked bank-statement PDFs.'
)
AS
WITH source_documents AS (
  SELECT
    entry_id,
    document_id,
    document_index,
    openai_file_id,
    updated_at
  FROM
    `lithe-hallway-493420-r4.ndbf_applications.submission_documents`
  WHERE document_type = 'bank_statement'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY entry_id, document_id
    ORDER BY updated_at DESC, document_index, COALESCE(openai_file_id, '') DESC
  ) = 1
),
documents AS (
  SELECT
    source.entry_id,
    source.document_id,
    source.document_index,
    source.openai_file_id,
    calculated.extracted_at,
    calculated.statement,
    calculated.reconciliation,
    calculated.document_id IS NOT NULL AS extraction_received
  FROM
    source_documents AS source
  LEFT JOIN
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_calculated` AS calculated
    ON source.entry_id = calculated.entry_id
    AND source.document_id = calculated.document_id
    AND source.document_index = calculated.document_index
    AND source.openai_file_id = calculated.openai_file_id
),
grouped AS (
  SELECT
    entry_id,
    COUNT(*) AS expected_document_count,
    COUNTIF(extraction_received) AS extracted_document_count,
    COUNTIF(extraction_received) = COUNT(*) AS all_documents_processed,
    COUNTIF(
      reconciliation.credits_status = 'MISMATCH'
      OR reconciliation.debits_status = 'MISMATCH'
      OR reconciliation.ending_balance_status = 'MISMATCH'
    ) AS reconciliation_mismatch_count,
    COUNTIF(
      reconciliation.credits_status IN ('PRINTED_VALUE_MISSING', 'CALCULATION_INCOMPLETE')
      OR reconciliation.debits_status IN ('PRINTED_VALUE_MISSING', 'CALCULATION_INCOMPLETE')
      OR reconciliation.ending_balance_status IN ('PRINTED_VALUE_MISSING', 'CALCULATION_INCOMPLETE')
    ) AS incomplete_reconciliation_count,
    IF(
      COUNTIF(extraction_received) = COUNT(*),
      SUM(statement.summary.num_transactions),
      NULL
    ) AS num_transactions,
    IF(
      COUNTIF(extraction_received) = COUNT(*),
      SUM(statement.summary.num_credits),
      NULL
    ) AS num_credits,
    IF(
      COUNTIF(extraction_received) = COUNT(*),
      SUM(statement.summary.num_debits),
      NULL
    ) AS num_debits,
    IF(
      COUNTIF(extraction_received) = COUNT(*)
        AND COUNTIF(statement.summary.calculated_total_credits IS NULL) = 0,
      SUM(statement.summary.calculated_total_credits),
      NULL
    ) AS calculated_total_credits,
    IF(
      COUNTIF(extraction_received) = COUNT(*)
        AND COUNTIF(statement.summary.calculated_total_debits IS NULL) = 0,
      SUM(statement.summary.calculated_total_debits),
      NULL
    ) AS calculated_total_debits,
    ARRAY_AGG(
      STRUCT(
        document_id AS document_id,
        document_index AS document_index,
        openai_file_id AS openai_file_id,
        extraction_received AS extraction_received,
        extracted_at AS extracted_at,
        statement.summary.statement_start_date AS statement_start_date,
        statement.summary.statement_end_date AS statement_end_date,
        statement.summary.num_transactions AS num_transactions,
        statement.summary.num_credits AS num_credits,
        statement.summary.num_debits AS num_debits,
        statement.summary.calculated_total_credits AS calculated_total_credits,
        statement.summary.calculated_total_debits AS calculated_total_debits,
        statement.summary.calculated_end_balance AS calculated_end_balance,
        reconciliation.credits_status AS credits_status,
        reconciliation.debits_status AS debits_status,
        reconciliation.ending_balance_status AS ending_balance_status
      )
      ORDER BY document_index, document_id, COALESCE(openai_file_id, '')
    ) AS documents
  FROM documents
  GROUP BY entry_id
)
SELECT
  entry_id,
  expected_document_count,
  extracted_document_count,
  all_documents_processed,
  num_transactions,
  num_credits,
  num_debits,
  calculated_total_credits,
  calculated_total_debits,
  reconciliation_mismatch_count,
  incomplete_reconciliation_count,
  documents
FROM grouped;
