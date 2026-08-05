-- BigQuery Standard SQL
--
-- Creates immutable v1 underwriting reference data when absent, validates the
-- reference contracts, and publishes privacy-safe underwriting views. The
-- production identifiers are intentionally fully qualified so a sandbox
-- dataset can be substituted mechanically before execution.

CREATE TABLE IF NOT EXISTS
  `lithe-hallway-493420-r4.ndbf_applications.bank_transaction_rules`
(
  analysis_version INT64 NOT NULL,
  rule_id STRING NOT NULL,
  priority INT64 NOT NULL,
  active BOOL NOT NULL,
  match_type STRING NOT NULL,
  match_value STRING NOT NULL,
  direction STRING NOT NULL,
  classification STRING NOT NULL,
  confidence STRING NOT NULL,
  canonical_counterparty STRING,
  PRIMARY KEY (analysis_version, rule_id) NOT ENFORCED
)
CLUSTER BY analysis_version, active, priority
OPTIONS (
  description = 'Versioned deterministic bank-transaction classification rules. Lower priority numbers win.',
  labels = [('system', 'ndbf-application'), ('purpose', 'underwriting-reference')]
)
AS
SELECT *
FROM UNNEST([
  STRUCT(1 AS analysis_version, 'credibly_credit' AS rule_id, 10 AS priority, TRUE AS active, 'CONTAINS' AS match_type, 'CREDIBLY' AS match_value, 'CREDIT' AS direction, 'MCA_FUNDING' AS classification, 'CONFIRMED' AS confidence, 'Credibly' AS canonical_counterparty),
  (1, 'credibly_debit', 10, TRUE, 'CONTAINS', 'CREDIBLY', 'DEBIT', 'MCA_PAYMENT', 'CONFIRMED', 'Credibly'),
  (1, 'national_funding_credit', 10, TRUE, 'CONTAINS', 'NATIONAL FUNDING', 'CREDIT', 'MCA_FUNDING', 'CONFIRMED', 'National Funding'),
  (1, 'national_funding_debit', 10, TRUE, 'CONTAINS', 'NATIONAL FUNDING', 'DEBIT', 'MCA_PAYMENT', 'CONFIRMED', 'National Funding'),
  (1, 'nf1016_credit', 10, TRUE, 'CONTAINS', 'NF1016', 'CREDIT', 'MCA_FUNDING', 'CONFIRMED', 'National Funding'),
  (1, 'nf1016_debit', 10, TRUE, 'CONTAINS', 'NF1016', 'DEBIT', 'MCA_PAYMENT', 'CONFIRMED', 'National Funding'),
  (1, 'nfas2_credit', 10, TRUE, 'CONTAINS', 'NFAS2', 'CREDIT', 'MCA_FUNDING', 'CONFIRMED', 'National Funding'),
  (1, 'nfas2_debit', 10, TRUE, 'CONTAINS', 'NFAS2', 'DEBIT', 'MCA_PAYMENT', 'CONFIRMED', 'National Funding'),
  (1, 'cfgms_credit', 10, TRUE, 'CONTAINS', 'CFGMS', 'CREDIT', 'MCA_FUNDING', 'CONFIRMED', 'CFG Merchant Solutions'),
  (1, 'cfgms_debit', 10, TRUE, 'CONTAINS', 'CFGMS', 'DEBIT', 'MCA_PAYMENT', 'CONFIRMED', 'CFG Merchant Solutions'),
  (1, 'cfg_merchant_credit', 10, TRUE, 'CONTAINS', 'CFG MERCHANT', 'CREDIT', 'MCA_FUNDING', 'CONFIRMED', 'CFG Merchant Solutions'),
  (1, 'cfg_merchant_debit', 10, TRUE, 'CONTAINS', 'CFG MERCHANT', 'DEBIT', 'MCA_PAYMENT', 'CONFIRMED', 'CFG Merchant Solutions'),
  (1, 'first_alliance_numeric_credit', 10, TRUE, 'CONTAINS', '1ST ALLIANCE', 'CREDIT', 'MCA_FUNDING', 'CONFIRMED', '1st Alliance'),
  (1, 'first_alliance_numeric_debit', 10, TRUE, 'CONTAINS', '1ST ALLIANCE', 'DEBIT', 'MCA_PAYMENT', 'CONFIRMED', '1st Alliance'),
  (1, 'first_alliance_word_credit', 10, TRUE, 'CONTAINS', 'FIRST ALLIANCE', 'CREDIT', 'MCA_FUNDING', 'CONFIRMED', '1st Alliance'),
  (1, 'first_alliance_word_debit', 10, TRUE, 'CONTAINS', 'FIRST ALLIANCE', 'DEBIT', 'MCA_PAYMENT', 'CONFIRMED', '1st Alliance'),
  (1, 'business_loan_proceeds_credit', 20, TRUE, 'CONTAINS', 'BUSINESS LOAN PROCEEDS', 'CREDIT', 'OTHER_LOAN_PROCEEDS', 'CONFIRMED', CAST(NULL AS STRING)),
  (1, 'loan_proceeds_credit', 20, TRUE, 'CONTAINS', 'LOAN PROCEEDS', 'CREDIT', 'OTHER_LOAN_PROCEEDS', 'CONFIRMED', CAST(NULL AS STRING)),
  (1, 'reversal_marker', 20, TRUE, 'CONTAINS', 'REVERSAL', 'EITHER', 'REVERSAL', 'CONFIRMED', CAST(NULL AS STRING)),
  (1, 'returned_item_marker', 20, TRUE, 'CONTAINS', 'RETURNED ITEM', 'EITHER', 'REVERSAL', 'CONFIRMED', CAST(NULL AS STRING)),
  (1, 'ach_return_marker', 20, TRUE, 'CONTAINS', 'ACH RETURN', 'EITHER', 'REVERSAL', 'CONFIRMED', CAST(NULL AS STRING)),
  (1, 'transfer_from_savings_credit', 20, TRUE, 'CONTAINS', 'TRANSFER FROM SAVINGS', 'CREDIT', 'TRANSFER', 'CONFIRMED', CAST(NULL AS STRING)),
  (1, 'transfer_from_checking_credit', 20, TRUE, 'CONTAINS', 'TRANSFER FROM CHECKING', 'CREDIT', 'TRANSFER', 'CONFIRMED', CAST(NULL AS STRING)),
  (1, 'internal_transfer_credit', 20, TRUE, 'CONTAINS', 'INTERNAL TRANSFER', 'CREDIT', 'TRANSFER', 'CONFIRMED', CAST(NULL AS STRING)),
  (1, 'broad_transfer_credit_candidate', 100, TRUE, 'CONTAINS', 'TRANSFER', 'CREDIT', 'NON_REVENUE_CANDIDATE', 'CANDIDATE', CAST(NULL AS STRING)),
  (1, 'broad_capital_credit_candidate', 100, TRUE, 'CONTAINS', 'CAPITAL', 'CREDIT', 'NON_REVENUE_CANDIDATE', 'CANDIDATE', CAST(NULL AS STRING)),
  (1, 'broad_funding_credit_candidate', 100, TRUE, 'CONTAINS', 'FUNDING', 'CREDIT', 'NON_REVENUE_CANDIDATE', 'CANDIDATE', CAST(NULL AS STRING)),
  (1, 'broad_advance_credit_candidate', 100, TRUE, 'CONTAINS', 'ADVANCE', 'CREDIT', 'NON_REVENUE_CANDIDATE', 'CANDIDATE', CAST(NULL AS STRING)),
  (1, 'broad_loan_credit_candidate', 100, TRUE, 'CONTAINS', 'LOAN', 'CREDIT', 'NON_REVENUE_CANDIDATE', 'CANDIDATE', CAST(NULL AS STRING))
]);

ASSERT (
  SELECT COUNT(*) = COUNT(DISTINCT FORMAT('%d:%s', analysis_version, rule_id))
  FROM `lithe-hallway-493420-r4.ndbf_applications.bank_transaction_rules`
) AS 'bank_transaction_rules must be unique by analysis_version and rule_id';

ASSERT (
  SELECT COUNTIF(
    analysis_version IS NULL
    OR rule_id IS NULL
    OR priority IS NULL
    OR active IS NULL
    OR match_type IS NULL
    OR match_value IS NULL
    OR direction IS NULL
    OR classification IS NULL
    OR confidence IS NULL
    OR analysis_version < 1
    OR priority < 0
    OR match_type NOT IN ('EXACT', 'PREFIX', 'CONTAINS')
    OR direction NOT IN ('CREDIT', 'DEBIT', 'EITHER')
    OR classification NOT IN (
      'MCA_FUNDING',
      'MCA_PAYMENT',
      'OTHER_LOAN_PROCEEDS',
      'TRANSFER',
      'REVERSAL',
      'NON_REVENUE_CANDIDATE'
    )
    OR confidence NOT IN ('CONFIRMED', 'CANDIDATE')
    OR TRIM(match_value) = ''
    OR match_value != UPPER(
      TRIM(
        REGEXP_REPLACE(
          NORMALIZE_AND_CASEFOLD(match_value, NFKC),
          r'[^\p{L}\p{N}]+',
          ' '
        )
      )
    )
  ) = 0
  FROM `lithe-hallway-493420-r4.ndbf_applications.bank_transaction_rules`
) AS 'bank_transaction_rules contains an invalid enum, priority, or match value';

ASSERT (
  SELECT COUNT(*) = 29
  FROM `lithe-hallway-493420-r4.ndbf_applications.bank_transaction_rules`
  WHERE analysis_version = 1
) AS 'bank_transaction_rules v1 must contain exactly the approved 29 rules';

ASSERT (
  SELECT TO_HEX(
    SHA256(
      STRING_AGG(
        CONCAT(
          CAST(analysis_version AS STRING), '|',
          rule_id, '|',
          CAST(priority AS STRING), '|',
          IF(active, '1', '0'), '|',
          match_type, '|',
          match_value, '|',
          direction, '|',
          classification, '|',
          confidence, '|',
          COALESCE(canonical_counterparty, '<NULL>')
        ),
        '\n' ORDER BY rule_id
      )
    )
  ) = '862dcb865b27da66d5a715d80e03681cee4be10ab4071d9bcf9342d33d011706'
  FROM `lithe-hallway-493420-r4.ndbf_applications.bank_transaction_rules`
  WHERE analysis_version = 1
) AS 'bank_transaction_rules v1 differs from the approved immutable rule set';

CREATE TABLE IF NOT EXISTS
  `lithe-hallway-493420-r4.ndbf_applications.bank_business_calendar`
