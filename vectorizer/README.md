# NDBF Vectorizer

Independent Pub/Sub worker for future submission bank-statement PDFs.

For each new `submission-completed` event, the worker locks every tracked bank
statement to `NDBF_EXTRACTION_PROVIDER` and follows exactly one provider path:

1. Reads only `entry_id`, `submitted_at`, and `bank_statement_gcs_keys`.
2. Ignores the generated application PDF and non-PDF bank attachments.
3. In `openai` mode, uploads and indexes each PDF in `OPENAI_VECTOR_STORE_ID`, then queues its file ID.
4. In `llama` mode, skips OpenAI entirely and concurrently queues each tracked document for LlamaExtract v2.
5. Requires `202 Accepted` for every document before acknowledging the submission event.

The worker does not backfill historical submissions. Its subscription is created after deployment and therefore begins with future Pub/Sub messages only.

The extraction service sends the complete PDF as a Responses API `input_file` with `detail: "high"`. That full-PDF extraction behavior remains separate from vector-store indexing and runs asynchronously through the durable extraction queue.

After extraction, deterministic BigQuery views calculate statement deposits,
true deposits, daily balances, negative days, MCA positions, missed payments,
and withholding. The extraction worker publishes a privacy-safe readiness event
only after every expected PDF for the submission is visible in the compact
submission underwriting view.

The external extraction agent's BigQuery table, identifier mapping, and exact
posted-row shape are defined in `BANK_STATEMENT_EXTRACTION_CONTRACT.md`.

Required environment variables are loaded from `/opt/ndbf/.env` without changing that file:

- `OPENAI_API_KEY`
- `OPENAI_VECTOR_STORE_ID`
- `NDBF_EXTRACTION_URL`
- `NDBF_EXTRACTION_API_TOKEN`
- `NDBF_EXTRACTION_PROVIDER` (`openai` or `llama`)

Optional overrides:

- `VECTOR_SUBSCRIPTION` (default `submission-completed-vectorizer`)
- `BQ_DOCUMENTS_TABLE` (default `submission_documents`)

Switch only while all extraction work is idle:

```bash
sudo /opt/ndbf/scripts/set-extraction-provider openai
sudo /opt/ndbf/scripts/set-extraction-provider llama
```
