# Bank-Statement Extraction BigQuery Contract

The extraction agent writes one row for each bank-statement PDF to:

```env
BIGQUERY_TABLE_ID=lithe-hallway-493420-r4.ndbf_applications.bank_statement_agent_extractions
```

The existing BigQuery Data Editor service-account role is sufficient for direct row insertion. Use the OpenAI file ID as the BigQuery insert ID when the client supports it.

## Identifier mapping

- `entry_id`: vector-store attribute `submission_id`
- `document_id`: vector-store attribute `document_id`
- `document_index`: vector-store attribute `document_index`
- `openai_file_id`: the processed OpenAI file ID
- `extracted_at`: UTC timestamp recorded when extraction completes
- `statement`: the exact `statement` object returned under `bank-statement-agent-output.schema.json`

## Posted row

```json
{
  "entry_id": "ndbf_example",
  "document_id": "doc_example",
  "document_index": 1,
  "openai_file_id": "file_example",
  "extracted_at": "2026-08-04T15:00:00Z",
  "statement": {
    "summary": {
      "account_number": null,
      "bank_name": "Example Bank",
      "company": "Example Company",
      "start_balance": 1000.0,
      "end_balance": 1250.0,
      "statement_start_date": "2026-07-01",
      "statement_end_date": "2026-07-31",
      "total_credits": 500.0,
      "total_debits": 250.0
    },
    "transactions": [
      {
        "date": "2026-07-02",
        "description": "Example credit",
        "amount": 500.0
      },
      {
        "date": "2026-07-03",
        "description": "Example debit",
        "amount": -250.0
      }
    ]
  }
}
```

All nine summary keys and all three transaction keys must be present. Values allowed to be `null` by the agent schema stay `null`; they must never be replaced with zero. Dates use `YYYY-MM-DD`, timestamps use UTC, and monetary values are stored as BigQuery `NUMERIC`.

The agent writes extracted data only. BigQuery supplies all counts, totals, balances, comparisons, and underwriting rollups through:

- `ndbf_applications.bank_statement_extractions_canonical`
- `ndbf_applications.bank_statement_calculated`
- `ndbf_applications.submission_bank_statement_summary`
- `ndbf_applications.bank_statement_transactions_classified`
- `ndbf_applications.bank_statement_mca_positions`
- `ndbf_applications.bank_statement_underwriting_summary`
- `ndbf_applications.submission_underwriting_summary`

`submission_underwriting_summary` is the compact retrieval boundary: query it by
parameterized `entry_id`. It contains opaque document identifiers, calculated
statement metrics, MCA positions, quality reasons, and the submission status,
but omits account numbers and raw transaction descriptions.

When every expected bank statement is visible, the extraction worker publishes
an at-least-once event to `bank-statement-underwriting-ready`. Consumers must
deduplicate it by the stable `event_key`.
