-- BigQuery Standard SQL
--
-- Synthetic, self-contained underwriting verification. This script creates
-- temporary tables only and never reads or mutates production data.

CREATE TEMP FUNCTION normalize_description(value STRING)
AS (
  UPPER(
    TRIM(
      REGEXP_REPLACE(
        NORMALIZE_AND_CASEFOLD(COALESCE(value, ''), NFKC),
        r'[^\p{L}\p{N}]+',
        ' '
      )
    )
  )
);

ASSERT normalize_description('  Credibly---Funding  ') = 'CREDIBLY FUNDING'
AS 'description normalization must use NFKC case-folding and collapsed separators';

CREATE TEMP TABLE extraction_fixture AS
SELECT *
FROM UNNEST([
  STRUCT('file_identical' AS openai_file_id, 'entry_a' AS entry_id, 'doc_a' AS document_id, 1 AS document_index, TIMESTAMP '2026-01-01 00:00:00+00' AS extracted_at, 'payload_a' AS payload),
  ('file_identical', 'entry_a', 'doc_a', 1, TIMESTAMP '2026-01-02 00:00:00+00', 'payload_a'),
  ('file_payload_conflict', 'entry_a', 'doc_b', 2, TIMESTAMP '2026-01-01 00:00:00+00', 'payload_old'),
  ('file_payload_conflict', 'entry_a', 'doc_b', 2, TIMESTAMP '2026-01-02 00:00:00+00', 'payload_new'),
  ('file_binding_conflict', 'entry_a', 'doc_c', 3, TIMESTAMP '2026-01-01 00:00:00+00', 'payload_c'),
  ('file_binding_conflict', 'entry_b', 'doc_d', 1, TIMESTAMP '2026-01-02 00:00:00+00', 'payload_c')
]);

