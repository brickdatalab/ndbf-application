import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSubmissionDocuments,
  documentIdFor,
  parseGcsUri,
} from "./documents.js";

test("builds one stable lookup record per bank-statement PDF only", () => {
  const row = {
    entry_id: "ndbf_synthetic1",
    submitted_at: { value: "2026-08-04T12:00:00.000Z" },
    pdf_gcs_key: "gs://app_banks/synthetic/application.pdf",
    bank_statement_gcs_keys: [
      "gs://app_banks/synthetic/bank_01.pdf",
      "gs://app_banks/synthetic/bank_02.png",
    ],
  };

  const docs = buildSubmissionDocuments(row);

  assert.equal(docs.length, 1);
  assert.deepEqual(
    docs.map(({ document_type, document_index }) => ({ document_type, document_index })),
    [{ document_type: "bank_statement", document_index: 1 }]
  );
  assert.equal(
    docs[0].document_id,
    documentIdFor(row.entry_id, row.bank_statement_gcs_keys[0])
  );
  assert.equal(docs[0].submitted_at, "2026-08-04T12:00:00.000Z");
  assert.match(docs[0].document_id, /^doc_[a-f0-9]{32}$/);
});

test("rejects duplicate GCS references instead of creating ambiguous rows", () => {
  assert.throws(
    () =>
      buildSubmissionDocuments({
        entry_id: "ndbf_synthetic2",
        submitted_at: "2026-08-04T12:00:00.000Z",
        pdf_gcs_key: null,
        bank_statement_gcs_keys: [
          "gs://app_banks/synthetic/duplicate.pdf",
          "gs://app_banks/synthetic/duplicate.pdf",
        ],
      }),
    /DUPLICATE_GCS_URI/
  );
});

test("parses only valid GCS URIs", () => {
  assert.deepEqual(parseGcsUri("gs://app_banks/folder/file.pdf"), {
    bucket: "app_banks",
    object: "folder/file.pdf",
  });
  assert.throws(() => parseGcsUri("https://example.com/file.pdf"), /INVALID_GCS_URI/);
});
