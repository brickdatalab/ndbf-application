# NDBF Vectorizer

Independent Pub/Sub worker for future submission bank-statement PDFs.

For each new `submission-completed` event, the worker:

1. Reads only `entry_id`, `submitted_at`, and `bank_statement_gcs_keys`.
2. Ignores the generated application PDF and non-PDF bank attachments.
3. Uploads each bank-statement PDF to the OpenAI Files API.
4. Attaches it to `OPENAI_VECTOR_STORE_ID` using static 800-token chunks with 400-token overlap.
5. Polls until indexing completes and saves the returned OpenAI file ID in `ndbf_applications.submission_documents`.

The worker does not backfill historical submissions. Its subscription is created after deployment and therefore begins with future Pub/Sub messages only.

The later extraction agent should send the complete PDF as a Responses API `input_file` with `detail: "high"`. That full-PDF extraction behavior is intentionally separate from vector-store indexing and is not performed by this worker.

Required environment variables are loaded from `/opt/ndbf/.env` without changing that file:

- `OPENAI_API_KEY`
- `OPENAI_VECTOR_STORE_ID`

Optional overrides:

- `VECTOR_SUBSCRIPTION` (default `submission-completed-vectorizer`)
- `BQ_DOCUMENTS_TABLE` (default `submission_documents`)
