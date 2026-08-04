import assert from "node:assert/strict";
import test from "node:test";

import { ingestDocument } from "./ingest.js";

const document = {
  document_id: "doc_synthetic",
  entry_id: "ndbf_synthetic",
  submitted_at: "2026-08-04T12:00:00.000Z",
  document_type: "bank_statement",
  document_index: 1,
  gcs_uri: "gs://app_banks/synthetic/bank.pdf",
};

test("persists each resumable boundary and completes", async () => {
  const events = [];
  const repo = {
    ensure: async () => ({ ingestion_status: "PENDING" }),
    markUploaded: async (_doc, value) => events.push(["uploaded", value]),
    markAttached: async (_doc, value) => events.push(["attached", value]),
    markCompleted: async (_doc, value) => events.push(["completed", value]),
    markFailed: async () => assert.fail("must not fail"),
  };
  const result = await ingestDocument(document, {
    repo,
    loadSource: async () => ({
      bytes: Buffer.from("synthetic"),
      generation: "123",
      contentType: "application/pdf",
      sizeBytes: 9,
      sha256: "abc",
    }),
    prepareUpload: async (source) => ({
      ...source,
      filename: "doc_synthetic.pdf",
      contentType: "application/pdf",
    }),
    openai: {
      uploadFile: async () => ({ id: "file_synthetic" }),
      attachFile: async () => ({ id: "file_synthetic", status: "in_progress" }),
      pollFile: async () => ({ id: "file_synthetic", status: "completed" }),
    },
  });

  assert.equal(result.status, "COMPLETED");
  assert.deepEqual(events.map(([name]) => name), ["uploaded", "attached", "completed"]);
  assert.equal(events[0][1].openaiFileId, "file_synthetic");
});

test("skips a document that is already complete", async () => {
  const result = await ingestDocument(document, {
    repo: {
      ensure: async () => ({
        ingestion_status: "COMPLETED",
        openai_file_id: "file_existing",
        vector_store_file_id: "file_existing",
      }),
    },
  });
  assert.deepEqual(result, { status: "COMPLETED", skipped: true, fileId: "file_existing" });
});

test("resumes from an uploaded file without uploading it again", async () => {
  let uploadCalls = 0;
  const events = [];
  const result = await ingestDocument(document, {
    repo: {
      ensure: async () => ({
        ingestion_status: "UPLOADED",
        openai_file_id: "file_existing",
        vector_store_file_id: null,
      }),
      markAttached: async () => events.push("attached"),
      markCompleted: async () => events.push("completed"),
      markFailed: async () => assert.fail("must not fail"),
    },
    openai: {
      uploadFile: async () => {
        uploadCalls += 1;
      },
      attachFile: async () => ({ id: "file_existing", status: "in_progress" }),
      pollFile: async () => ({ id: "file_existing", status: "completed" }),
    },
  });

  assert.equal(uploadCalls, 0);
  assert.deepEqual(events, ["attached", "completed"]);
  assert.equal(result.fileId, "file_existing");
});