CREATE TEMP TABLE canonical_result AS
WITH hashed AS (
  SELECT
    fixture.*,
    TO_HEX(SHA256(payload)) AS payload_hash,
    TO_HEX(
      SHA256(
        TO_JSON_STRING(
          STRUCT(entry_id, document_id, document_index, openai_file_id)
        )
      )
    ) AS binding_hash
  FROM extraction_fixture AS fixture
),
stats AS (
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
SELECT ranked.* EXCEPT(binding_hash, canonical_rank), stats.* EXCEPT(openai_file_id)
FROM ranked
JOIN stats USING (openai_file_id)
WHERE canonical_rank = 1;

ASSERT (SELECT COUNT(*) = 3 FROM canonical_result)
AS 'canonical extraction must contain one row per OpenAI file ID';

ASSERT (
  SELECT duplicate_count = 2
    AND NOT duplicate_payload_conflict
    AND NOT duplicate_binding_conflict
  FROM canonical_result
  WHERE openai_file_id = 'file_identical'
) AS 'identical duplicate extractions must not require review';

ASSERT (
  SELECT payload = 'payload_new' AND duplicate_payload_conflict
  FROM canonical_result
  WHERE openai_file_id = 'file_payload_conflict'
) AS 'latest conflicting payload must win and retain a conflict flag';

ASSERT (
  SELECT entry_id = 'entry_b' AND duplicate_binding_conflict
  FROM canonical_result
  WHERE openai_file_id = 'file_binding_conflict'
) AS 'latest binding must win and retain a binding-conflict flag';

CREATE TEMP TABLE rule_fixture AS
SELECT *
FROM UNNEST([
  STRUCT('credibly' AS rule_id, 10 AS priority, 'CONTAINS' AS match_type, 'CREDIBLY' AS match_value, 'CREDIT' AS direction, 'MCA_FUNDING' AS classification, 'CONFIRMED' AS confidence, 'Credibly' AS canonical_counterparty),
  ('strict_transfer', 20, 'CONTAINS', 'INTERNAL TRANSFER', 'CREDIT', 'TRANSFER', 'CONFIRMED', CAST(NULL AS STRING)),
  ('broad_transfer', 100, 'CONTAINS', 'TRANSFER', 'CREDIT', 'NON_REVENUE_CANDIDATE', 'CANDIDATE', CAST(NULL AS STRING)),
  ('broad_capital', 100, 'CONTAINS', 'CAPITAL', 'CREDIT', 'NON_REVENUE_CANDIDATE', 'CANDIDATE', CAST(NULL AS STRING)),
  ('ambiguous_a', 5, 'EXACT', 'AMBIGUOUS', 'CREDIT', 'TRANSFER', 'CONFIRMED', CAST(NULL AS STRING)),
  ('ambiguous_b', 5, 'EXACT', 'AMBIGUOUS', 'CREDIT', 'OTHER_LOAN_PROCEEDS', 'CONFIRMED', CAST(NULL AS STRING))
]);

CREATE TEMP TABLE classification_fixture AS
SELECT *
FROM UNNEST([
  STRUCT('known' AS transaction_id, 'Credibly funding' AS description, 'CREDIT' AS direction),
  ('strict', 'Internal transfer', 'CREDIT'),
  ('candidate', 'Working capital', 'CREDIT'),
  ('unclassified', 'Zelle from customer', 'CREDIT'),
  ('conflict', 'Ambiguous', 'CREDIT')
]);

CREATE TEMP TABLE classification_result AS
WITH matches AS (
  SELECT
    transaction.transaction_id,
    COALESCE(
      ARRAY_AGG(
        IF(
          rule.rule_id IS NULL,
          NULL,
          STRUCT(
            rule.rule_id AS rule_id,
            rule.priority AS priority,
            rule.match_type AS match_type,
            rule.match_value AS match_value,
            rule.direction AS direction,
            rule.classification AS classification,
            rule.confidence AS confidence,
            rule.canonical_counterparty AS canonical_counterparty
          )
        )
        IGNORE NULLS
        ORDER BY rule.priority, rule.rule_id
      ),
      ARRAY<STRUCT<
        rule_id STRING,
        priority INT64,
        match_type STRING,
        match_value STRING,
        direction STRING,
        classification STRING,
        confidence STRING,
        canonical_counterparty STRING
      >>[]
    ) AS rule_matches
  FROM classification_fixture AS transaction
  LEFT JOIN rule_fixture AS rule
    ON rule.direction = transaction.direction
    AND CASE rule.match_type
      WHEN 'EXACT' THEN normalize_description(transaction.description) = rule.match_value
      WHEN 'PREFIX' THEN STARTS_WITH(normalize_description(transaction.description), rule.match_value)
      WHEN 'CONTAINS' THEN STRPOS(normalize_description(transaction.description), rule.match_value) > 0
      ELSE FALSE
    END
  GROUP BY transaction.transaction_id
),
winning AS (
  SELECT
    transaction_id,
    ARRAY(
      SELECT AS STRUCT rule_match.*
      FROM UNNEST(rule_matches) AS rule_match
      WHERE rule_match.priority = rule_matches[SAFE_OFFSET(0)].priority
      ORDER BY rule_match.rule_id
    ) AS winning_matches
  FROM matches
)
SELECT
  transaction_id,
  winning_matches[SAFE_OFFSET(0)].classification AS classification,
  winning_matches[SAFE_OFFSET(0)].confidence AS confidence,
  ARRAY_LENGTH(
    ARRAY(
      SELECT DISTINCT AS STRUCT
        rule_match.classification,
        rule_match.confidence,
        rule_match.canonical_counterparty
      FROM UNNEST(winning_matches) AS rule_match
    )
  ) > 1 AS rule_conflict
FROM winning;

ASSERT (
  SELECT classification = 'MCA_FUNDING' AND confidence = 'CONFIRMED'
  FROM classification_result WHERE transaction_id = 'known'
) AS 'known MCA alias must outrank broad candidate text';

ASSERT (
  SELECT classification = 'TRANSFER' AND confidence = 'CONFIRMED'
  FROM classification_result WHERE transaction_id = 'strict'
) AS 'strict transfer context must outrank the broad transfer candidate';

ASSERT (
  SELECT classification = 'NON_REVENUE_CANDIDATE' AND confidence = 'CANDIDATE'
  FROM classification_result WHERE transaction_id = 'candidate'
) AS 'broad capital text must remain candidate-only';

ASSERT (
  SELECT classification IS NULL AND NOT rule_conflict
  FROM classification_result WHERE transaction_id = 'unclassified'
) AS 'Zelle must not be classified automatically';

ASSERT (
  SELECT rule_conflict
  FROM classification_result WHERE transaction_id = 'conflict'
) AS 'equal-priority conflicting outcomes must require review';

ASSERT (
  WITH descriptions AS (
    SELECT 'ACH DEBIT EXAMPLE REF 123456' AS description
    UNION ALL
    SELECT 'ACH DEBIT EXAMPLE TRACE 999999'
  ),
  fingerprints AS (
    SELECT TO_HEX(
      SHA256(
        ARRAY_TO_STRING(
          ARRAY(
            SELECT token
            FROM UNNEST(SPLIT(normalize_description(description), ' ')) AS token
            WITH OFFSET AS token_offset
            WHERE NOT REGEXP_CONTAINS(token, r'^\d+$')
              AND token NOT IN ('REF', 'REFERENCE', 'TRACE', 'TRN', 'TRANSACTION', 'ID', 'CONFIRMATION')
            ORDER BY token_offset
          ),
          ' '
        )
      )
    ) AS fingerprint
    FROM descriptions
  )
  SELECT COUNT(DISTINCT fingerprint) = 1 FROM fingerprints
) AS 'unknown recurring counterparty fingerprint must ignore reference-number churn';

CREATE TEMP TABLE deposit_fixture AS
SELECT *
FROM UNNEST([
  STRUCT('complete' AS document_id, NUMERIC '1000' AS amount, CAST(NULL AS STRING) AS classification, CAST(NULL AS STRING) AS confidence, FALSE AS paired_reversal, FALSE AS explicit_unpaired_reversal),
  ('complete', NUMERIC '200', 'TRANSFER', 'CONFIRMED', FALSE, FALSE),
  ('complete', NUMERIC '15000', 'MCA_FUNDING', 'CONFIRMED', FALSE, FALSE),
  ('complete', NUMERIC '500', 'OTHER_LOAN_PROCEEDS', 'CONFIRMED', FALSE, FALSE),
  ('complete', NUMERIC '300', 'NON_REVENUE_CANDIDATE', 'CANDIDATE', FALSE, FALSE),
  ('complete', NUMERIC '100', 'REVERSAL', 'CONFIRMED', TRUE, FALSE),
  ('complete', NUMERIC '250', 'MCA_FUNDING', 'CONFIRMED', FALSE, TRUE),
  ('missing', NUMERIC '100', CAST(NULL AS STRING), CAST(NULL AS STRING), FALSE, FALSE),
  ('missing', CAST(NULL AS NUMERIC), CAST(NULL AS STRING), CAST(NULL AS STRING), FALSE, FALSE)
]);

CREATE TEMP TABLE deposit_result AS
SELECT
  document_id,
  IF(COUNTIF(amount IS NULL) = 0, SUM(IF(amount > 0, amount, NUMERIC '0')), NULL) AS total_deposits,
  IF(
    COUNTIF(amount IS NULL) = 0,
    SUM(
      IF(
        amount > 0
          AND (
            (
              confidence = 'CONFIRMED'
              AND classification IN ('TRANSFER', 'MCA_FUNDING', 'OTHER_LOAN_PROCEEDS')
              AND NOT explicit_unpaired_reversal
            )
            OR paired_reversal
          ),
        amount,
        NUMERIC '0'
      )
    ),
    NULL
  ) AS confirmed_non_revenue,
  SUM(IF(amount > 0 AND (confidence = 'CANDIDATE' OR explicit_unpaired_reversal), amount, NUMERIC '0')) AS candidate_amount
FROM deposit_fixture
GROUP BY document_id;

ASSERT (
  SELECT total_deposits = NUMERIC '17350'
    AND confirmed_non_revenue = NUMERIC '15800'
    AND total_deposits - confirmed_non_revenue = NUMERIC '1550'
    AND candidate_amount = NUMERIC '550'
  FROM deposit_result WHERE document_id = 'complete'
) AS 'true deposits must subtract confirmed non-revenue only and retain candidates';

ASSERT (
  SELECT total_deposits IS NULL AND confirmed_non_revenue IS NULL
  FROM deposit_result WHERE document_id = 'missing'
) AS 'any missing transaction amount must null deposit totals';

ASSERT NUMERIC '15000' >= NUMERIC '10000'
  AND NUMERIC '9000' >= NUMERIC '80000' * NUMERIC '0.10'
  AND NOT (NUMERIC '9000' >= NUMERIC '100000' * NUMERIC '0.10')
AS 'large MCA funding threshold must be $10,000 or 10 percent of total deposits';

CREATE TEMP TABLE balance_transactions AS
SELECT *
FROM UNNEST([
  STRUCT(DATE '2026-01-01' AS transaction_date, NUMERIC '-150' AS amount),
  (DATE '2026-01-03', NUMERIC '100')
]);

ASSERT (
  WITH daily AS (
    SELECT
      calendar_date,
      NUMERIC '100' + COALESCE(
        (SELECT SUM(amount) FROM balance_transactions WHERE transaction_date <= calendar_date),
        NUMERIC '0'
      ) AS closing_balance
    FROM UNNEST(GENERATE_DATE_ARRAY(DATE '2026-01-01', DATE '2026-01-03')) AS calendar_date
  )
  SELECT COUNT(*) = 3
    AND ROUND(AVG(closing_balance), 2) = NUMERIC '-16.67'
    AND COUNTIF(closing_balance < 0) = 2
    AND COUNTIF(closing_balance = 0) = 0
  FROM daily
) AS 'ADB must include every calendar day, carry balances forward, and count only balances below zero';

ASSERT (
  SELECT IF(
    start_balance IS NOT NULL
      AND missing_amount_count = 0
      AND missing_date_count = 0
      AND outside_period_count = 0,
    NUMERIC '1',
    NULL
  ) IS NULL
  FROM UNNEST([
    STRUCT(NUMERIC '100' AS start_balance, 0 AS missing_amount_count, 0 AS missing_date_count, 1 AS outside_period_count)
  ])
) AS 'out-of-period transactions must null ADB';

CREATE TEMP TABLE cadence_fixture AS
SELECT *
FROM UNNEST([
  STRUCT('weekly_pass' AS stream_id, DATE '2026-01-05' AS payment_date),
  ('weekly_pass', DATE '2026-01-12'),
  ('weekly_pass', DATE '2026-01-19'),
  ('weekly_with_miss', DATE '2026-01-05'),
  ('weekly_with_miss', DATE '2026-01-12'),
  ('weekly_with_miss', DATE '2026-01-19'),
  ('weekly_with_miss', DATE '2026-02-02'),
  ('weekly_fail', DATE '2026-01-05'),
  ('weekly_fail', DATE '2026-01-12'),
  ('weekly_fail', DATE '2026-01-21')
]);

ASSERT (
  WITH sequenced AS (
    SELECT
      stream_id,
      payment_date,
      LAG(payment_date) OVER (PARTITION BY stream_id ORDER BY payment_date) AS prior_date,
      LAG(payment_date, 2) OVER (PARTITION BY stream_id ORDER BY payment_date) AS second_prior_date
    FROM cadence_fixture
  ),
  classified AS (
    SELECT
      stream_id,
      COUNT(*) AS payment_count,
      COUNTIF(
        DATE_DIFF(payment_date, prior_date, DAY) BETWEEN 6 AND 8
          AND DATE_DIFF(prior_date, second_prior_date, DAY) BETWEEN 6 AND 8
      ) AS qualifying_runs
    FROM sequenced
    GROUP BY stream_id
  )
  SELECT
    (SELECT payment_count >= 3 AND qualifying_runs >= 1 FROM classified WHERE stream_id = 'weekly_pass')
    AND (SELECT payment_count >= 3 AND qualifying_runs >= 1 FROM classified WHERE stream_id = 'weekly_with_miss')
    AND NOT (SELECT payment_count >= 3 AND qualifying_runs >= 1 FROM classified WHERE stream_id = 'weekly_fail')
) AS 'weekly cadence requires a three-payment run and survives a later missed occurrence';

ASSERT (
  WITH successful_payments AS (
    SELECT *
    FROM UNNEST([
      STRUCT(DATE '2026-01-01' AS payment_date, NUMERIC '100' AS payment_amount),
      (DATE '2026-01-05', NUMERIC '120'),
      (DATE '2026-01-09', NUMERIC '120'),
      (DATE '2026-01-13', NUMERIC '120'),
      (DATE '2026-01-17', NUMERIC '100'),
      (DATE '2026-01-21', NUMERIC '100'),
      (DATE '2026-01-25', NUMERIC '100')
    ])
  ),
  sequenced AS (
    SELECT
      payment_date,
      payment_amount,
      LAG(payment_amount) OVER payment_order AS prior_payment_amount,
      LEAD(payment_amount, 1) OVER payment_order AS next_payment_amount,
      LEAD(payment_amount, 2) OVER payment_order AS second_next_payment_amount
    FROM successful_payments
    WINDOW payment_order AS (ORDER BY payment_date)
  ),
  boundaries AS (
    SELECT
      payment_date,
      prior_payment_amount IS NOT NULL
        AND next_payment_amount IS NOT NULL
        AND second_next_payment_amount IS NOT NULL
        AND ABS(payment_amount - prior_payment_amount)
          > GREATEST(NUMERIC '1', prior_payment_amount * NUMERIC '0.01')
        AND ABS(next_payment_amount - payment_amount)
          <= GREATEST(NUMERIC '1', payment_amount * NUMERIC '0.01')
        AND ABS(second_next_payment_amount - payment_amount)
          <= GREATEST(NUMERIC '1', payment_amount * NUMERIC '0.01')
        AS amount_stream_boundary
    FROM sequenced
  ),
  reversed_occurrence AS (
    SELECT DATE '2026-01-27' AS occurrence_date, NUMERIC '100' AS payment_amount
  ),
  assigned AS (
    SELECT
      occurrence.*,
      COUNTIF(
        boundary.amount_stream_boundary
          AND boundary.payment_date <= occurrence.occurrence_date
      ) AS amount_stream
    FROM reversed_occurrence AS occurrence
    CROSS JOIN boundaries AS boundary
    GROUP BY occurrence.occurrence_date, occurrence.payment_amount
  ),
  membership AS (
    SELECT stream.amount_stream
    FROM UNNEST([
      STRUCT(0 AS amount_stream),
      STRUCT(1 AS amount_stream),
      STRUCT(2 AS amount_stream)
    ]) AS stream
    JOIN assigned USING (amount_stream)
  )
  SELECT COUNT(*) = 1 AND ANY_VALUE(amount_stream) = 2
  FROM membership
) AS 'reversed return-to-prior-amount occurrence must bind only to its chronological stream';

CREATE TEMP TABLE holiday_shift_calendar AS
SELECT *
FROM UNNEST([
  STRUCT(DATE '2027-07-02' AS calendar_date, TRUE AS is_business_day),
  (DATE '2027-07-03', FALSE),
  (DATE '2027-07-04', FALSE),
  (DATE '2027-07-05', FALSE),
  (DATE '2027-07-06', TRUE)
]);

ASSERT (
  SELECT ARRAY(
    SELECT business_day.calendar_date
    FROM holiday_shift_calendar AS business_day
    WHERE business_day.is_business_day
      AND (
        SELECT COUNTIF(distance_day.is_business_day)
        FROM holiday_shift_calendar AS distance_day
        WHERE distance_day.calendar_date > LEAST(DATE '2027-07-04', business_day.calendar_date)
          AND distance_day.calendar_date <= GREATEST(DATE '2027-07-04', business_day.calendar_date)
      ) <= 1
    ORDER BY
      ABS(DATE_DIFF(business_day.calendar_date, DATE '2027-07-04', DAY)),
      business_day.calendar_date < DATE '2027-07-04',
      business_day.calendar_date
    LIMIT 1
  )[SAFE_OFFSET(0)] = DATE '2027-07-06'
) AS 'weekly-style holiday anchors must shift within one business day inside coverage';

ASSERT ROUND(SAFE_DIVIDE(NUMERIC '333' * NUMERIC '100', NUMERIC '10000'), 2) = NUMERIC '3.33'
  AND IF(NUMERIC '0' > 0, SAFE_DIVIDE(NUMERIC '333', NUMERIC '0'), NULL) IS NULL
AS 'withholding must round to two decimals and be null for a nonpositive denominator';

ASSERT (
  SELECT LOGICAL_AND(
    CASE
      WHEN latest_match THEN 'CURRENT_PAYING'
      WHEN NOT latest_match AND (prior_match OR second_prior_match) THEN 'CURRENT_WITH_MISSES'
      WHEN NOT latest_match AND NOT prior_match THEN 'INACTIVE'
      ELSE 'CADENCE_UNCONFIRMED'
    END = expected_status
  )
  FROM UNNEST([
    STRUCT(TRUE AS latest_match, FALSE AS prior_match, FALSE AS second_prior_match, 'CURRENT_PAYING' AS expected_status),
    (FALSE, TRUE, FALSE, 'CURRENT_WITH_MISSES'),
    (FALSE, FALSE, TRUE, 'CURRENT_WITH_MISSES'),
    (FALSE, FALSE, FALSE, 'INACTIVE')
  ])
) AS 'MCA current-status transitions must remain stable';

ASSERT (
  SELECT LOGICAL_AND(
    IF(all_processed AND no_conflict, aggregate_value, NULL) IS NULL
  )
  FROM UNNEST([
    STRUCT(FALSE AS all_processed, TRUE AS no_conflict, NUMERIC '123' AS aggregate_value),
    (TRUE, FALSE, NUMERIC '123')
  ])
) AS 'submission aggregates must remain null while processing or duplicate-conflicted';

ASSERT (
  SELECT TO_JSON_STRING(ARRAY_AGG(value ORDER BY sort_date, sort_key)) = '["a","b","c"]'
  FROM UNNEST([
    STRUCT('c' AS value, DATE '2026-01-02' AS sort_date, 1 AS sort_key),
    ('b', DATE '2026-01-01', 2),
    ('a', DATE '2026-01-01', 1)
  ])
) AS 'nested output arrays must use explicit deterministic ordering';

ASSERT (
  WITH accounts AS (
    SELECT *
    FROM UNNEST([
      STRUCT('known_multi' AS entry_id, '1111' AS account_number, DATE '2026-01-01' AS start_date, DATE '2026-01-31' AS end_date),
      ('known_multi', '2222', DATE '2026-01-01', DATE '2026-01-31'),
      ('missing_gap', CAST(NULL AS STRING), DATE '2026-01-01', DATE '2026-01-31'),
      ('missing_gap', CAST(NULL AS STRING), DATE '2026-03-01', DATE '2026-03-31')
    ])
  ),
  checks AS (
    SELECT
      entry_id,
      COUNTIF(account_number IS NULL) > 0 AS has_missing,
      COUNTIF(account_number IS NOT NULL) AS known_count,
      DATE_DIFF(MAX(start_date), MIN(end_date), DAY) != 1 AS missing_periods_not_consecutive
    FROM accounts
    GROUP BY entry_id
  )
  SELECT
    NOT (SELECT has_missing FROM checks WHERE entry_id = 'known_multi')
    AND (SELECT has_missing AND known_count = 0 AND missing_periods_not_consecutive FROM checks WHERE entry_id = 'missing_gap')
) AS 'distinct known accounts are valid, while nonconsecutive missing-account periods require review';

-- End-to-end sandbox acceptance.
--
-- Before running, mechanically replace __PROJECT__.__DATASET__ with the
-- isolated sandbox project and dataset where both create scripts have already
-- been executed. The placeholder deliberately prevents accidental production
-- writes. All fixture DML is transaction-wrapped and rolled back on success or
-- failure.

CREATE TEMP TABLE e2e_documents AS
SELECT *
FROM UNNEST([
  STRUCT('uw_fixture_main_1' AS document_id, 'uw_fixture_main' AS entry_id, 1 AS document_index, 'file_uw_main_1' AS openai_file_id),
  ('uw_fixture_main_2', 'uw_fixture_main', 2, 'file_uw_main_2'),
  ('uw_fixture_main_3', 'uw_fixture_main', 3, 'file_uw_main_3'),
  ('uw_fixture_holiday_1', 'uw_fixture_holiday', 1, 'file_uw_holiday_1'),
  ('uw_fixture_missing_1', 'uw_fixture_missing', 1, 'file_uw_missing_1'),
  ('uw_fixture_overlap_1', 'uw_fixture_overlap', 1, 'file_uw_overlap_1'),
  ('uw_fixture_overlap_2', 'uw_fixture_overlap', 2, 'file_uw_overlap_2'),
  ('uw_fixture_identical_1', 'uw_fixture_identical', 1, 'file_uw_identical_1'),
  ('uw_fixture_payload_1', 'uw_fixture_payload', 1, 'file_uw_payload_1'),
  ('uw_fixture_binding_a_1', 'uw_fixture_binding_a', 1, 'file_uw_binding_shared'),
  ('uw_fixture_binding_b_1', 'uw_fixture_binding_b', 1, 'file_uw_binding_shared')
]);

CREATE TEMP TABLE e2e_extractions AS
SELECT *
FROM UNNEST([
  STRUCT(
    'uw_fixture_main' AS entry_id,
    'uw_fixture_main_1' AS document_id,
    1 AS document_index,
    'file_uw_main_1' AS openai_file_id,
    TIMESTAMP '2026-04-01 00:00:01+00' AS extracted_at,
    STRUCT(
      STRUCT(
        '1111' AS account_number,
        'Example Bank' AS bank_name,
        'Fixture Co' AS company,
        NUMERIC '1000' AS start_balance,
        NUMERIC '39300' AS end_balance,
        DATE '2026-01-01' AS statement_start_date,
        DATE '2026-01-31' AS statement_end_date,
        NUMERIC '38600' AS total_credits,
        NUMERIC '300' AS total_debits
      ) AS summary,
      [
        STRUCT(DATE '2026-01-02' AS date, 'Customer revenue' AS description, NUMERIC '20000' AS amount),
        (DATE '2026-01-03', 'Internal transfer', NUMERIC '1000'),
        (DATE '2026-01-04', 'Business loan proceeds', NUMERIC '2000'),
        (DATE '2026-01-05', 'Credibly funding', NUMERIC '15000'),
        (DATE '2026-01-06', 'Working capital', NUMERIC '500'),
        (DATE '2026-01-08', 'Credibly payment', NUMERIC '-100'),
        (DATE '2026-01-15', 'Credibly payment', NUMERIC '-100'),
        (DATE '2026-01-16', 'ACH return Credibly', NUMERIC '100'),
        (DATE '2026-01-22', 'Credibly payment', NUMERIC '-100')
      ] AS transactions
    ) AS statement
  ),
  (
    'uw_fixture_main',
    'uw_fixture_main_2',
    2,
    'file_uw_main_2',
    TIMESTAMP '2026-04-01 00:00:02+00',
    STRUCT(
      STRUCT(
        '1111', 'Example Bank', 'Fixture Co', NUMERIC '39300', NUMERIC '48775',
        DATE '2026-02-01', DATE '2026-02-28', NUMERIC '10000', NUMERIC '525'
      ),
      [
        STRUCT(DATE '2026-02-02', 'Customer revenue', NUMERIC '10000'),
        (DATE '2026-02-02', '1st Alliance payment', NUMERIC '-75'),
        (DATE '2026-02-05', 'Credibly payment', NUMERIC '-100'),
        (DATE '2026-02-09', '1st Alliance payment', NUMERIC '-75'),
        (DATE '2026-02-12', 'Credibly payment', NUMERIC '-100'),
        (DATE '2026-02-16', '1st Alliance payment', NUMERIC '-75'),
        (DATE '2026-02-19', 'Credibly payment', NUMERIC '-100')
      ]
    )
  ),
  (
    'uw_fixture_main',
    'uw_fixture_main_3',
    3,
    'file_uw_main_3',
    TIMESTAMP '2026-04-01 00:00:03+00',
    STRUCT(
      STRUCT(
        '1111', 'Example Bank', 'Fixture Co', NUMERIC '48775', NUMERIC '71825',
        DATE '2026-03-01', DATE '2026-03-31', NUMERIC '35050', NUMERIC '12000'
      ),
      [
        STRUCT(DATE '2026-03-01', 'Customer revenue', NUMERIC '12000'),
        (DATE '2026-03-01', 'Credibly funding renewal', NUMERIC '12000'),
        (DATE '2026-03-02', 'Credibly payment', NUMERIC '-120'),
        (DATE '2026-03-02', 'CFG Merchant payment', NUMERIC '-50'),
        (DATE '2026-03-02', '1st Alliance payment', NUMERIC '-90'),
        (DATE '2026-03-03', 'CFG Merchant payment', NUMERIC '-50'),
        (DATE '2026-03-04', 'CFG Merchant payment', NUMERIC '-50'),
        (DATE '2026-03-05', 'CFG Merchant payment', NUMERIC '-50'),
        (DATE '2026-03-06', 'CFG Merchant payment', NUMERIC '-50'),
        (DATE '2026-03-06', 'ACH return CFG Merchant', NUMERIC '50'),
        (DATE '2026-03-09', 'Credibly payment', NUMERIC '-120'),
        (DATE '2026-03-09', '1st Alliance payment', NUMERIC '-90'),
        (DATE '2026-03-10', 'Credibly funding mistaken', NUMERIC '11000'),
        (DATE '2026-03-11', 'ACH return Credibly', NUMERIC '-11000'),
        (DATE '2026-03-16', 'Credibly payment', NUMERIC '-120'),
        (DATE '2026-03-16', '1st Alliance payment', NUMERIC '-90'),
        (DATE '2026-03-23', 'Credibly payment', NUMERIC '-120')
      ]
    )
  ),
  (
    'uw_fixture_holiday',
    'uw_fixture_holiday_1',
    1,
    'file_uw_holiday_1',
    TIMESTAMP '2027-07-11 00:00:01+00',
    STRUCT(
      STRUCT(
        '2222', 'Holiday Bank', 'Holiday Co', NUMERIC '50', NUMERIC '0',
        DATE '2027-06-20', DATE '2027-07-10', NUMERIC '200', NUMERIC '250'
      ),
      [
        STRUCT(DATE '2027-06-20', 'Operating expense', NUMERIC '-100'),
        (DATE '2027-06-21', 'National Funding payment', NUMERIC '-50'),
        (DATE '2027-06-28', 'National Funding payment', NUMERIC '-50'),
        (DATE '2027-07-06', 'National Funding payment', NUMERIC '-50'),
        (DATE '2027-07-06', 'Customer revenue', NUMERIC '200')
      ]
    )
  ),
  (
    'uw_fixture_missing',
    'uw_fixture_missing_1',
    1,
    'file_uw_missing_1',
    TIMESTAMP '2026-05-01 00:00:01+00',
    STRUCT(
      STRUCT(
        CAST(NULL AS STRING), 'Missing Bank', 'Missing Co', CAST(NULL AS NUMERIC), CAST(NULL AS NUMERIC),
        DATE '2026-04-01', DATE '2026-04-30', CAST(NULL AS NUMERIC), CAST(NULL AS NUMERIC)
      ),
      [
        STRUCT(DATE '2026-03-31', 'Outside deposit', NUMERIC '100'),
        (DATE '2026-04-02', 'Missing amount', CAST(NULL AS NUMERIC)),
        (CAST(NULL AS DATE), 'Missing date', NUMERIC '50')
      ]
    )
  ),
  (
    'uw_fixture_overlap',
    'uw_fixture_overlap_1',
    1,
    'file_uw_overlap_1',
    TIMESTAMP '2026-07-01 00:00:01+00',
    STRUCT(
      STRUCT(
        '3333', 'Overlap Bank', 'Overlap Co', NUMERIC '100', NUMERIC '100',
        DATE '2026-05-01', DATE '2026-05-31', NUMERIC '0', NUMERIC '0'
      ),
      ARRAY<STRUCT<date DATE, description STRING, amount NUMERIC>>[]
    )
  ),
  (
    'uw_fixture_overlap',
    'uw_fixture_overlap_2',
    2,
    'file_uw_overlap_2',
    TIMESTAMP '2026-07-01 00:00:02+00',
    STRUCT(
      STRUCT(
        '3333', 'Overlap Bank', 'Overlap Co', NUMERIC '100', NUMERIC '100',
        DATE '2026-05-15', DATE '2026-06-14', NUMERIC '0', NUMERIC '0'
      ),
      ARRAY<STRUCT<date DATE, description STRING, amount NUMERIC>>[]
    )
  ),
  (
    'uw_fixture_identical',
    'uw_fixture_identical_1',
    1,
    'file_uw_identical_1',
    TIMESTAMP '2026-08-01 00:00:01+00',
    STRUCT(
      STRUCT(
        '4444', 'Duplicate Bank', 'Duplicate Co', NUMERIC '100', NUMERIC '1100',
        DATE '2026-07-01', DATE '2026-07-31', NUMERIC '1100', NUMERIC '100'
      ),
      [
        STRUCT(DATE '2026-07-02' AS date, 'Credibly funding' AS description, NUMERIC '1000' AS amount),
        (DATE '2026-07-03', 'Credibly payment', NUMERIC '-100'),
        (DATE '2026-07-06', 'ACH return Credibly', NUMERIC '100')
      ]
    )
  ),
  (
    'uw_fixture_payload',
    'uw_fixture_payload_1',
    1,
    'file_uw_payload_1',
    TIMESTAMP '2026-08-01 00:00:01+00',
    STRUCT(
      STRUCT(
        '5555', 'Conflict Bank', 'Conflict Co', NUMERIC '100', NUMERIC '100',
        DATE '2026-07-01', DATE '2026-07-31', NUMERIC '0', NUMERIC '0'
      ),
      ARRAY<STRUCT<date DATE, description STRING, amount NUMERIC>>[]
    )
  ),
  (
    'uw_fixture_binding_a',
    'uw_fixture_binding_a_1',
    1,
    'file_uw_binding_shared',
    TIMESTAMP '2026-08-01 00:00:01+00',
    STRUCT(
      STRUCT(
        '6666', 'Binding Bank', 'Binding Co', NUMERIC '100', NUMERIC '100',
        DATE '2026-07-01', DATE '2026-07-31', NUMERIC '0', NUMERIC '0'
      ),
      ARRAY<STRUCT<date DATE, description STRING, amount NUMERIC>>[]
    )
  ),
  (
    'uw_fixture_binding_b',
    'uw_fixture_binding_b_1',
    1,
    'file_uw_binding_shared',
    TIMESTAMP '2026-08-01 00:00:02+00',
    STRUCT(
      STRUCT(
        '6666', 'Binding Bank', 'Binding Co', NUMERIC '100', NUMERIC '100',
        DATE '2026-07-01', DATE '2026-07-31', NUMERIC '0', NUMERIC '0'
      ),
      ARRAY<STRUCT<date DATE, description STRING, amount NUMERIC>>[]
    )
  )
]);

CREATE TEMP TABLE e2e_extraction_rows AS
SELECT * FROM e2e_extractions
UNION ALL
SELECT
  entry_id,
  document_id,
  document_index,
  openai_file_id,
  TIMESTAMP '2026-08-01 00:00:02+00' AS extracted_at,
  statement
FROM e2e_extractions
WHERE openai_file_id = 'file_uw_identical_1'
UNION ALL
SELECT
  entry_id,
  document_id,
  document_index,
  openai_file_id,
  TIMESTAMP '2026-08-01 00:00:02+00' AS extracted_at,
  STRUCT(
    STRUCT(
      '5555' AS account_number,
      'Conflict Bank' AS bank_name,
      'Conflict Co' AS company,
      NUMERIC '200' AS start_balance,
      NUMERIC '200' AS end_balance,
      DATE '2026-07-01' AS statement_start_date,
      DATE '2026-07-31' AS statement_end_date,
      NUMERIC '0' AS total_credits,
      NUMERIC '0' AS total_debits
    ) AS summary,
    ARRAY<STRUCT<date DATE, description STRING, amount NUMERIC>>[] AS transactions
  ) AS statement
FROM e2e_extractions
WHERE openai_file_id = 'file_uw_payload_1';

BEGIN
  BEGIN TRANSACTION;

  DELETE FROM `__PROJECT__.__DATASET__.bank_statement_agent_extractions`
  WHERE STARTS_WITH(entry_id, 'uw_fixture_');

  DELETE FROM `__PROJECT__.__DATASET__.submission_documents`
  WHERE STARTS_WITH(entry_id, 'uw_fixture_');

  INSERT INTO `__PROJECT__.__DATASET__.submission_documents` (
    document_id,
    entry_id,
    submitted_at,
    document_type,
    document_index,
    gcs_uri,
    gcs_generation,
    source_content_type,
    source_size_bytes,
    source_sha256,
    openai_file_id,
    vector_store_id,
    vector_store_file_id,
    ingestion_status,
    openai_status,
    attempt_count,
    source_event_id,
    error_code,
    created_at,
    updated_at,
    completed_at
  )
  SELECT
    document_id,
    entry_id,
    TIMESTAMP '2026-08-02 00:00:00+00',
    'bank_statement',
    document_index,
    CONCAT('gs://sandbox-fixtures/', document_id, '.pdf'),
    '1',
    'application/pdf',
    1,
    TO_HEX(SHA256(document_id)),
    openai_file_id,
    'vs_uw_fixture',
    CONCAT('vsf_', document_id),
    'completed',
    'completed',
    1,
    'uw_fixture_event',
    CAST(NULL AS STRING),
    TIMESTAMP '2026-08-02 00:00:00+00',
    TIMESTAMP '2026-08-02 00:00:00+00',
    TIMESTAMP '2026-08-02 00:00:00+00'
  FROM e2e_documents;

  INSERT INTO `__PROJECT__.__DATASET__.bank_statement_agent_extractions` (
    entry_id,
    document_id,
    document_index,
    openai_file_id,
    extracted_at,
    statement
  )
  SELECT
    entry_id,
    document_id,
    document_index,
    openai_file_id,
    extracted_at,
    statement
  FROM e2e_extraction_rows;

  ASSERT (
    SELECT COUNT(*) = 13
    FROM `__PROJECT__.__DATASET__.bank_statement_agent_extractions`
    WHERE STARTS_WITH(entry_id, 'uw_fixture_')
  ) AS 'E2E raw extraction row count changed';

  ASSERT (
    SELECT COUNT(*) = 10
    FROM `__PROJECT__.__DATASET__.bank_statement_extractions_canonical`
    WHERE STARTS_WITH(entry_id, 'uw_fixture_')
  ) AS 'E2E canonical extraction count must be one per file';

  ASSERT (
    SELECT COUNT(*) = 10
    FROM `__PROJECT__.__DATASET__.bank_statement_calculated`
    WHERE STARTS_WITH(entry_id, 'uw_fixture_')
  ) AS 'E2E calculated view must not fan out canonical files';

  ASSERT (
    SELECT duplicate_count = 2
      AND NOT duplicate_payload_conflict
      AND NOT duplicate_binding_conflict
    FROM `__PROJECT__.__DATASET__.bank_statement_extractions_canonical`
    WHERE openai_file_id = 'file_uw_identical_1'
  ) AS 'E2E identical duplicate must remain safe';

  ASSERT (
    SELECT duplicate_payload_conflict AND NOT duplicate_binding_conflict
    FROM `__PROJECT__.__DATASET__.bank_statement_extractions_canonical`
    WHERE openai_file_id = 'file_uw_payload_1'
  ) AS 'E2E payload conflict must be surfaced';

  ASSERT (
    SELECT duplicate_binding_conflict
    FROM `__PROJECT__.__DATASET__.bank_statement_extractions_canonical`
    WHERE openai_file_id = 'file_uw_binding_shared'
  ) AS 'E2E binding conflict must be surfaced';

  ASSERT (
    SELECT COUNT(*) = 3
    FROM `__PROJECT__.__DATASET__.bank_statement_underwriting_summary`
    WHERE entry_id = 'uw_fixture_main'
  ) AS 'E2E main entry must retain exactly three per-PDF summaries';

  ASSERT (
    SELECT total_deposits = NUMERIC '38600'
      AND confirmed_non_revenue_deposits = NUMERIC '18100'
      AND true_deposits = NUMERIC '20500'
      AND ambiguous_non_revenue_candidate_amount = NUMERIC '500'
      AND ARRAY_LENGTH(large_mca_deposits) = 1
    FROM `__PROJECT__.__DATASET__.bank_statement_underwriting_summary`
    WHERE document_id = 'uw_fixture_main_1'
  ) AS 'E2E confirmed non-revenue, candidate, reversal, and large-MCA totals changed';

  ASSERT (
    SELECT COUNTIF(is_confirmed_reversal) = 1
      AND COUNTIF(is_reversed_payment) = 1
    FROM `__PROJECT__.__DATASET__.bank_statement_transactions_classified`
    WHERE document_id = 'uw_fixture_main_1'
  ) AS 'E2E positive return must cancel exactly one lender payment';

  ASSERT (
    SELECT COUNTIF(
      reversal.is_confirmed_reversal
        AND reversal.transaction_date = DATE '2026-03-06'
        AND original.transaction_date = DATE '2026-03-06'
        AND original.is_reversed_payment
    ) = 1
    FROM `__PROJECT__.__DATASET__.bank_statement_transactions_classified` AS reversal
    JOIN `__PROJECT__.__DATASET__.bank_statement_transactions_classified` AS original
      ON reversal.paired_reversal_transaction_id = original.transaction_id
    WHERE reversal.document_id = 'uw_fixture_main_3'
      AND reversal.amount = NUMERIC '50'
  ) AS 'E2E daily equal-payment return must pair the deterministic nearest prior debit';

  ASSERT (
    SELECT COUNTIF(
      original.amount = NUMERIC '11000'
        AND original.is_reversed_original
        AND reversal.amount = NUMERIC '-11000'
        AND reversal.is_confirmed_reversal
    ) = 1
    FROM `__PROJECT__.__DATASET__.bank_statement_transactions_classified` AS original
    JOIN `__PROJECT__.__DATASET__.bank_statement_transactions_classified` AS reversal
      ON original.paired_reversal_transaction_id = reversal.transaction_id
    WHERE original.document_id = 'uw_fixture_main_3'
  ) AS 'E2E negative return must mark the original positive funding as reversed';

  ASSERT (
    SELECT ARRAY_LENGTH(large_mca_deposits) = 1
      AND large_mca_deposits[OFFSET(0)].amount = NUMERIC '12000'
    FROM `__PROJECT__.__DATASET__.bank_statement_underwriting_summary`
    WHERE document_id = 'uw_fixture_main_3'
  ) AS 'E2E reversed positive funding must not create a funding epoch or large-MCA deposit';

  ASSERT (
    SELECT COUNTIF(frequency = 'BUSINESS_DAILY' AND position_confidence = 'CONFIRMED') > 0
      AND COUNTIF(frequency = 'WEEKLY' AND position_confidence = 'CONFIRMED') > 0
    FROM `__PROJECT__.__DATASET__.bank_statement_mca_positions`
    WHERE entry_id = 'uw_fixture_main'
  ) AS 'E2E daily and weekly confirmed cadence detection changed';

  ASSERT (
    SELECT COUNT(DISTINCT position_key) >= 2
    FROM `__PROJECT__.__DATASET__.bank_statement_mca_positions`
    WHERE entry_id = 'uw_fixture_main'
      AND canonical_lender = 'Credibly'
      AND position_confidence = 'CONFIRMED'
  ) AS 'E2E same-lender renewal must start a new position';

  ASSERT (
    SELECT COUNT(DISTINCT position_key) >= 2
    FROM `__PROJECT__.__DATASET__.bank_statement_mca_positions`
    WHERE entry_id = 'uw_fixture_main'
      AND canonical_lender = '1st Alliance'
      AND position_confidence = 'CONFIRMED'
  ) AS 'E2E sustained amount change must start a new stream';

  ASSERT (
    SELECT COUNTIF(status = 'CURRENT_WITH_MISSES' AND missed_payment_count > 0) > 0
      AND COUNTIF(status = 'INACTIVE' AND missed_payment_count > 0) > 0
    FROM `__PROJECT__.__DATASET__.bank_statement_mca_positions`
    WHERE entry_id = 'uw_fixture_main'
      AND position_confidence = 'CONFIRMED'
  ) AS 'E2E current status and missed-payment handling changed';

  ASSERT (
    SELECT frequency = 'WEEKLY'
      AND status = 'CURRENT_PAYING'
      AND missed_payment_count = 0
    FROM `__PROJECT__.__DATASET__.bank_statement_mca_positions`
    WHERE entry_id = 'uw_fixture_holiday'
      AND canonical_lender = 'National Funding'
  ) AS 'E2E weekly holiday anchor must shift and match within one business day';

  ASSERT (
    SELECT negative_balance_days = 16
      AND average_daily_balance IS NOT NULL
    FROM `__PROJECT__.__DATASET__.bank_statement_underwriting_summary`
    WHERE entry_id = 'uw_fixture_holiday'
  ) AS 'E2E inclusive ADB, no-activity carry, same-day netting, or negative-day count changed';

  ASSERT (
    SELECT total_deposits IS NULL
      AND average_daily_balance IS NULL
      AND 'MISSING_CALCULATION_INPUT' IN UNNEST(quality_reasons)
      AND 'TRANSACTION_OUTSIDE_PERIOD' IN UNNEST(quality_reasons)
    FROM `__PROJECT__.__DATASET__.bank_statement_underwriting_summary`
    WHERE entry_id = 'uw_fixture_missing'
  ) AS 'E2E missing and out-of-period failures must null metrics and require review';

  ASSERT (
    SELECT LOGICAL_AND('OVERLAPPING_STATEMENTS' IN UNNEST(quality_reasons))
    FROM `__PROJECT__.__DATASET__.bank_statement_underwriting_summary`
    WHERE entry_id = 'uw_fixture_overlap'
  ) AS 'E2E same-account overlaps must require review';

  ASSERT (
    SELECT analysis_status = 'REVIEW_REQUIRED'
      AND expected_document_count = 3
      AND extracted_document_count = 3
      AND all_documents_processed
      AND statement_count = 3
      AND current_mca_position_count > 0
      AND ARRAY_LENGTH(statements) = 3
      AND statements[OFFSET(0)].document_index = 1
      AND statements[OFFSET(1)].document_index = 2
      AND statements[OFFSET(2)].document_index = 3
    FROM `__PROJECT__.__DATASET__.submission_underwriting_summary`
    WHERE entry_id = 'uw_fixture_main'
  ) AS 'E2E submission rollup cardinality, readiness, or deterministic statement ordering changed';

  ASSERT (
    SELECT overall_withholding_percentage = NUMERIC '7.92'
    FROM `__PROJECT__.__DATASET__.bank_statement_underwriting_summary`
    WHERE document_id = 'uw_fixture_main_3'
  ) AS 'E2E withholding must use successful confirmed debits over true deposits';

  ASSERT (
    SELECT COUNT(*) = 1
      AND COUNTIF(
        successful_payment_count = 0
          AND total_paid = NUMERIC '0'
          AND frequency = 'UNCONFIRMED'
          AND position_confidence = 'CONFIRMED'
      ) = 1
    FROM `__PROJECT__.__DATASET__.bank_statement_mca_positions`
    WHERE entry_id = 'uw_fixture_identical'
      AND document_id = 'uw_fixture_identical_1'
      AND canonical_lender = 'Credibly'
  ) AS 'E2E reversed-only lender debit must retain membership without counting as successful';

  ASSERT (
    SELECT analysis_status = 'READY'
      AND average_true_deposits IS NOT NULL
    FROM `__PROJECT__.__DATASET__.submission_underwriting_summary`
    WHERE entry_id = 'uw_fixture_identical'
  ) AS 'E2E identical duplicates must not force review or null aggregates';

  ASSERT (
    SELECT analysis_status = 'REVIEW_REQUIRED'
      AND average_true_deposits IS NULL
    FROM `__PROJECT__.__DATASET__.submission_underwriting_summary`
    WHERE entry_id = 'uw_fixture_payload'
  ) AS 'E2E payload conflicts must force review and null financial aggregates';

  ASSERT (
    SELECT LOGICAL_AND(
      analysis_status = 'REVIEW_REQUIRED'
      AND average_true_deposits IS NULL
    )
    FROM `__PROJECT__.__DATASET__.submission_underwriting_summary`
    WHERE entry_id IN ('uw_fixture_binding_a', 'uw_fixture_binding_b')
  ) AS 'E2E binding conflicts must force review and null financial aggregates';

  ASSERT (
    SELECT COUNT(*) = 0
    FROM `__PROJECT__.__DATASET__.INFORMATION_SCHEMA.COLUMN_FIELD_PATHS`
    WHERE table_name IN (
      'bank_statement_transactions_classified',
      'bank_statement_mca_positions',
      'bank_statement_underwriting_summary',
      'submission_underwriting_summary'
    )
      AND (
        ENDS_WITH(LOWER(field_path), 'description')
        OR ENDS_WITH(LOWER(field_path), 'account_number')
      )
  ) AS 'E2E final underwriting views must not expose raw descriptions or account numbers';

  ROLLBACK TRANSACTION;
EXCEPTION WHEN ERROR THEN
  ROLLBACK TRANSACTION;
  RAISE;
END;
