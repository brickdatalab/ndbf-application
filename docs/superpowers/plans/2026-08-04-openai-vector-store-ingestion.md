# OpenAI Vector Store Ingestion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically upload every bank-statement PDF from future submissions to the configured OpenAI vector store and retain a durable one-row-per-PDF BigQuery lookup.

**Architecture:** Add a separate event-driven VM worker with its own new subscription to the existing `submission-completed` topic, so it receives future events only. The worker reads only the bank-statement PDF URIs from the submission row, uploads each PDF through the OpenAI Files API, attaches it to the configured vector store with explicit 800-token chunks and 400-token overlap, polls indexing, and records resumable state in `ndbf_applications.submission_documents` without changing the submission or email paths.

**Tech Stack:** Node.js 20, Google Pub/Sub, Google Cloud Storage, BigQuery, OpenAI Files/Vector Stores REST APIs, PM2.

---

## Chunk 1: Local worker and tests

### Task 1: Define deterministic document records

**Files:**
- Create: `vectorizer/documents.js`
- Test: `vectorizer/documents.node-test.js`

- [x] Build one deterministic document record for each bank-statement PDF and ignore the generated application PDF.
- [x] Use a stable SHA-256-based `document_id` derived from `entry_id` and GCS URI.
- [x] Preserve the bank-statement order, ignore non-PDF attachments, and reject duplicate PDF GCS URIs.
- [x] Run the focused tests and require zero failures.

### Task 2: Add the OpenAI API boundary and resumable ingestion

**Files:**
- Create: `vectorizer/openai.js`
- Create: `vectorizer/ingest.js`
- Test: `vectorizer/openai.node-test.js`
- Test: `vectorizer/ingest.node-test.js`

- [x] Upload using `purpose=assistants` and retain the returned `file_id`.
- [x] Attach the file to `OPENAI_VECTOR_STORE_ID` with `submission_id`, `document_id`, `document_type`, and `document_index` attributes.
- [x] Poll until `completed`; fail safely on provider failure or timeout.
- [x] Resume from stored upload/attach state and skip already completed documents.
- [x] Never include applicant values, filenames, GCS URIs, or provider response bodies in logs/errors.

### Task 3: Wire GCP and document preparation

**Files:**
- Create: `vectorizer/worker.js`
- Create: `vectorizer/package.json`
- Create: `vectorizer/ecosystem.config.cjs`
- Create: `vectorizer/README.md`

- [x] Read only `entry_id`, timestamps, and document GCS URIs from BigQuery.
- [x] Download source objects from the existing private bucket.
- [x] Accept bank-statement PDFs only and leave every GCS object unchanged.
- [x] Persist every state transition in the lookup table.
- [x] Subscribe independently so worker failures cannot block submissions or email.

## Chunk 2: GCP resources and deployment

### Task 4: Create the lookup table

**Files:**
- Create: `vectorizer/sql/create-submission-documents.sql`
- Modify: `INFRA.md`

- [x] Inspect the dataset and dry-run the DDL.
- [x] Create a daily-partitioned table clustered by `entry_id`, status, and type.
- [x] Verify the schema, partitioning, clustering, and empty initial state.

### Task 5: Deploy the independent worker

- [x] Deploy verified files atomically to `/opt/ndbf-vectorizer`.
- [x] Create `submission-completed-vectorizer` on the existing topic and dead-letter topic.
- [x] Start only `ndbf-vectorizer` through PM2 using `/opt/ndbf/.env` without editing it.
- [x] Save PM2 and verify backend, emailer, and vectorizer are online.

### Task 6: Verify the future-only boundary

- [x] Confirm the new subscription has no historical backlog.
- [x] Do not upload or backfill any existing application document.
- [x] Verify synthetic unit tests cover the returned OpenAI file ID and lookup state transitions.
- [x] Verify no application row, GCS object, email, or existing service changed.
- [x] Append one concise sanitized root `CHANGELOG.md` entry.