(
  calendar_date DATE NOT NULL,
  is_business_day BOOL NOT NULL,
  is_weekend BOOL NOT NULL,
  is_federal_holiday BOOL NOT NULL,
  holiday_name STRING,
  PRIMARY KEY (calendar_date) NOT ENFORCED
)
OPTIONS (
  description = 'Inclusive US banking calendar for 2015-01-01 through 2040-12-31.',
  labels = [('system', 'ndbf-application'), ('purpose', 'underwriting-reference')]
)
AS
WITH years AS (
  SELECT year
  FROM UNNEST(GENERATE_ARRAY(2015, 2040)) AS year
),
fixed_holidays AS (
  SELECT DATE(year, 1, 1) AS actual_date, "New Year's Day" AS holiday_name FROM years
  UNION ALL
  SELECT DATE(year, 6, 19), 'Juneteenth National Independence Day' FROM years WHERE year >= 2021
  UNION ALL
  SELECT DATE(year, 7, 4), 'Independence Day' FROM years
  UNION ALL
  SELECT DATE(year, 11, 11), 'Veterans Day' FROM years
  UNION ALL
  SELECT DATE(year, 12, 25), 'Christmas Day' FROM years
),
fixed_actual_and_observed AS (
  SELECT actual_date AS holiday_date, holiday_name FROM fixed_holidays
  UNION ALL
  SELECT
    DATE_ADD(actual_date, INTERVAL 1 DAY) AS holiday_date,
    CONCAT(holiday_name, ' (Observed)') AS holiday_name
  FROM fixed_holidays
  WHERE EXTRACT(DAYOFWEEK FROM actual_date) = 1
),
floating_holidays AS (
  SELECT
    DATE_ADD(
      DATE(year, 1, 1),
      INTERVAL MOD(2 - EXTRACT(DAYOFWEEK FROM DATE(year, 1, 1)) + 7, 7) + 14 DAY
    ) AS holiday_date,
    'Birthday of Martin Luther King, Jr.' AS holiday_name
  FROM years
  UNION ALL
  SELECT
    DATE_ADD(
      DATE(year, 2, 1),
      INTERVAL MOD(2 - EXTRACT(DAYOFWEEK FROM DATE(year, 2, 1)) + 7, 7) + 14 DAY
    ),
    "Washington's Birthday"
  FROM years
  UNION ALL
  SELECT
    DATE_SUB(
      LAST_DAY(DATE(year, 5, 1), MONTH),
      INTERVAL MOD(EXTRACT(DAYOFWEEK FROM LAST_DAY(DATE(year, 5, 1), MONTH)) - 2 + 7, 7) DAY
    ),
    'Memorial Day'
  FROM years
  UNION ALL
  SELECT
    DATE_ADD(
      DATE(year, 9, 1),
      INTERVAL MOD(2 - EXTRACT(DAYOFWEEK FROM DATE(year, 9, 1)) + 7, 7) DAY
    ),
    'Labor Day'
  FROM years
  UNION ALL
  SELECT
    DATE_ADD(
      DATE(year, 10, 1),
      INTERVAL MOD(2 - EXTRACT(DAYOFWEEK FROM DATE(year, 10, 1)) + 7, 7) + 7 DAY
    ),
    'Columbus Day'
  FROM years
  UNION ALL
  SELECT
    DATE_ADD(
      DATE(year, 11, 1),
      INTERVAL MOD(5 - EXTRACT(DAYOFWEEK FROM DATE(year, 11, 1)) + 7, 7) + 21 DAY
    ),
    'Thanksgiving Day'
  FROM years
),
holidays AS (
  SELECT
    holiday_date,
    STRING_AGG(DISTINCT holiday_name, '; ' ORDER BY holiday_name) AS holiday_name
  FROM (
    SELECT holiday_date, holiday_name FROM fixed_actual_and_observed
    UNION ALL
    SELECT holiday_date, holiday_name FROM floating_holidays
  )
  WHERE holiday_date BETWEEN DATE '2015-01-01' AND DATE '2040-12-31'
  GROUP BY holiday_date
),
dates AS (
  SELECT calendar_date
  FROM UNNEST(GENERATE_DATE_ARRAY(DATE '2015-01-01', DATE '2040-12-31')) AS calendar_date
)
SELECT
  dates.calendar_date,
  EXTRACT(DAYOFWEEK FROM dates.calendar_date) NOT IN (1, 7)
    AND holidays.holiday_date IS NULL AS is_business_day,
  EXTRACT(DAYOFWEEK FROM dates.calendar_date) IN (1, 7) AS is_weekend,
  holidays.holiday_date IS NOT NULL AS is_federal_holiday,
  holidays.holiday_name
FROM dates
LEFT JOIN holidays ON dates.calendar_date = holidays.holiday_date;

ASSERT (
  SELECT
    COUNT(*) = DATE_DIFF(DATE '2040-12-31', DATE '2015-01-01', DAY) + 1
    AND COUNT(DISTINCT calendar_date) = COUNT(*)
    AND MIN(calendar_date) = DATE '2015-01-01'
    AND MAX(calendar_date) = DATE '2040-12-31'
  FROM `lithe-hallway-493420-r4.ndbf_applications.bank_business_calendar`
) AS 'bank_business_calendar must contain one row per date from 2015 through 2040';

ASSERT (
  SELECT COUNTIF(
    calendar_date IS NULL
    OR is_business_day IS NULL
    OR is_weekend IS NULL
    OR is_federal_holiday IS NULL
    OR is_business_day != (NOT is_weekend AND NOT is_federal_holiday)
    OR is_weekend != (EXTRACT(DAYOFWEEK FROM calendar_date) IN (1, 7))
  ) = 0
  FROM `lithe-hallway-493420-r4.ndbf_applications.bank_business_calendar`
) AS 'bank_business_calendar flags are inconsistent';

ASSERT (
  SELECT
    (SELECT is_business_day FROM `lithe-hallway-493420-r4.ndbf_applications.bank_business_calendar` WHERE calendar_date = DATE '2026-07-03')
    AND NOT (SELECT is_business_day FROM `lithe-hallway-493420-r4.ndbf_applications.bank_business_calendar` WHERE calendar_date = DATE '2027-07-05')
) AS 'Federal Reserve Saturday and Sunday holiday observation rules are incorrect';

CREATE OR REPLACE VIEW
  `lithe-hallway-493420-r4.ndbf_applications.bank_statement_transactions_classified`
OPTIONS (
  description = 'Privacy-safe deterministic v1 classification for each canonical bank-statement transaction.'
)
AS
WITH base AS (
  SELECT
    calculated.entry_id,
    calculated.document_id,
    calculated.document_index,
    calculated.openai_file_id,
    CASE
      WHEN calculated.statement.summary.account_number IS NOT NULL
        AND TRIM(calculated.statement.summary.account_number) != '' THEN TO_HEX(
          SHA256(
            CONCAT(
              'ENTRY|',
              calculated.entry_id,
              '|ACCOUNT|',
              NORMALIZE_AND_CASEFOLD(
                COALESCE(calculated.statement.summary.bank_name, ''),
                NFKC
              ),
              '|',
              NORMALIZE_AND_CASEFOLD(
                calculated.statement.summary.account_number,
                NFKC
              )
            )
          )
        )
      ELSE TO_HEX(
        SHA256(CONCAT('DOCUMENT|', calculated.entry_id, '|', calculated.document_id))
      )
    END AS account_key,
    transaction_offset + 1 AS transaction_index,
    TO_HEX(
      SHA256(
        FORMAT(
          '%s:%020d',
          calculated.openai_file_id,
          transaction_offset + 1
        )
      )
    ) AS transaction_id,
    transaction.date AS transaction_date,
    transaction.amount,
    transaction.balance AS calculated_balance,
    CASE
      WHEN transaction.amount > 0 THEN 'CREDIT'
      WHEN transaction.amount < 0 THEN 'DEBIT'
      ELSE NULL
    END AS direction,
    UPPER(
      TRIM(
        REGEXP_REPLACE(
          NORMALIZE_AND_CASEFOLD(COALESCE(transaction.description, ''), NFKC),
          r'[^\p{L}\p{N}]+',
          ' '
        )
      )
    ) AS normalized_description
  FROM
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_calculated` AS calculated
  CROSS JOIN UNNEST(calculated.statement.transactions) AS transaction WITH OFFSET AS transaction_offset
),
matched AS (
  SELECT
    base.*,
    COALESCE(
      ARRAY_AGG(
        IF(
          rules.rule_id IS NULL,
          NULL,
          STRUCT(
            rules.rule_id AS rule_id,
            rules.priority AS priority,
            rules.classification AS classification,
            rules.confidence AS confidence,
            rules.canonical_counterparty AS canonical_counterparty
          )
        )
        IGNORE NULLS
        ORDER BY rules.priority, rules.rule_id
      ),
      ARRAY<STRUCT<
        rule_id STRING,
        priority INT64,
        classification STRING,
        confidence STRING,
        canonical_counterparty STRING
      >>[]
    ) AS rule_matches
  FROM base
  LEFT JOIN
    `lithe-hallway-493420-r4.ndbf_applications.bank_transaction_rules` AS rules
    ON rules.analysis_version = 1
    AND rules.active
    AND (rules.direction = 'EITHER' OR rules.direction = base.direction)
    AND CASE rules.match_type
      WHEN 'EXACT' THEN base.normalized_description = rules.match_value
      WHEN 'PREFIX' THEN STARTS_WITH(base.normalized_description, rules.match_value)
      WHEN 'CONTAINS' THEN STRPOS(base.normalized_description, rules.match_value) > 0
      ELSE FALSE
    END
  GROUP BY
    base.entry_id,
    base.document_id,
    base.document_index,
    base.openai_file_id,
    base.account_key,
    base.transaction_index,
    base.transaction_id,
    base.transaction_date,
    base.amount,
    base.calculated_balance,
    base.direction,
    base.normalized_description
),
winning AS (
  SELECT
    matched.*,
    matched.rule_matches[SAFE_OFFSET(0)].priority AS winning_priority,
    ARRAY(
      SELECT AS STRUCT rule_match.*
      FROM UNNEST(matched.rule_matches) AS rule_match
      WHERE rule_match.priority = matched.rule_matches[SAFE_OFFSET(0)].priority
      ORDER BY rule_match.rule_id
    ) AS winning_matches
  FROM matched
),
resolved AS (
  SELECT
    entry_id,
    document_id,
    document_index,
    openai_file_id,
    account_key,
    transaction_index,
    transaction_id,
    transaction_date,
    amount,
    calculated_balance,
    direction,
    TO_HEX(SHA256(normalized_description)) AS description_fingerprint,
    TO_HEX(
      SHA256(
        ARRAY_TO_STRING(
          ARRAY(
            SELECT token
            FROM UNNEST(SPLIT(normalized_description, ' ')) AS token
            WITH OFFSET AS token_offset
            WHERE token != ''
              AND NOT REGEXP_CONTAINS(token, r'^\d+$')
              AND token NOT IN (
                'REF',
                'REFERENCE',
                'TRACE',
                'TRN',
                'TRANSACTION',
                'ID',
                'CONFIRMATION'
              )
            ORDER BY token_offset
          ),
          ' '
        )
      )
    ) AS candidate_counterparty_fingerprint,
    ARRAY(
      SELECT rule_match.rule_id
      FROM UNNEST(rule_matches) AS rule_match
      ORDER BY rule_match.priority, rule_match.rule_id
    ) AS matched_rule_ids,
    winning_priority AS matched_priority,
    ARRAY_LENGTH(
      ARRAY(
        SELECT DISTINCT AS STRUCT
          rule_match.classification,
          rule_match.confidence,
          rule_match.canonical_counterparty
        FROM UNNEST(winning_matches) AS rule_match
      )
    ) > 1 AS rule_conflict,
    CASE
      WHEN ARRAY_LENGTH(winning_matches) = 0 THEN NULL
      WHEN ARRAY_LENGTH(
        ARRAY(
          SELECT DISTINCT AS STRUCT
            rule_match.classification,
            rule_match.confidence,
            rule_match.canonical_counterparty
          FROM UNNEST(winning_matches) AS rule_match
        )
      ) > 1 THEN 'NON_REVENUE_CANDIDATE'
      ELSE winning_matches[SAFE_OFFSET(0)].classification
    END AS classification,
    CASE
      WHEN ARRAY_LENGTH(winning_matches) = 0 THEN NULL
      WHEN ARRAY_LENGTH(
        ARRAY(
          SELECT DISTINCT AS STRUCT
            rule_match.classification,
            rule_match.confidence,
            rule_match.canonical_counterparty
          FROM UNNEST(winning_matches) AS rule_match
        )
      ) > 1 THEN 'CANDIDATE'
      ELSE winning_matches[SAFE_OFFSET(0)].confidence
    END AS confidence,
    CASE
      WHEN ARRAY_LENGTH(
        ARRAY(
          SELECT DISTINCT AS STRUCT
            rule_match.classification,
            rule_match.confidence,
            rule_match.canonical_counterparty
          FROM UNNEST(winning_matches) AS rule_match
        )
      ) > 1 THEN NULL
      ELSE ARRAY(
        SELECT rule_match.canonical_counterparty
        FROM UNNEST(rule_matches) AS rule_match
        WHERE rule_match.canonical_counterparty IS NOT NULL
        ORDER BY rule_match.priority, rule_match.rule_id
        LIMIT 1
      )[SAFE_OFFSET(0)]
    END AS canonical_counterparty,
    EXISTS(
      SELECT 1
      FROM UNNEST(rule_matches) AS rule_match
      WHERE rule_match.classification = 'REVERSAL'
        AND rule_match.confidence = 'CONFIRMED'
    ) AS explicit_reversal_indicator
  FROM winning
),
current_files AS (
  SELECT
    entry_id,
    document_id,
    document_index,
    openai_file_id
  FROM `lithe-hallway-493420-r4.ndbf_applications.submission_documents`
  WHERE document_type = 'bank_statement'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY entry_id, document_id
    ORDER BY updated_at DESC, document_index, COALESCE(openai_file_id, '') DESC
  ) = 1
),
eligible_pair_candidates AS (
  SELECT
    reversal.transaction_id AS reversal_transaction_id,
    reversal.transaction_date AS reversal_transaction_date,
    original.transaction_id AS original_transaction_id,
    original.transaction_date AS original_transaction_date,
    original.document_index AS original_document_index,
    original.transaction_index AS original_transaction_index
  FROM resolved AS reversal
  JOIN current_files AS reversal_file
    ON reversal.entry_id = reversal_file.entry_id
    AND reversal.document_id = reversal_file.document_id
    AND reversal.document_index = reversal_file.document_index
    AND reversal.openai_file_id = reversal_file.openai_file_id
  JOIN resolved AS original
    ON reversal.entry_id = original.entry_id
    AND reversal.account_key = original.account_key
    AND reversal.transaction_id != original.transaction_id
    AND reversal.canonical_counterparty = original.canonical_counterparty
    AND reversal.canonical_counterparty IS NOT NULL
    AND reversal.amount = -original.amount
    AND original.transaction_date <= reversal.transaction_date
    AND NOT original.explicit_reversal_indicator
  JOIN current_files AS original_file
    ON original.entry_id = original_file.entry_id
    AND original.document_id = original_file.document_id
    AND original.document_index = original_file.document_index
    AND original.openai_file_id = original_file.openai_file_id
  JOIN `lithe-hallway-493420-r4.ndbf_applications.bank_business_calendar` AS start_day
    ON start_day.calendar_date = original.transaction_date
  JOIN `lithe-hallway-493420-r4.ndbf_applications.bank_business_calendar` AS end_day
    ON end_day.calendar_date = reversal.transaction_date
  LEFT JOIN
    `lithe-hallway-493420-r4.ndbf_applications.bank_business_calendar` AS business_span
    ON business_span.calendar_date > original.transaction_date
    AND business_span.calendar_date <= reversal.transaction_date
  WHERE reversal.explicit_reversal_indicator
    AND reversal.amount IS NOT NULL
    AND reversal.transaction_date IS NOT NULL
    AND original.amount IS NOT NULL
    AND original.transaction_date IS NOT NULL
  GROUP BY
    reversal.transaction_id,
    reversal.transaction_date,
    original.transaction_id,
    original.transaction_date,
    original.document_index,
    original.transaction_index
  HAVING COUNTIF(business_span.is_business_day) <= 5
),
pair_candidates AS (
  SELECT
    reversal_transaction_id,
    reversal_transaction_date,
    original_transaction_id,
    ROW_NUMBER() OVER (
      PARTITION BY reversal_transaction_id
      ORDER BY
        original_transaction_date DESC,
        original_document_index DESC,
        original_transaction_index DESC,
        original_transaction_id DESC
    ) AS reversal_choice
  FROM eligible_pair_candidates
),
unique_pairs AS (
  SELECT
    reversal_transaction_id,
    original_transaction_id
  FROM pair_candidates
  WHERE reversal_choice = 1
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY original_transaction_id
    ORDER BY reversal_transaction_date, reversal_transaction_id
  ) = 1
),
paired AS (
  SELECT
    resolved.*,
    COALESCE(
      reversal_pair.original_transaction_id,
      original_pair.reversal_transaction_id
    ) AS paired_reversal_transaction_id,
    reversal_pair.reversal_transaction_id IS NOT NULL AS is_confirmed_reversal,
    original_pair.original_transaction_id IS NOT NULL AS is_reversed_original,
    original_pair.original_transaction_id IS NOT NULL
      AND resolved.amount < 0 AS is_reversed_payment
  FROM resolved
  LEFT JOIN unique_pairs AS reversal_pair
    ON resolved.transaction_id = reversal_pair.reversal_transaction_id
  LEFT JOIN unique_pairs AS original_pair
    ON resolved.transaction_id = original_pair.original_transaction_id
)
SELECT
  entry_id,
  document_id,
  document_index,
  openai_file_id,
  account_key,
  transaction_index,
  transaction_id,
  transaction_date,
  amount,
  calculated_balance,
  direction,
  description_fingerprint,
  candidate_counterparty_fingerprint,
  matched_rule_ids,
  matched_priority,
  classification,
  confidence,
  canonical_counterparty,
  rule_conflict,
  explicit_reversal_indicator,
  paired_reversal_transaction_id,
  is_confirmed_reversal,
  is_reversed_original,
  is_reversed_payment
FROM paired;

-- Builds MCA positions from a single planner-safe event spine. Reusable
-- periods, payment occurrences, and account-range calendar rows stay local so
-- nested logical views are not expanded exponentially.
CREATE OR REPLACE VIEW
  `lithe-hallway-493420-r4.ndbf_applications.bank_statement_mca_positions`
OPTIONS (
  description = 'Per-statement MCA positions with entry-wide cadence and current-payment status.'
)
AS
WITH source_documents AS (
  SELECT
    entry_id,
    document_id,
    document_index,
    openai_file_id,
    updated_at
  FROM `lithe-hallway-493420-r4.ndbf_applications.submission_documents`
  WHERE document_type = 'bank_statement'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY entry_id, document_id
    ORDER BY updated_at DESC, document_index, COALESCE(openai_file_id, '') DESC
  ) = 1
),
statement_identity AS (
  SELECT
    calculated.entry_id,
    calculated.document_id,
    calculated.document_index,
    calculated.openai_file_id,
    calculated.statement.summary.statement_start_date AS statement_start_date,
    calculated.statement.summary.statement_end_date AS statement_end_date,
    NORMALIZE_AND_CASEFOLD(
      COALESCE(calculated.statement.summary.bank_name, ''),
      NFKC
    ) AS normalized_bank_name,
    NORMALIZE_AND_CASEFOLD(
      COALESCE(calculated.statement.summary.company, ''),
      NFKC
    ) AS normalized_company,
    NORMALIZE_AND_CASEFOLD(
      COALESCE(calculated.statement.summary.account_number, ''),
      NFKC
    ) AS normalized_account_number
  FROM
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_calculated` AS calculated
  JOIN source_documents AS source
    ON calculated.entry_id = source.entry_id
    AND calculated.document_id = source.document_id
    AND calculated.document_index = source.document_index
    AND calculated.openai_file_id = source.openai_file_id
),
identity_ordered AS (
  SELECT
    identity.*,
    LAST_VALUE(
      IF(
        identity.statement_start_date IS NOT NULL
          AND identity.statement_end_date IS NOT NULL
          AND identity.statement_end_date >= identity.statement_start_date,
        identity.statement_end_date,
        NULL
      )
      IGNORE NULLS
    ) OVER (
      PARTITION BY
        identity.entry_id,
        identity.normalized_bank_name,
        identity.normalized_company,
        identity.normalized_account_number
      ORDER BY
        identity.statement_start_date,
        identity.statement_end_date,
        identity.document_index,
        identity.document_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS prior_valid_statement_end_date
  FROM statement_identity AS identity
),
identity_chained AS (
  SELECT
    ordered.*,
    SUM(
      IF(
        ordered.normalized_account_number = ''
          AND ordered.normalized_bank_name != ''
          AND ordered.normalized_company != ''
          AND ordered.statement_start_date IS NOT NULL
          AND ordered.statement_end_date IS NOT NULL
          AND ordered.statement_end_date >= ordered.statement_start_date
          AND (
            ordered.prior_valid_statement_end_date IS NULL
            OR DATE_DIFF(
              ordered.statement_start_date,
              ordered.prior_valid_statement_end_date,
              DAY
            ) != 1
          ),
        1,
        0
      )
    ) OVER (
      PARTITION BY
        ordered.entry_id,
        ordered.normalized_bank_name,
        ordered.normalized_company,
        ordered.normalized_account_number
      ORDER BY
        ordered.statement_start_date,
        ordered.statement_end_date,
        ordered.document_index,
        ordered.document_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS inferred_chain
  FROM identity_ordered AS ordered
),
statement_periods AS (
  SELECT
    chained.entry_id,
    chained.document_id,
    chained.document_index,
    chained.openai_file_id,
    chained.statement_start_date,
    chained.statement_end_date,
    CASE
      WHEN chained.normalized_account_number != '' THEN TO_HEX(
        SHA256(
          CONCAT(
            'ENTRY|',
            chained.entry_id,
            '|ACCOUNT|',
            chained.normalized_bank_name,
            '|',
            chained.normalized_account_number
          )
        )
      )
      WHEN chained.normalized_bank_name != ''
        AND chained.normalized_company != ''
        AND chained.statement_start_date IS NOT NULL
        AND chained.statement_end_date IS NOT NULL
        AND chained.statement_end_date >= chained.statement_start_date
        AND chained.inferred_chain > 0 THEN TO_HEX(
          SHA256(
            FORMAT(
              'ENTRY|%s|INFERRED|%s|%s|%d',
              chained.entry_id,
              chained.normalized_bank_name,
              chained.normalized_company,
              chained.inferred_chain
            )
          )
        )
      ELSE TO_HEX(
        SHA256(CONCAT('DOCUMENT|', chained.entry_id, '|', chained.document_id))
      )
    END AS account_key
  FROM identity_chained AS chained
),
periods_with_coverage AS (
  SELECT
    period.*,
    ARRAY_AGG(
      STRUCT(
        period.document_id AS document_id,
        period.document_index AS document_index,
        period.openai_file_id AS openai_file_id,
        period.statement_start_date AS statement_start_date,
        period.statement_end_date AS statement_end_date
      )
    ) OVER (
      PARTITION BY period.entry_id, period.account_key
      ORDER BY
        period.statement_start_date,
        period.statement_end_date,
        period.document_index,
        period.document_id,
        period.openai_file_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS coverage_periods
  FROM statement_periods AS period
),
calendar_ordinal AS (
  SELECT
    calendar_date,
    is_business_day,
    COUNTIF(is_business_day) OVER (
      ORDER BY calendar_date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS business_day_ordinal
  FROM `lithe-hallway-493420-r4.ndbf_applications.bank_business_calendar`
),
calendar_data AS (
  SELECT
    ARRAY_AGG(
      STRUCT(
        calendar_date AS calendar_date,
        is_business_day AS is_business_day,
        business_day_ordinal AS business_day_ordinal
      )
      ORDER BY calendar_date
    ) AS calendar_days
  FROM calendar_ordinal
),
event_inputs AS (
  SELECT
    transactions.entry_id,
    transactions.document_id,
    transactions.document_index,
    transactions.openai_file_id,
    transactions.transaction_id,
    transactions.transaction_index,
    transactions.transaction_date,
    ABS(transactions.amount) AS payment_amount,
    periods.account_key,
    periods.coverage_periods,
    CASE
      WHEN transactions.amount > 0
        AND transactions.paired_reversal_transaction_id IS NULL
        AND transactions.classification = 'MCA_FUNDING'
        AND transactions.confidence = 'CONFIRMED'
        AND transactions.canonical_counterparty IS NOT NULL THEN 'FUNDING'
      WHEN transactions.amount < 0
        AND NOT transactions.explicit_reversal_indicator
        AND (
          (
            transactions.classification = 'MCA_PAYMENT'
            AND transactions.confidence = 'CONFIRMED'
            AND transactions.canonical_counterparty IS NOT NULL
          )
          OR (
            transactions.classification IS NULL
            AND transactions.candidate_counterparty_fingerprint
              != TO_HEX(SHA256(''))
          )
        ) THEN 'PAYMENT'
      ELSE NULL
    END AS event_type,
    CASE
      WHEN transactions.canonical_counterparty IS NOT NULL
        AND transactions.classification IN ('MCA_FUNDING', 'MCA_PAYMENT')
        AND transactions.confidence = 'CONFIRMED'
        THEN CONCAT('LENDER:', transactions.canonical_counterparty)
      ELSE CONCAT('UNKNOWN:', transactions.candidate_counterparty_fingerprint)
    END AS base_position_key,
    CASE
      WHEN transactions.canonical_counterparty IS NOT NULL
        AND transactions.classification IN ('MCA_FUNDING', 'MCA_PAYMENT')
        AND transactions.confidence = 'CONFIRMED'
        THEN transactions.canonical_counterparty
      ELSE 'Unknown recurring debit'
    END AS canonical_lender,
    transactions.canonical_counterparty IS NOT NULL
      AND transactions.classification IN ('MCA_FUNDING', 'MCA_PAYMENT')
      AND transactions.confidence = 'CONFIRMED' AS known_lender,
    NOT transactions.is_reversed_payment AS successful
  FROM
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_transactions_classified` AS transactions
  JOIN periods_with_coverage AS periods
    ON transactions.entry_id = periods.entry_id
    AND transactions.document_id = periods.document_id
    AND transactions.document_index = periods.document_index
    AND transactions.openai_file_id = periods.openai_file_id
  WHERE transactions.transaction_date IS NOT NULL
),
events_with_epoch AS (
  SELECT
    event.*,
    COUNTIF(event.event_type = 'FUNDING') OVER (
      event_order
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS funding_epoch,
    MIN(IF(event.event_type = 'FUNDING', event.transaction_date, NULL)) OVER (
      event_order
      ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING
    ) AS next_funding_date
  FROM event_inputs AS event
  WHERE event.event_type IS NOT NULL
  WINDOW event_order AS (
    PARTITION BY event.entry_id, event.account_key, event.base_position_key
    ORDER BY
      event.transaction_date,
      event.document_index,
      event.transaction_index,
      event.transaction_id
  )
),
payment_groups AS (
  SELECT
    event.entry_id,
    event.account_key,
    event.base_position_key,
    event.funding_epoch,
    MIN(event.canonical_lender) AS canonical_lender,
    LOGICAL_OR(event.known_lender) AS known_lender,
    MIN(event.next_funding_date) AS next_funding_date,
    ANY_VALUE(event.coverage_periods) AS coverage_periods,
    ARRAY_AGG(
      STRUCT(
        event.document_id AS document_id,
        event.document_index AS document_index,
        event.openai_file_id AS openai_file_id,
        event.transaction_id AS transaction_id,
        event.transaction_index AS transaction_index,
        event.transaction_date AS transaction_date,
        event.payment_amount AS payment_amount,
        event.successful AS successful
      )
      ORDER BY
        event.transaction_date,
        event.document_index,
        event.transaction_index,
        event.transaction_id
    ) AS payment_occurrences,
    COALESCE(
      ARRAY_AGG(
        IF(
          event.successful,
          STRUCT(
            event.document_id AS document_id,
            event.document_index AS document_index,
            event.openai_file_id AS openai_file_id,
            event.transaction_id AS transaction_id,
            event.transaction_index AS transaction_index,
            event.transaction_date AS transaction_date,
            event.payment_amount AS payment_amount,
            TRUE AS is_successful
          ),
          NULL
        )
        IGNORE NULLS
        ORDER BY
          event.transaction_date,
          event.document_index,
          event.transaction_index,
          event.transaction_id
      ),
      ARRAY<STRUCT<
        document_id STRING,
        document_index INT64,
        openai_file_id STRING,
        transaction_id STRING,
        transaction_index INT64,
        transaction_date DATE,
        payment_amount NUMERIC,
        is_successful BOOL
      >>[]
    ) AS successful_payments
  FROM events_with_epoch AS event
  WHERE event.event_type = 'PAYMENT'
  GROUP BY
    event.entry_id,
    event.account_key,
    event.base_position_key,
    event.funding_epoch
),
payment_groups_with_calendar AS (
  SELECT
    payment_group.*,
    ARRAY(
      SELECT AS STRUCT day.*
      FROM UNNEST(calendar.calendar_days) AS day
      WHERE day.calendar_date BETWEEN (
        SELECT MIN(period.statement_start_date)
        FROM UNNEST(payment_group.coverage_periods) AS period
      ) AND (
        SELECT MAX(period.statement_end_date)
        FROM UNNEST(payment_group.coverage_periods) AS period
      )
      ORDER BY day.calendar_date
    ) AS calendar_days
  FROM payment_groups AS payment_group
  CROSS JOIN calendar_data AS calendar
),
payment_analysis_rows AS (
  SELECT
    payment_group.* EXCEPT(successful_payments),
    payment.*
  FROM payment_groups_with_calendar AS payment_group
  CROSS JOIN UNNEST(
    IF(
      ARRAY_LENGTH(payment_group.successful_payments) > 0,
      payment_group.successful_payments,
      [STRUCT(
        CAST(NULL AS STRING) AS document_id,
        CAST(NULL AS INT64) AS document_index,
        CAST(NULL AS STRING) AS openai_file_id,
        CAST(NULL AS STRING) AS transaction_id,
        CAST(NULL AS INT64) AS transaction_index,
        CAST(NULL AS DATE) AS transaction_date,
        CAST(NULL AS NUMERIC) AS payment_amount,
        FALSE AS is_successful
      )]
    )
  ) AS payment
),
payment_ordered AS (
  SELECT
    payment.*,
    LAG(payment.payment_amount) OVER payment_order AS prior_payment_amount,
    LEAD(payment.payment_amount, 1) OVER payment_order AS next_payment_amount,
    LEAD(payment.payment_amount, 2) OVER payment_order AS second_next_payment_amount
  FROM payment_analysis_rows AS payment
  WINDOW payment_order AS (
    PARTITION BY
      payment.entry_id,
      payment.account_key,
      payment.base_position_key,
      payment.funding_epoch
    ORDER BY
      payment.transaction_date,
      payment.document_index,
      payment.transaction_index,
      payment.transaction_id
  )
),
payment_boundaries AS (
  SELECT
    payment.*,
    payment.prior_payment_amount IS NOT NULL
      AND payment.next_payment_amount IS NOT NULL
      AND payment.second_next_payment_amount IS NOT NULL
      AND ABS(payment.payment_amount - payment.prior_payment_amount)
        > GREATEST(NUMERIC '1', payment.prior_payment_amount * NUMERIC '0.01')
      AND ABS(payment.next_payment_amount - payment.payment_amount)
        <= GREATEST(NUMERIC '1', payment.payment_amount * NUMERIC '0.01')
      AND ABS(payment.second_next_payment_amount - payment.payment_amount)
        <= GREATEST(NUMERIC '1', payment.payment_amount * NUMERIC '0.01')
      AS amount_stream_boundary
  FROM payment_ordered AS payment
),
payment_segmented AS (
  SELECT
    payment.*,
    COUNTIF(payment.amount_stream_boundary) OVER (
      PARTITION BY
        payment.entry_id,
        payment.account_key,
        payment.base_position_key,
        payment.funding_epoch
      ORDER BY
        payment.transaction_date,
        payment.document_index,
        payment.transaction_index,
        payment.transaction_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS amount_stream
  FROM payment_boundaries AS payment
),
payments_with_successful_sequence AS (
  SELECT
    payment.*,
    ARRAY_AGG(
      STRUCT(
        payment.transaction_date AS transaction_date,
        payment.document_index AS document_index,
        payment.transaction_index AS transaction_index,
        payment.transaction_id AS transaction_id,
        payment.amount_stream_boundary AS amount_stream_boundary
      )
    ) OVER (
      PARTITION BY
        payment.entry_id,
        payment.account_key,
        payment.base_position_key,
        payment.funding_epoch
      ORDER BY
        payment.transaction_date,
        payment.document_index,
        payment.transaction_index,
        payment.transaction_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS successful_sequence
  FROM payment_segmented AS payment
),
payments_identified AS (
  SELECT
    payment.*,
    TO_HEX(
      SHA256(
        FORMAT(
          '%s|%s|%d|%d',
          payment.account_key,
          payment.base_position_key,
          payment.funding_epoch,
          payment.amount_stream
        )
      )
    ) AS position_key
  FROM payments_with_successful_sequence AS payment
),
payments_with_median AS (
  SELECT
    payment.*,
    PERCENTILE_CONT(payment.payment_amount, NUMERIC '0.5') OVER (
      PARTITION BY payment.entry_id, payment.position_key
    ) AS representative_payment_amount
  FROM payments_identified AS payment
),
payments_enriched AS (
  SELECT
    payment.*,
    ABS(payment.payment_amount - payment.representative_payment_amount)
      <= GREATEST(
        NUMERIC '1',
        payment.representative_payment_amount * NUMERIC '0.01'
      ) AS is_consistent,
    COALESCE(
      (
        SELECT day.is_business_day
        FROM UNNEST(payment.calendar_days) AS day
        WHERE day.calendar_date = payment.transaction_date
      ),
      FALSE
    ) AS is_business_day,
    (
      SELECT day.business_day_ordinal
      FROM UNNEST(payment.calendar_days) AS day
      WHERE day.calendar_date = payment.transaction_date
    ) AS business_day_ordinal
  FROM payments_with_median AS payment
),
position_grouped AS (
  SELECT
    payment.entry_id,
    payment.account_key,
    payment.position_key,
    payment.base_position_key,
    payment.funding_epoch,
    MIN(payment.amount_stream) AS amount_stream,
    MIN(payment.canonical_lender) AS canonical_lender,
    LOGICAL_OR(payment.known_lender) AS known_lender,
    LOGICAL_OR(payment.funding_epoch > 0) AS has_same_lender_funding,
    MIN(payment.next_funding_date) AS next_funding_date,
    ANY_VALUE(payment.coverage_periods) AS coverage_periods,
    ANY_VALUE(payment.calendar_days) AS calendar_days,
    ANY_VALUE(payment.payment_occurrences) AS payment_occurrences,
    ANY_VALUE(payment.successful_sequence) AS successful_sequence,
    ANY_VALUE(payment.representative_payment_amount)
      AS representative_payment_amount,
    COUNTIF(payment.is_successful) AS successful_payment_count,
    COALESCE(
      SUM(IF(payment.is_successful, payment.payment_amount, NUMERIC '0')),
      NUMERIC '0'
    ) AS total_paid,
    MIN(IF(payment.is_successful, payment.transaction_date, NULL))
      AS first_payment_date,
    MAX(IF(payment.is_successful, payment.transaction_date, NULL))
      AS last_payment_date,
    COUNTIF(
      payment.is_successful
        AND NOT COALESCE(payment.is_consistent, FALSE)
    ) AS unresolved_amount_change_count,
    COALESCE(
      ARRAY_AGG(
        IF(
          payment.is_successful,
          STRUCT(
            payment.document_id AS document_id,
            payment.document_index AS document_index,
            payment.openai_file_id AS openai_file_id,
            payment.transaction_id AS transaction_id,
            payment.transaction_index AS transaction_index,
            payment.transaction_date AS transaction_date,
            payment.payment_amount AS payment_amount,
            payment.is_consistent AS is_consistent,
            payment.is_business_day AS is_business_day,
            payment.business_day_ordinal AS business_day_ordinal
          ),
          NULL
        )
        IGNORE NULLS
        ORDER BY
          payment.transaction_date,
          payment.document_index,
          payment.transaction_index,
          payment.transaction_id
      ),
      ARRAY<STRUCT<
        document_id STRING,
        document_index INT64,
        openai_file_id STRING,
        transaction_id STRING,
        transaction_index INT64,
        transaction_date DATE,
        payment_amount NUMERIC,
        is_consistent BOOL,
        is_business_day BOOL,
        business_day_ordinal INT64
      >>[]
    ) AS payments
  FROM payments_enriched AS payment
  GROUP BY
    payment.entry_id,
    payment.account_key,
    payment.position_key,
    payment.base_position_key,
    payment.funding_epoch
),
position_occurrences_assigned AS (
  SELECT
    position.*,
    ARRAY(
      SELECT AS STRUCT
        occurrence.*,
        (
          SELECT COUNTIF(
            boundary.amount_stream_boundary
              AND (
                boundary.transaction_date < occurrence.transaction_date
                OR (
                  boundary.transaction_date = occurrence.transaction_date
                  AND (
                    boundary.document_index < occurrence.document_index
                    OR (
                      boundary.document_index = occurrence.document_index
                      AND (
                        boundary.transaction_index < occurrence.transaction_index
                        OR (
                          boundary.transaction_index = occurrence.transaction_index
                          AND boundary.transaction_id <= occurrence.transaction_id
                        )
                      )
                    )
                  )
                )
              )
          )
          FROM UNNEST(position.successful_sequence) AS boundary
        ) AS amount_stream
      FROM UNNEST(position.payment_occurrences) AS occurrence
      ORDER BY
        occurrence.transaction_date,
        occurrence.document_index,
        occurrence.transaction_index,
        occurrence.transaction_id
    ) AS assigned_payment_occurrences
  FROM position_grouped AS position
),
position_consistent_arrays AS (
  SELECT
    position.*,
    ARRAY(
      SELECT AS STRUCT
        payment.*,
        LAG(payment.transaction_date) OVER payment_order AS prior_payment_date,
        LAG(payment.transaction_date, 2) OVER payment_order
          AS second_prior_payment_date
      FROM UNNEST(position.payments) AS payment
      WHERE payment.is_consistent
      WINDOW payment_order AS (
        ORDER BY
          payment.transaction_date,
          payment.document_index,
          payment.transaction_index,
          payment.transaction_id
      )
      ORDER BY
        payment.transaction_date,
        payment.document_index,
        payment.transaction_index,
        payment.transaction_id
    ) AS consistent_payments
  FROM position_occurrences_assigned AS position
),
position_consistent_summary AS (
  SELECT
    position.*,
    ARRAY_LENGTH(position.consistent_payments) AS consistent_payment_count,
    (
      SELECT COUNT(DISTINCT payment.transaction_date)
      FROM UNNEST(position.consistent_payments) AS payment
      WHERE payment.is_business_day
    ) AS consistent_payment_day_count,
    (
      SELECT MIN(payment.transaction_date)
      FROM UNNEST(position.consistent_payments) AS payment
    ) AS first_consistent_payment_date,
    (
      SELECT MAX(payment.transaction_date)
      FROM UNNEST(position.consistent_payments) AS payment
    ) AS last_consistent_payment_date,
    (
      SELECT COUNTIF(
        DATE_DIFF(
          payment.transaction_date,
          payment.prior_payment_date,
          DAY
        ) BETWEEN 6 AND 8
        AND DATE_DIFF(
          payment.prior_payment_date,
          payment.second_prior_payment_date,
          DAY
        ) BETWEEN 6 AND 8
      )
      FROM UNNEST(position.consistent_payments) AS payment
    ) AS weekly_run_count,
    (
      SELECT COUNTIF(
        DATE_DIFF(
          payment.transaction_date,
          payment.prior_payment_date,
          DAY
        ) BETWEEN 13 AND 15
        AND DATE_DIFF(
          payment.prior_payment_date,
          payment.second_prior_payment_date,
          DAY
        ) BETWEEN 13 AND 15
      )
      FROM UNNEST(position.consistent_payments) AS payment
    ) AS biweekly_run_count,
    (
      SELECT COUNTIF(
        DATE_DIFF(
          payment.transaction_date,
          payment.prior_payment_date,
          DAY
        ) BETWEEN 26 AND 35
        AND DATE_DIFF(
          payment.prior_payment_date,
          payment.second_prior_payment_date,
          DAY
        ) BETWEEN 26 AND 35
      )
      FROM UNNEST(position.consistent_payments) AS payment
    ) AS monthly_run_count
  FROM position_consistent_arrays AS position
),
position_cadence_inputs AS (
  SELECT
    position.*,
    (
      SELECT COUNTIF(day.is_business_day)
      FROM UNNEST(position.calendar_days) AS day
      WHERE day.calendar_date BETWEEN position.first_consistent_payment_date
        AND position.last_consistent_payment_date
    ) AS business_days_in_payment_span
  FROM position_consistent_summary AS position
),
position_cadence AS (
  SELECT
    position.*,
    CASE
      WHEN position.consistent_payment_day_count >= 4
        AND SAFE_DIVIDE(
          position.consistent_payment_day_count,
          position.business_days_in_payment_span
        ) >= 0.70 THEN 'BUSINESS_DAILY'
      WHEN position.consistent_payment_count >= 3
        AND position.weekly_run_count >= 1 THEN 'WEEKLY'
      WHEN position.consistent_payment_count >= 3
        AND position.biweekly_run_count >= 1 THEN 'BIWEEKLY'
      WHEN position.consistent_payment_count >= 3
        AND position.monthly_run_count >= 1 THEN 'MONTHLY'
      ELSE 'UNCONFIRMED'
    END AS frequency
  FROM position_cadence_inputs AS position
),
positions AS (
  SELECT
    position.*,
    IF(
      position.known_lender
        AND (
          position.frequency != 'UNCONFIRMED'
          OR position.has_same_lender_funding
        ),
      'CONFIRMED',
      'CANDIDATE'
    ) AS position_confidence,
    position.unresolved_amount_change_count > 0
      OR NOT (
        position.known_lender
          AND (
            position.frequency != 'UNCONFIRMED'
            OR position.has_same_lender_funding
          )
      ) AS position_review_required,
    LEAST(
      (
        SELECT MAX(period.statement_end_date)
        FROM UNNEST(position.coverage_periods) AS period
      ),
      COALESCE(
        DATE_SUB(position.next_funding_date, INTERVAL 1 DAY),
        DATE '9999-12-31'
      )
    ) AS latest_statement_end_date
  FROM position_cadence AS position
  WHERE position.known_lender OR position.frequency != 'UNCONFIRMED'
),
position_schedules AS (
  SELECT
    position.*,
    ARRAY(
      SELECT AS STRUCT
        assigned.expected_date,
        assigned.expected_business_day_ordinal,
        assigned.document_id,
        assigned.document_index,
        assigned.openai_file_id,
        COALESCE((
          SELECT LOGICAL_OR(
            payment.is_consistent
              AND ABS(
                payment.payment_amount
                  - position.representative_payment_amount
              ) <= GREATEST(
                NUMERIC '1',
                position.representative_payment_amount * NUMERIC '0.01'
              )
              AND CASE
                WHEN position.frequency = 'BUSINESS_DAILY'
                  THEN payment.transaction_date = assigned.expected_date
                ELSE ABS(
                  payment.business_day_ordinal
                    - assigned.expected_business_day_ordinal
                ) <= 1
              END
          )
          FROM UNNEST(position.payments) AS payment
        ), FALSE) AS matched
      FROM (
        SELECT
          shifted.expected_date,
          expected_day.business_day_ordinal
            AS expected_business_day_ordinal,
          period.document_id,
          period.document_index,
          period.openai_file_id
        FROM (
          SELECT
            anchor.calendar_date AS schedule_anchor_date,
            CASE
              WHEN position.frequency = 'BUSINESS_DAILY'
                THEN anchor.calendar_date
              ELSE ARRAY(
                SELECT candidate.calendar_date
                FROM UNNEST(position.calendar_days) AS candidate
                WHERE candidate.is_business_day
                  AND ABS(
                    candidate.business_day_ordinal
                      - anchor.business_day_ordinal
                  ) <= 1
                  AND COALESCE((
                    SELECT LOGICAL_OR(
                      candidate.calendar_date BETWEEN candidate_period.statement_start_date
                        AND candidate_period.statement_end_date
                    )
                    FROM UNNEST(position.coverage_periods) AS candidate_period
                  ), FALSE)
                ORDER BY
                  ABS(
                    DATE_DIFF(
                      candidate.calendar_date,
                      anchor.calendar_date,
                      DAY
                    )
                  ),
                  candidate.calendar_date < anchor.calendar_date,
                  candidate.calendar_date
                LIMIT 1
              )[SAFE_OFFSET(0)]
            END AS expected_date
          FROM UNNEST(position.calendar_days) AS anchor
          WHERE position.frequency != 'UNCONFIRMED'
            AND anchor.calendar_date BETWEEN position.first_consistent_payment_date
              AND position.latest_statement_end_date
            AND (
              position.frequency != 'BUSINESS_DAILY'
              OR anchor.is_business_day
            )
            AND CASE position.frequency
              WHEN 'BUSINESS_DAILY' THEN TRUE
              WHEN 'WEEKLY' THEN MOD(
                DATE_DIFF(
                  anchor.calendar_date,
                  position.first_consistent_payment_date,
                  DAY
                ),
                7
              ) = 0
              WHEN 'BIWEEKLY' THEN MOD(
                DATE_DIFF(
                  anchor.calendar_date,
                  position.first_consistent_payment_date,
                  DAY
                ),
                14
              ) = 0
              WHEN 'MONTHLY' THEN anchor.calendar_date = DATE_ADD(
                position.first_consistent_payment_date,
                INTERVAL DATE_DIFF(
                  anchor.calendar_date,
                  position.first_consistent_payment_date,
                  MONTH
                ) MONTH
              )
              ELSE FALSE
            END
        ) AS shifted
        JOIN UNNEST(position.calendar_days) AS expected_day
          ON expected_day.calendar_date = shifted.expected_date
        JOIN UNNEST(position.coverage_periods) AS period
          ON shifted.expected_date BETWEEN period.statement_start_date
            AND period.statement_end_date
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY shifted.expected_date
          ORDER BY period.document_index, period.document_id, period.openai_file_id
        ) = 1
      ) AS assigned
      ORDER BY assigned.expected_date
    ) AS expected_schedule
  FROM positions AS position
),
position_status_inputs AS (
  SELECT
    position.*,
    (
      SELECT COUNTIF(NOT expected.matched)
      FROM UNNEST(position.expected_schedule) AS expected
    ) AS global_missed_payment_count,
    ARRAY(
      SELECT expected.matched
      FROM UNNEST(position.expected_schedule) AS expected
      ORDER BY expected.expected_date DESC
      LIMIT 3
    ) AS latest_expected_matches
  FROM position_schedules AS position
),
position_status AS (
  SELECT
    position.*,
    CASE
      WHEN position.frequency = 'UNCONFIRMED' THEN 'CADENCE_UNCONFIRMED'
      WHEN position.latest_expected_matches[SAFE_OFFSET(0)] THEN 'CURRENT_PAYING'
      WHEN position.latest_expected_matches[SAFE_OFFSET(0)] = FALSE
        AND (
          position.latest_expected_matches[SAFE_OFFSET(1)]
          OR position.latest_expected_matches[SAFE_OFFSET(2)]
        ) THEN 'CURRENT_WITH_MISSES'
      WHEN position.latest_expected_matches[SAFE_OFFSET(0)] = FALSE
        AND position.latest_expected_matches[SAFE_OFFSET(1)] = FALSE THEN 'INACTIVE'
      ELSE 'CADENCE_UNCONFIRMED'
    END AS status
  FROM position_status_inputs AS position
)
SELECT
  position.entry_id,
  period.document_id,
  period.document_index,
  period.openai_file_id,
  position.account_key,
  position.position_key,
  position.canonical_lender,
  position.position_confidence,
  position.position_review_required,
  position.status,
  position.representative_payment_amount AS payment_amount,
  position.frequency,
  (
    SELECT COUNT(*)
    FROM UNNEST(position.payments) AS payment
    WHERE payment.document_id = period.document_id
      AND payment.openai_file_id = period.openai_file_id
  ) AS successful_payment_count,
  IF(
    position.frequency = 'UNCONFIRMED',
    NULL,
    (
      SELECT COUNTIF(NOT expected.matched)
      FROM UNNEST(position.expected_schedule) AS expected
      WHERE expected.document_id = period.document_id
        AND expected.openai_file_id = period.openai_file_id
    )
  ) AS missed_payment_count,
  COALESCE(
    (
      SELECT SUM(payment.payment_amount)
      FROM UNNEST(position.payments) AS payment
      WHERE payment.document_id = period.document_id
        AND payment.openai_file_id = period.openai_file_id
    ),
    NUMERIC '0'
  ) AS total_paid,
  (
    SELECT MIN(payment.transaction_date)
    FROM UNNEST(position.payments) AS payment
    WHERE payment.document_id = period.document_id
      AND payment.openai_file_id = period.openai_file_id
  ) AS first_payment_date,
  (
    SELECT MAX(payment.transaction_date)
    FROM UNNEST(position.payments) AS payment
    WHERE payment.document_id = period.document_id
      AND payment.openai_file_id = period.openai_file_id
  ) AS last_payment_date
FROM position_status AS position
CROSS JOIN UNNEST(position.coverage_periods) AS period
WHERE EXISTS (
    SELECT 1
    FROM UNNEST(position.payments) AS payment
    WHERE payment.document_id = period.document_id
      AND payment.openai_file_id = period.openai_file_id
  )
  OR EXISTS (
    SELECT 1
    FROM UNNEST(position.expected_schedule) AS expected
    WHERE expected.document_id = period.document_id
      AND expected.openai_file_id = period.openai_file_id
  )
  OR EXISTS (
    SELECT 1
    FROM UNNEST(position.assigned_payment_occurrences) AS occurrence
    WHERE occurrence.document_id = period.document_id
      AND occurrence.openai_file_id = period.openai_file_id
      AND occurrence.amount_stream = position.amount_stream
  );

CREATE OR REPLACE VIEW
  `lithe-hallway-493420-r4.ndbf_applications.bank_statement_underwriting_summary`
OPTIONS (
  description = 'One privacy-safe v1 underwriting summary per canonical bank-statement PDF.'
)
AS
WITH statements AS (
  SELECT
    calculated.entry_id,
    calculated.document_id,
    calculated.document_index,
    calculated.openai_file_id,
    calculated.extracted_at,
    calculated.statement.summary.account_number,
    calculated.statement.summary.bank_name,
    calculated.statement.summary.company,
    calculated.statement.summary.start_balance,
    calculated.statement.summary.statement_start_date,
    calculated.statement.summary.statement_end_date,
    calculated.statement.transactions,
    calculated.statement.summary.num_transactions,
    calculated.statement.summary.calculated_total_credits,
    calculated.statement.summary.calculated_total_debits,
    calculated.reconciliation.credits_status,
    calculated.reconciliation.debits_status,
    calculated.reconciliation.ending_balance_status,
    canonical.duplicate_count,
    canonical.duplicate_payload_conflict,
    canonical.duplicate_binding_conflict
  FROM
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_calculated` AS calculated
  JOIN
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_extractions_canonical` AS canonical
    ON calculated.entry_id = canonical.entry_id
    AND calculated.document_id = canonical.document_id
    AND calculated.document_index = canonical.document_index
    AND calculated.openai_file_id = canonical.openai_file_id
),
transaction_metrics AS (
  SELECT
    transactions.entry_id,
    transactions.document_id,
    transactions.openai_file_id,
    COUNTIF(transactions.amount IS NULL) AS missing_amount_count,
    COUNTIF(transactions.transaction_date IS NULL) AS missing_date_count,
    COALESCE(
      SUM(IF(transactions.amount > 0, transactions.amount, NUMERIC '0')),
      NUMERIC '0'
    ) AS known_total_deposits,
    COALESCE(
      SUM(
        IF(
          transactions.amount > 0
            AND (
              (
                transactions.confidence = 'CONFIRMED'
                AND transactions.classification IN (
                  'TRANSFER',
                  'MCA_FUNDING',
                  'OTHER_LOAN_PROCEEDS'
                )
                AND NOT (
                  transactions.explicit_reversal_indicator
                  AND NOT transactions.is_confirmed_reversal
                )
              )
              OR transactions.is_confirmed_reversal
              OR transactions.is_reversed_original
            ),
          transactions.amount,
          NUMERIC '0'
        )
      ),
      NUMERIC '0'
    ) AS known_confirmed_non_revenue_deposits,
    COALESCE(
      SUM(
        IF(
          transactions.amount > 0
            AND (
              transactions.confidence = 'CANDIDATE'
              OR transactions.rule_conflict
              OR transactions.description_fingerprint = TO_HEX(SHA256(''))
              OR (
                transactions.explicit_reversal_indicator
                AND NOT transactions.is_confirmed_reversal
              )
            ),
          transactions.amount,
          NUMERIC '0'
        )
      ),
      NUMERIC '0'
    ) AS ambiguous_non_revenue_candidate_amount,
    COUNTIF(
      transactions.amount > 0
        AND (
          transactions.confidence = 'CANDIDATE'
          OR transactions.rule_conflict
          OR transactions.description_fingerprint = TO_HEX(SHA256(''))
          OR (
            transactions.explicit_reversal_indicator
            AND NOT transactions.is_confirmed_reversal
          )
        )
    ) AS ambiguous_non_revenue_candidate_count,
    COUNTIF(
      transactions.explicit_reversal_indicator
        AND transactions.paired_reversal_transaction_id IS NULL
    ) AS unpaired_reversal_count,
    COUNTIF(transactions.rule_conflict) AS rule_conflict_count,
    ARRAY_AGG(
      IF(
        transactions.amount > 0
          AND transactions.paired_reversal_transaction_id IS NULL
          AND transactions.classification = 'MCA_FUNDING'
          AND transactions.confidence = 'CONFIRMED'
          AND transactions.canonical_counterparty IS NOT NULL,
        STRUCT(
          transactions.canonical_counterparty AS canonical_lender,
          transactions.transaction_date AS deposit_date,
          transactions.amount AS amount,
          transactions.transaction_id AS transaction_id
        ),
        NULL
      )
      IGNORE NULLS
      ORDER BY
        transactions.transaction_date,
        transactions.canonical_counterparty,
        transactions.amount,
        transactions.transaction_id
    ) AS confirmed_mca_funding_deposits
  FROM
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_transactions_classified` AS transactions
  GROUP BY transactions.entry_id, transactions.document_id, transactions.openai_file_id
),
statement_inputs AS (
  SELECT
    statements.*,
    CASE
      WHEN statements.statement_start_date IS NOT NULL
        AND statements.statement_end_date IS NOT NULL
        AND statements.statement_end_date >= statements.statement_start_date
        THEN DATE_DIFF(
          statements.statement_end_date,
          statements.statement_start_date,
          DAY
        ) + 1
      ELSE NULL
    END AS statement_day_count,
    COALESCE(metrics.missing_amount_count, 0) AS missing_amount_count,
    COALESCE(metrics.missing_date_count, 0) AS missing_date_count,
    COALESCE(metrics.known_total_deposits, NUMERIC '0') AS known_total_deposits,
    COALESCE(
      metrics.known_confirmed_non_revenue_deposits,
      NUMERIC '0'
    ) AS known_confirmed_non_revenue_deposits,
    COALESCE(
      metrics.ambiguous_non_revenue_candidate_amount,
      NUMERIC '0'
    ) AS known_ambiguous_non_revenue_candidate_amount,
    COALESCE(metrics.ambiguous_non_revenue_candidate_count, 0)
      AS ambiguous_non_revenue_candidate_count,
    COALESCE(metrics.unpaired_reversal_count, 0) AS unpaired_reversal_count,
    COALESCE(metrics.rule_conflict_count, 0) AS rule_conflict_count,
    IFNULL(
      metrics.confirmed_mca_funding_deposits,
      ARRAY<STRUCT<
        canonical_lender STRING,
        deposit_date DATE,
        amount NUMERIC,
        transaction_id STRING
      >>[]
    ) AS confirmed_mca_funding_deposits
  FROM statements
  LEFT JOIN transaction_metrics AS metrics
    ON statements.entry_id = metrics.entry_id
    AND statements.document_id = metrics.document_id
    AND statements.openai_file_id = metrics.openai_file_id
),
out_of_period AS (
  SELECT
    inputs.entry_id,
    inputs.document_id,
    inputs.openai_file_id,
    COUNTIF(
      transaction.date IS NOT NULL
      AND (
        transaction.date < inputs.statement_start_date
        OR transaction.date > inputs.statement_end_date
      )
    ) AS transaction_outside_period_count
  FROM statements AS inputs
  LEFT JOIN UNNEST(inputs.transactions) AS transaction ON TRUE
  GROUP BY inputs.entry_id, inputs.document_id, inputs.openai_file_id
),
daily_closing_balances AS (
  SELECT
    inputs.entry_id,
    inputs.document_id,
    inputs.openai_file_id,
    calendar.calendar_date,
    inputs.start_balance
      + COALESCE(SUM(transaction.amount), NUMERIC '0') AS closing_balance
  FROM statements AS inputs
  JOIN `lithe-hallway-493420-r4.ndbf_applications.bank_business_calendar` AS calendar
    ON calendar.calendar_date BETWEEN inputs.statement_start_date
      AND inputs.statement_end_date
  LEFT JOIN UNNEST(inputs.transactions) AS transaction
    ON transaction.date <= calendar.calendar_date
  GROUP BY
    inputs.entry_id,
    inputs.document_id,
    inputs.openai_file_id,
    calendar.calendar_date,
    inputs.start_balance
),
calendar_metrics AS (
  SELECT
    entry_id,
    document_id,
    openai_file_id,
    COUNT(*) AS calendar_day_count,
    AVG(closing_balance) AS average_daily_balance,
    COUNTIF(closing_balance < 0) AS negative_balance_days
  FROM daily_closing_balances
  GROUP BY entry_id, document_id, openai_file_id
),
financial_metrics AS (
  SELECT
    inputs.*,
    COALESCE(outside.transaction_outside_period_count, 0)
      AS transaction_outside_period_count,
    COALESCE(calendar.calendar_day_count, 0) AS calendar_day_count,
    IF(
      inputs.missing_amount_count = 0,
      inputs.known_total_deposits,
      NULL
    ) AS total_deposits,
    IF(
      inputs.missing_amount_count = 0,
      inputs.known_confirmed_non_revenue_deposits,
      NULL
    ) AS confirmed_non_revenue_deposits,
    IF(
      inputs.missing_amount_count = 0,
      inputs.known_total_deposits
        - inputs.known_confirmed_non_revenue_deposits,
      NULL
    ) AS true_deposits,
    IF(
      inputs.missing_amount_count = 0,
      inputs.known_ambiguous_non_revenue_candidate_amount,
      NULL
    ) AS ambiguous_non_revenue_candidate_amount,
    IF(
      inputs.start_balance IS NOT NULL
        AND inputs.statement_day_count IS NOT NULL
        AND inputs.missing_amount_count = 0
        AND inputs.missing_date_count = 0
        AND COALESCE(outside.transaction_outside_period_count, 0) = 0
        AND COALESCE(calendar.calendar_day_count, 0) = inputs.statement_day_count,
      calendar.average_daily_balance,
      NULL
    ) AS average_daily_balance,
    IF(
      inputs.start_balance IS NOT NULL
        AND inputs.statement_day_count IS NOT NULL
        AND inputs.missing_amount_count = 0
        AND inputs.missing_date_count = 0
        AND COALESCE(outside.transaction_outside_period_count, 0) = 0
        AND COALESCE(calendar.calendar_day_count, 0) = inputs.statement_day_count,
      calendar.negative_balance_days,
      NULL
    ) AS negative_balance_days
  FROM statement_inputs AS inputs
  LEFT JOIN out_of_period AS outside
    ON inputs.entry_id = outside.entry_id
    AND inputs.document_id = outside.document_id
    AND inputs.openai_file_id = outside.openai_file_id
  LEFT JOIN calendar_metrics AS calendar
    ON inputs.entry_id = calendar.entry_id
    AND inputs.document_id = calendar.document_id
    AND inputs.openai_file_id = calendar.openai_file_id
),
mca_metrics AS (
  SELECT
    positions.entry_id,
    positions.document_id,
    positions.openai_file_id,
    ARRAY_AGG(
      IF(
        positions.position_confidence = 'CONFIRMED',
        STRUCT(
          positions.canonical_lender AS canonical_lender,
          positions.status AS status,
          positions.payment_amount AS payment_amount,
          positions.frequency AS frequency,
          positions.successful_payment_count AS successful_payment_count,
          positions.missed_payment_count AS missed_payment_count,
          positions.total_paid AS total_paid,
          positions.position_key AS position_key
        ),
        NULL
      )
      IGNORE NULLS
      ORDER BY
        positions.canonical_lender,
        positions.status,
        positions.frequency,
        positions.position_key
    ) AS confirmed_position_inputs,
    COALESCE(
      SUM(
        IF(
          positions.position_confidence = 'CONFIRMED',
          positions.total_paid,
          NUMERIC '0'
        )
      ),
      NUMERIC '0'
    ) AS total_mca_payments,
    COUNTIF(
      positions.position_confidence = 'CANDIDATE'
        OR positions.position_review_required
    ) AS mca_candidate_count
  FROM
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_mca_positions` AS positions
  GROUP BY
    positions.entry_id,
    positions.document_id,
    positions.openai_file_id
),
with_quality_flags AS (
  SELECT
    financial.*,
    ARRAY(
      SELECT AS STRUCT
        funding.canonical_lender,
        funding.deposit_date,
        funding.amount
      FROM UNNEST(financial.confirmed_mca_funding_deposits) AS funding
      WHERE funding.amount >= NUMERIC '10000'
        OR funding.amount >= financial.total_deposits * NUMERIC '0.10'
      ORDER BY
        funding.deposit_date,
        funding.canonical_lender,
        funding.amount,
        funding.transaction_id
    ) AS large_mca_deposits,
    ARRAY(
      SELECT AS STRUCT
        position.canonical_lender,
        position.status,
        position.payment_amount,
        position.frequency,
        position.successful_payment_count,
        position.missed_payment_count,
        position.total_paid,
        IF(
          financial.true_deposits > 0,
          ROUND(
            SAFE_DIVIDE(
              position.total_paid * NUMERIC '100',
              financial.true_deposits
            ),
            2
          ),
          NULL
        ) AS lender_withholding_percentage
      FROM UNNEST(
        IFNULL(
          mca.confirmed_position_inputs,
          ARRAY<STRUCT<
            canonical_lender STRING,
            status STRING,
            payment_amount NUMERIC,
            frequency STRING,
            successful_payment_count INT64,
            missed_payment_count INT64,
            total_paid NUMERIC,
            position_key STRING
          >>[]
        )
      ) AS position
      ORDER BY
        position.canonical_lender,
        position.status,
        position.frequency,
        position.position_key
    ) AS mca_positions,
    COALESCE(mca.total_mca_payments, NUMERIC '0') AS total_mca_payments,
    COALESCE(mca.mca_candidate_count, 0) AS mca_candidate_count,
    IF(
      financial.true_deposits > 0,
      ROUND(
        SAFE_DIVIDE(
          COALESCE(mca.total_mca_payments, NUMERIC '0') * NUMERIC '100',
          financial.true_deposits
        ),
        2
      ),
      NULL
    ) AS overall_withholding_percentage
  FROM financial_metrics AS financial
  LEFT JOIN mca_metrics AS mca
    ON financial.entry_id = mca.entry_id
    AND financial.document_id = mca.document_id
    AND financial.openai_file_id = mca.openai_file_id
),
statement_account_counts AS (
  SELECT
    entry_id,
    COUNT(*) AS document_count,
    COUNTIF(account_number IS NULL OR TRIM(account_number) = '') AS missing_account_count,
    COUNTIF(account_number IS NOT NULL AND TRIM(account_number) != '') AS known_account_count
  FROM statements
  GROUP BY entry_id
),
missing_account_sequence AS (
  SELECT
    entry_id,
    document_id,
    statement_start_date,
    statement_end_date,
    NORMALIZE_AND_CASEFOLD(COALESCE(bank_name, ''), NFKC) AS normalized_bank_name,
    NORMALIZE_AND_CASEFOLD(COALESCE(company, ''), NFKC) AS normalized_company,
    LAG(statement_end_date) OVER (
      PARTITION BY entry_id
      ORDER BY statement_start_date, statement_end_date, document_index, document_id
    ) AS prior_statement_end_date
  FROM statements
  WHERE account_number IS NULL OR TRIM(account_number) = ''
),
missing_account_quality AS (
  SELECT
    entry_id,
    COUNT(
      DISTINCT CONCAT(normalized_bank_name, '|', normalized_company)
    ) AS identity_count,
    COUNTIF(
      normalized_bank_name = ''
        OR normalized_company = ''
        OR statement_start_date IS NULL
        OR statement_end_date IS NULL
        OR statement_end_date < statement_start_date
    ) AS invalid_identity_or_period_count,
    COUNTIF(
      prior_statement_end_date IS NOT NULL
        AND DATE_DIFF(statement_start_date, prior_statement_end_date, DAY) != 1
    ) AS nonconsecutive_period_count
  FROM missing_account_sequence
  GROUP BY entry_id
),
entry_account_quality AS (
  SELECT
    counts.entry_id,
    counts.document_count > 1
      AND counts.missing_account_count > 0
      AND NOT (
        counts.known_account_count = 0
        AND missing.identity_count = 1
        AND missing.invalid_identity_or_period_count = 0
        AND missing.nonconsecutive_period_count = 0
      ) AS account_continuity_uncertain
  FROM statement_account_counts AS counts
  LEFT JOIN missing_account_quality AS missing USING (entry_id)
),
entry_overlaps AS (
  SELECT DISTINCT left_statement.entry_id
  FROM statements AS left_statement
  JOIN statements AS right_statement
    ON left_statement.entry_id = right_statement.entry_id
    AND (
      left_statement.document_index < right_statement.document_index
      OR (
        left_statement.document_index = right_statement.document_index
        AND left_statement.document_id < right_statement.document_id
      )
    )
    AND left_statement.statement_start_date <= right_statement.statement_end_date
    AND right_statement.statement_start_date <= left_statement.statement_end_date
    AND (
      left_statement.account_number IS NULL
      OR TRIM(left_statement.account_number) = ''
      OR right_statement.account_number IS NULL
      OR TRIM(right_statement.account_number) = ''
      OR (
        NORMALIZE_AND_CASEFOLD(left_statement.account_number, NFKC)
          = NORMALIZE_AND_CASEFOLD(right_statement.account_number, NFKC)
        AND NORMALIZE_AND_CASEFOLD(COALESCE(left_statement.bank_name, ''), NFKC)
          = NORMALIZE_AND_CASEFOLD(COALESCE(right_statement.bank_name, ''), NFKC)
      )
    )
),
quality AS (
  SELECT
    with_quality_flags.*,
    ARRAY(
      SELECT reason
      FROM UNNEST([
        STRUCT(1 AS reason_order, 'DUPLICATE_PAYLOAD_CONFLICT' AS reason, duplicate_payload_conflict AS include),
        (2, 'BINDING_CONFLICT', duplicate_binding_conflict),
        (
          3,
          'RECONCILIATION_MISMATCH',
          credits_status = 'MISMATCH'
            OR debits_status = 'MISMATCH'
            OR ending_balance_status = 'MISMATCH'
        ),
        (
          4,
          'MISSING_CALCULATION_INPUT',
          start_balance IS NULL
            OR statement_day_count IS NULL
            OR missing_amount_count > 0
            OR missing_date_count > 0
            OR credits_status = 'CALCULATION_INCOMPLETE'
            OR debits_status = 'CALCULATION_INCOMPLETE'
            OR ending_balance_status = 'CALCULATION_INCOMPLETE'
            OR credits_status = 'PRINTED_VALUE_MISSING'
            OR debits_status = 'PRINTED_VALUE_MISSING'
            OR ending_balance_status = 'PRINTED_VALUE_MISSING'
        ),
        (
          5,
          'AMBIGUOUS_NON_REVENUE',
          ambiguous_non_revenue_candidate_count > 0
            OR unpaired_reversal_count > 0
            OR rule_conflict_count > 0
        ),
        (6, 'MCA_CANDIDATE_UNCONFIRMED', mca_candidate_count > 0),
        (
          7,
          'CALENDAR_COVERAGE_MISSING',
          statement_day_count IS NULL OR calendar_day_count != statement_day_count
        ),
        (
          8,
          'ACCOUNT_CONTINUITY_UNCERTAIN',
          COALESCE(account_quality.account_continuity_uncertain, FALSE)
        ),
        (9, 'OVERLAPPING_STATEMENTS', overlaps.entry_id IS NOT NULL),
        (10, 'TRANSACTION_OUTSIDE_PERIOD', transaction_outside_period_count > 0)
      ]) AS quality_reason
      WHERE quality_reason.include
      ORDER BY quality_reason.reason_order
    ) AS quality_reasons
  FROM with_quality_flags
  LEFT JOIN entry_account_quality AS account_quality USING (entry_id)
  LEFT JOIN entry_overlaps AS overlaps USING (entry_id)
)
SELECT
  entry_id,
  document_id,
  document_index,
  openai_file_id,
  extracted_at,
  statement_start_date,
  statement_end_date,
  statement_day_count,
  total_deposits,
  confirmed_non_revenue_deposits,
  true_deposits,
  ambiguous_non_revenue_candidate_amount,
  average_daily_balance,
  negative_balance_days,
  large_mca_deposits,
  mca_positions,
  total_mca_payments,
  overall_withholding_percentage,
  IF(ARRAY_LENGTH(quality_reasons) = 0, 'READY', 'REVIEW_REQUIRED') AS quality_status,
  quality_reasons,
  duplicate_count,
  duplicate_payload_conflict,
  duplicate_binding_conflict
FROM quality;

CREATE OR REPLACE VIEW
  `lithe-hallway-493420-r4.ndbf_applications.submission_underwriting_summary`
OPTIONS (
  description = 'One privacy-safe v1 underwriting result per entry across every expected bank-statement PDF.'
)
AS
WITH source_documents AS (
  SELECT
    entry_id,
    document_id,
    document_index,
    openai_file_id,
    updated_at
  FROM `lithe-hallway-493420-r4.ndbf_applications.submission_documents`
  WHERE document_type = 'bank_statement'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY entry_id, document_id
    ORDER BY updated_at DESC, document_index, COALESCE(openai_file_id, '') DESC
  ) = 1
),
document_base AS (
  SELECT
    source.entry_id,
    source.document_id,
    source.document_index,
    source.openai_file_id,
    canonical.openai_file_id IS NOT NULL AS extraction_received,
    canonical.duplicate_payload_conflict,
    COALESCE(canonical.duplicate_binding_conflict, FALSE)
      OR (
        canonical.openai_file_id IS NOT NULL
        AND (
          canonical.entry_id != source.entry_id
          OR canonical.document_id != source.document_id
          OR canonical.document_index != source.document_index
        )
      ) AS binding_conflict,
    underwriting.statement_start_date,
    underwriting.statement_end_date,
    underwriting.statement_day_count,
    underwriting.total_deposits,
    underwriting.confirmed_non_revenue_deposits,
    underwriting.true_deposits,
    underwriting.ambiguous_non_revenue_candidate_amount,
    underwriting.average_daily_balance,
    underwriting.negative_balance_days,
    underwriting.large_mca_deposits,
    underwriting.mca_positions,
    underwriting.total_mca_payments,
    underwriting.overall_withholding_percentage,
    underwriting.quality_reasons,
    calculated.statement.summary.account_number,
    calculated.statement.summary.bank_name,
    calculated.statement.summary.company
  FROM source_documents AS source
  LEFT JOIN
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_extractions_canonical` AS canonical
    ON source.openai_file_id = canonical.openai_file_id
  LEFT JOIN
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_underwriting_summary` AS underwriting
    ON source.entry_id = underwriting.entry_id
    AND source.document_id = underwriting.document_id
    AND source.openai_file_id = underwriting.openai_file_id
  LEFT JOIN
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_calculated` AS calculated
    ON source.entry_id = calculated.entry_id
    AND source.document_id = calculated.document_id
    AND source.openai_file_id = calculated.openai_file_id
),
submission_account_counts AS (
  SELECT
    entry_id,
    COUNT(*) AS document_count,
    COUNTIF(account_number IS NULL OR TRIM(account_number) = '') AS missing_account_count,
    COUNTIF(account_number IS NOT NULL AND TRIM(account_number) != '') AS known_account_count
  FROM document_base
  WHERE extraction_received
  GROUP BY entry_id
),
submission_missing_account_sequence AS (
  SELECT
    entry_id,
    document_id,
    statement_start_date,
    statement_end_date,
    NORMALIZE_AND_CASEFOLD(COALESCE(bank_name, ''), NFKC) AS normalized_bank_name,
    NORMALIZE_AND_CASEFOLD(COALESCE(company, ''), NFKC) AS normalized_company,
    LAG(statement_end_date) OVER (
      PARTITION BY entry_id
      ORDER BY statement_start_date, statement_end_date, document_index, document_id
    ) AS prior_statement_end_date
  FROM document_base
  WHERE extraction_received
    AND (account_number IS NULL OR TRIM(account_number) = '')
),
submission_missing_account_quality AS (
  SELECT
    entry_id,
    COUNT(
      DISTINCT CONCAT(normalized_bank_name, '|', normalized_company)
    ) AS identity_count,
    COUNTIF(
      normalized_bank_name = ''
        OR normalized_company = ''
        OR statement_start_date IS NULL
        OR statement_end_date IS NULL
        OR statement_end_date < statement_start_date
    ) AS invalid_identity_or_period_count,
    COUNTIF(
      prior_statement_end_date IS NOT NULL
        AND DATE_DIFF(statement_start_date, prior_statement_end_date, DAY) != 1
    ) AS nonconsecutive_period_count
  FROM submission_missing_account_sequence
  GROUP BY entry_id
),
account_continuity AS (
  SELECT
    counts.entry_id,
    counts.document_count > 1
      AND counts.missing_account_count > 0
      AND NOT (
        counts.known_account_count = 0
        AND missing.identity_count = 1
        AND missing.invalid_identity_or_period_count = 0
        AND missing.nonconsecutive_period_count = 0
      ) AS account_continuity_uncertain
  FROM submission_account_counts AS counts
  LEFT JOIN submission_missing_account_quality AS missing USING (entry_id)
),
overlapping_entries AS (
  SELECT DISTINCT left_document.entry_id
  FROM document_base AS left_document
  JOIN document_base AS right_document
    ON left_document.entry_id = right_document.entry_id
    AND (
      left_document.document_index < right_document.document_index
      OR (
        left_document.document_index = right_document.document_index
        AND left_document.document_id < right_document.document_id
      )
    )
    AND left_document.statement_start_date <= right_document.statement_end_date
    AND right_document.statement_start_date <= left_document.statement_end_date
    AND (
      left_document.account_number IS NULL
      OR TRIM(left_document.account_number) = ''
      OR right_document.account_number IS NULL
      OR TRIM(right_document.account_number) = ''
      OR (
        NORMALIZE_AND_CASEFOLD(left_document.account_number, NFKC)
          = NORMALIZE_AND_CASEFOLD(right_document.account_number, NFKC)
        AND NORMALIZE_AND_CASEFOLD(COALESCE(left_document.bank_name, ''), NFKC)
          = NORMALIZE_AND_CASEFOLD(COALESCE(right_document.bank_name, ''), NFKC)
      )
    )
  WHERE left_document.extraction_received
    AND right_document.extraction_received
),
document_reason_flags AS (
  SELECT
    documents.* EXCEPT(account_number, bank_name, company, quality_reasons),
    ARRAY(
      SELECT reason
      FROM UNNEST([
        STRUCT(
          1 AS reason_order,
          'DUPLICATE_PAYLOAD_CONFLICT' AS reason,
          COALESCE(documents.duplicate_payload_conflict, FALSE)
            OR 'DUPLICATE_PAYLOAD_CONFLICT' IN UNNEST(
              COALESCE(documents.quality_reasons, ARRAY<STRING>[])
            ) AS include
        ),
        (
          2,
          'BINDING_CONFLICT',
          documents.binding_conflict
            OR 'BINDING_CONFLICT' IN UNNEST(
              COALESCE(documents.quality_reasons, ARRAY<STRING>[])
            )
        ),
        (
          3,
          'RECONCILIATION_MISMATCH',
          'RECONCILIATION_MISMATCH' IN UNNEST(
            COALESCE(documents.quality_reasons, ARRAY<STRING>[])
          )
        ),
        (
          4,
          'MISSING_CALCULATION_INPUT',
          'MISSING_CALCULATION_INPUT' IN UNNEST(
            COALESCE(documents.quality_reasons, ARRAY<STRING>[])
          )
        ),
        (
          5,
          'AMBIGUOUS_NON_REVENUE',
          'AMBIGUOUS_NON_REVENUE' IN UNNEST(
            COALESCE(documents.quality_reasons, ARRAY<STRING>[])
          )
        ),
        (
          6,
          'MCA_CANDIDATE_UNCONFIRMED',
          'MCA_CANDIDATE_UNCONFIRMED' IN UNNEST(
            COALESCE(documents.quality_reasons, ARRAY<STRING>[])
          )
        ),
        (
          7,
          'CALENDAR_COVERAGE_MISSING',
          'CALENDAR_COVERAGE_MISSING' IN UNNEST(
            COALESCE(documents.quality_reasons, ARRAY<STRING>[])
          )
        ),
        (
          8,
          'ACCOUNT_CONTINUITY_UNCERTAIN',
          COALESCE(accounts.account_continuity_uncertain, FALSE)
        ),
        (
          9,
          'OVERLAPPING_STATEMENTS',
          overlaps.entry_id IS NOT NULL
        ),
        (
          10,
          'TRANSACTION_OUTSIDE_PERIOD',
          'TRANSACTION_OUTSIDE_PERIOD' IN UNNEST(
            COALESCE(documents.quality_reasons, ARRAY<STRING>[])
          )
        )
      ]) AS quality_reason
      WHERE quality_reason.include
      ORDER BY quality_reason.reason_order
    ) AS quality_reasons
  FROM document_base AS documents
  LEFT JOIN account_continuity AS accounts USING (entry_id)
  LEFT JOIN overlapping_entries AS overlaps USING (entry_id)
),
documents_final AS (
  SELECT
    document_reason_flags.*,
    CASE
      WHEN NOT extraction_received THEN 'PROCESSING'
      WHEN ARRAY_LENGTH(quality_reasons) > 0 THEN 'REVIEW_REQUIRED'
      ELSE 'READY'
    END AS quality_status
  FROM document_reason_flags
),
entry_current_positions AS (
  SELECT
    positions.entry_id,
    COUNT(DISTINCT positions.position_key) AS current_mca_position_count
  FROM
    `lithe-hallway-493420-r4.ndbf_applications.bank_statement_mca_positions` AS positions
  JOIN source_documents AS source
    ON positions.entry_id = source.entry_id
    AND positions.document_id = source.document_id
    AND positions.openai_file_id = source.openai_file_id
  WHERE positions.position_confidence = 'CONFIRMED'
    AND positions.status IN ('CURRENT_PAYING', 'CURRENT_WITH_MISSES')
  GROUP BY positions.entry_id
),
entry_grouped AS (
  SELECT
    documents.entry_id,
    COUNT(*) AS expected_document_count,
    COUNTIF(documents.extraction_received) AS extracted_document_count,
    COUNTIF(documents.extraction_received) = COUNT(*) AS all_documents_processed,
    COUNTIF(
      COALESCE(documents.duplicate_payload_conflict, FALSE)
        OR documents.binding_conflict
    ) = 0 AS no_duplicate_conflicts,
    COUNTIF(documents.quality_status = 'REVIEW_REQUIRED') > 0 AS review_required,
    COUNTIF(documents.total_deposits IS NULL) AS null_total_deposit_count,
    COUNTIF(documents.true_deposits IS NULL) AS null_true_deposit_count,
    COUNTIF(documents.negative_balance_days IS NULL) AS null_negative_day_count,
    AVG(documents.total_deposits) AS raw_average_statement_deposits,
    AVG(documents.true_deposits) AS raw_average_true_deposits,
    SUM(documents.negative_balance_days) AS raw_total_negative_balance_days,
    ARRAY_AGG(
      STRUCT(
        documents.document_id AS document_id,
        documents.document_index AS document_index,
        documents.openai_file_id AS openai_file_id,
        documents.extraction_received AS extraction_received,
        documents.statement_start_date AS statement_start_date,
        documents.statement_end_date AS statement_end_date,
        documents.statement_day_count AS statement_day_count,
        documents.total_deposits AS total_deposits,
        documents.confirmed_non_revenue_deposits AS confirmed_non_revenue_deposits,
        documents.true_deposits AS true_deposits,
        documents.ambiguous_non_revenue_candidate_amount AS ambiguous_non_revenue_candidate_amount,
        documents.average_daily_balance AS average_daily_balance,
        documents.negative_balance_days AS negative_balance_days,
        COALESCE(
          documents.large_mca_deposits,
          ARRAY<STRUCT<
            canonical_lender STRING,
            deposit_date DATE,
            amount NUMERIC
          >>[]
        ) AS large_mca_deposits,
        COALESCE(
          documents.mca_positions,
          ARRAY<STRUCT<
            canonical_lender STRING,
            status STRING,
            payment_amount NUMERIC,
            frequency STRING,
            successful_payment_count INT64,
            missed_payment_count INT64,
            total_paid NUMERIC,
            lender_withholding_percentage NUMERIC
          >>[]
        ) AS mca_positions,
        documents.total_mca_payments AS total_mca_payments,
        documents.overall_withholding_percentage AS overall_withholding_percentage,
        documents.quality_status AS quality_status,
        documents.quality_reasons AS quality_reasons
      )
      ORDER BY
        documents.document_index,
        documents.document_id,
        COALESCE(documents.openai_file_id, '')
    ) AS statements
  FROM documents_final AS documents
  GROUP BY documents.entry_id
)
SELECT
  grouped.entry_id,
  1 AS analysis_version,
  CASE
    WHEN NOT grouped.all_documents_processed THEN 'PROCESSING'
    WHEN grouped.review_required THEN 'REVIEW_REQUIRED'
    ELSE 'READY'
  END AS analysis_status,
  grouped.expected_document_count,
  grouped.extracted_document_count,
  grouped.all_documents_processed,
  IF(
    grouped.all_documents_processed AND grouped.no_duplicate_conflicts,
    grouped.extracted_document_count,
    NULL
  ) AS statement_count,
  IF(
    grouped.all_documents_processed
      AND grouped.no_duplicate_conflicts
      AND grouped.null_total_deposit_count = 0,
    grouped.raw_average_statement_deposits,
    NULL
  ) AS average_statement_deposits,
  IF(
    grouped.all_documents_processed
      AND grouped.no_duplicate_conflicts
      AND grouped.null_true_deposit_count = 0,
    grouped.raw_average_true_deposits,
    NULL
  ) AS average_true_deposits,
  IF(
    grouped.all_documents_processed
      AND grouped.no_duplicate_conflicts
      AND grouped.null_negative_day_count = 0,
    grouped.raw_total_negative_balance_days,
    NULL
  ) AS total_negative_balance_days,
  IF(
    grouped.all_documents_processed AND grouped.no_duplicate_conflicts,
    COALESCE(current_positions.current_mca_position_count, 0),
    NULL
  ) AS current_mca_position_count,
  grouped.statements
FROM entry_grouped AS grouped
LEFT JOIN entry_current_positions AS current_positions USING (entry_id);
