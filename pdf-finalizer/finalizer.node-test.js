import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createFinalizer, createMessageHandler } from "./finalizer.js";
import { parseUnderwritingReadyEvent, validateSummaryRow } from "./contracts.js";
import { createProductionAdapters } from "./adapters.js";
import { renderFinalizedPdf, verifyFinalizedPdf } from "./renderer.js";
import { validateDeclaredPdfLayout } from "@ndbf/pdf-layout/pdf-layout-validator.js";
import { ENTRY_ID, readyEvent, sourcePdf, summaryRow } from "./test-fixtures.js";

function memoryDependencies({ status = "READY" } = {}) {
  const objects = new Map();
  const order = [];
  const published = [];
  const sourceBuffer = sourcePdf();
  let row = summaryRow({ status });
  let generation = 20;
  const dependencies = {
    queryRows: async () => [row],
    loadSource: async () => ({
      objectName: `synthetic_${ENTRY_ID}/source.pdf`,
      buffer: sourceBuffer,
      generation: "10",
      metadata: {},
    }),
    findArtifact: async (objectName) => objects.get(objectName) ?? null,
    createArtifact: async ({ objectName, buffer, metadata, ifGenerationMatch }) => {
      order.push("store");
      assert.equal(ifGenerationMatch, 0);
      if (objects.has(objectName)) {
        const error = new Error("exists");
        error.code = 412;
        throw error;
      }
      generation += 1;
      objects.set(objectName, {
        objectName,
        buffer,
        metadata,
        generation: String(generation),
      });
      return { generation: String(generation) };
    },
    publish: async (event) => {
      order.push("publish");
      published.push(event);
      return `message-${published.length}`;
    },
    validateSourcePdf: validateDeclaredPdfLayout,
    renderFinalizedPdf,
    verifyFinalizedPdf,
  };
  return {
    dependencies,
    objects,
    order,
    published,
    setRow(value) {
      row = value;
    },
  };
}

test("strictly validates events while acknowledging irrelevant legacy events", () => {
  assert.equal(
    parseUnderwritingReadyEvent(Buffer.from(JSON.stringify({ event_type: "legacy" }))).kind,
    "irrelevant",
  );
  assert.throws(() => parseUnderwritingReadyEvent(Buffer.from("{")));
  assert.throws(() =>
    parseUnderwritingReadyEvent(
      Buffer.from(JSON.stringify({ ...readyEvent(), extracted_document_count: 0 })),
    ),
  );
  assert.equal(
    parseUnderwritingReadyEvent(Buffer.from(JSON.stringify(readyEvent()))).kind,
    "accepted",
  );
});

test("queries the existing underwriting views directly with one entry_id parameter", async () => {
  const queryOptions = [];
  const fixture = summaryRow();
  const adapters = createProductionAdapters({
    projectId: "sandbox-project",
    datasetId: "ndbf_pdf_test_20260805",
    bigquery: {
      query: async (options) => {
        queryOptions.push(options);
        if (options.query.includes("submission_underwriting_summary")) {
          return [[{
            entry_id: ENTRY_ID,
            analysis_version: 1,
            analysis_status: "READY",
            expected_document_count: 1,
            extracted_document_count: 1,
            all_documents_processed: true,
            pdf_gcs_key: fixture.pdf_gcs_key,
            pdf_layout_version: fixture.pdf_layout_version,
            pdf_source_generation: fixture.pdf_source_generation,
            pdf_source_sha256: fixture.pdf_source_sha256,
          }]];
        }
        if (options.query.includes("bank_statement_underwriting_summary")) {
          return [[fixture.statements[0]]];
        }
        return [[]];
      },
    },
    storage: { bucket: () => ({}) },
    pubsub: { topic: () => ({}) },
  });
  const rows = await adapters.queryRows(ENTRY_ID);
  assert.equal(rows.length, 1);
  assert.equal(queryOptions.length, 2);
  for (const options of queryOptions) {
    assert.equal(options.params.entry_id, ENTRY_ID);
    assert.equal(options.types.entry_id, "STRING");
    assert.match(options.query, /@entry_id/);
    assert.doesNotMatch(options.query, new RegExp(ENTRY_ID));
    assert.doesNotMatch(options.query, /application_pdf_underwriting_summary/);
    assert.doesNotMatch(options.query, /lithe-hallway-493420-r4/);
  }
  assert.equal(rows[0].statements.length, 1);
  assert.equal("mca_deposits" in rows[0], false);
  assert.equal("debt_accounts" in rows[0], false);
  assert.match(rows[0].summary_fingerprint, /^[a-f0-9]{64}$/);

  for (const invalid of [
    { projectId: "bad`project", datasetId: "safe_dataset" },
    { projectId: "sandbox-project", datasetId: "bad.dataset" },
  ]) {
    assert.throws(
      () => createProductionAdapters({
        ...invalid,
        bigquery: { query: async () => [[]] },
        storage: { bucket: () => ({}) },
        pubsub: { topic: () => ({}) },
      }),
      /BIGQUERY_(PROJECT|DATASET)_ID_INVALID/,
    );
  }
});

test("requires one unique statement binding per expected document", () => {
  const event = readyEvent();
  const incomplete = summaryRow();
  incomplete.statements = [];
  assert.throws(() => validateSummaryRow(incomplete, event), {
    code: "SUMMARY_STATEMENT_COUNT_MISMATCH",
  });

  for (const missingKey of ["document_id", "openai_file_id"]) {
    const missingOne = summaryRow();
    delete missingOne.statements[0][missingKey];
    assert.throws(() => validateSummaryRow(missingOne, event), {
      code: "SUMMARY_DOCUMENT_BINDING_INVALID",
    });
  }

  const missingBoth = summaryRow();
  delete missingBoth.statements[0].document_id;
  delete missingBoth.statements[0].openai_file_id;
  assert.throws(() => validateSummaryRow(missingBoth, event), {
    code: "SUMMARY_DOCUMENT_BINDING_INVALID",
  });

  const duplicateEvent = {
    ...event,
    expected_document_count: 2,
    extracted_document_count: 2,
  };
  const duplicate = summaryRow();
  duplicate.expected_document_count = 2;
  duplicate.extracted_document_count = 2;
  duplicate.statements = [
    { ...duplicate.statements[0], document_id: "doc_1", openai_file_id: "file_1" },
    { ...duplicate.statements[0], document_id: "doc_1", openai_file_id: "file_1" },
  ];
  assert.throws(() => validateSummaryRow(duplicate, duplicateEvent), {
    code: "SUMMARY_DOCUMENT_BINDING_INVALID",
  });

  const duplicateUnbound = summaryRow();
  duplicateUnbound.expected_document_count = 2;
  duplicateUnbound.extracted_document_count = 2;
  duplicateUnbound.statements = [
    { ...duplicateUnbound.statements[0], document_id: undefined, openai_file_id: undefined },
    { ...duplicateUnbound.statements[0], document_id: undefined, openai_file_id: undefined },
  ];
  assert.throws(() => validateSummaryRow(duplicateUnbound, duplicateEvent), {
    code: "SUMMARY_DOCUMENT_BINDING_INVALID",
  });
});

test("enforces canonical decimals with status-aware missing values", () => {
  const ready = summaryRow();
  ready.statements[0].deposits = "1e3";
  assert.throws(() => validateSummaryRow(ready, readyEvent()), {
    code: "SUMMARY_STATEMENT_INVALID",
  });

  const missingReady = summaryRow();
  missingReady.statements[0].true_revenue = null;
  assert.throws(() => validateSummaryRow(missingReady, readyEvent()), {
    code: "SUMMARY_STATEMENT_INVALID",
  });

  const review = summaryRow({ status: "REVIEW_REQUIRED" });
  review.statements[0].deposits = null;
  review.statements[0].true_revenue = null;
  assert.doesNotThrow(() =>
    validateSummaryRow(review, readyEvent("REVIEW_REQUIRED")),
  );
  review.statements[0].deposits = "01.00";
  assert.throws(
    () => validateSummaryRow(review, readyEvent("REVIEW_REQUIRED")),
    { code: "SUMMARY_STATEMENT_INVALID" },
  );
});

test("stores create-only before publishing and reuses a verified replay artifact", async () => {
  const memory = memoryDependencies();
  const processEvent = createFinalizer(memory.dependencies);
  await processEvent(readyEvent());
  await processEvent(readyEvent());
  assert.deepEqual(memory.order, ["store", "publish", "publish"]);
  assert.equal(memory.objects.size, 1);
  assert.equal(memory.published.length, 2);
  assert.deepEqual(memory.published[0], memory.published[1]);
  assert.deepEqual(Object.keys(memory.published[0]), [
    "event_type",
    "schema_version",
    "analysis_version",
    "event_key",
    "entry_id",
    "status",
    "summary_fingerprint",
    "source_generation",
    "final_generation",
    "final_pdf_sha256",
  ]);
  assert.equal(memory.published[0].status, "READY");
  assert.match(memory.published[0].final_pdf_sha256, /^[a-f0-9]{64}$/);
  assert.match([...memory.objects.keys()][0], new RegExp(`${ENTRY_ID}_underwritten_v1_a{64}\\.pdf$`));
});

test("preserves REVIEW_REQUIRED in the PDF-ready event", async () => {
  const memory = memoryDependencies({ status: "REVIEW_REQUIRED" });
  const processEvent = createFinalizer(memory.dependencies);
  await processEvent(readyEvent("REVIEW_REQUIRED"));
  assert.equal(memory.published.length, 1);
  assert.equal(memory.published[0].status, "REVIEW_REQUIRED");
});

test("a changed summary fingerprint creates a new immutable object", async () => {
  const memory = memoryDependencies();
  const processEvent = createFinalizer(memory.dependencies);
  await processEvent(readyEvent());
  memory.setRow(summaryRow({ fingerprint: "B".repeat(64) }));
  await processEvent(readyEvent());
  assert.equal(memory.objects.size, 2);
  assert.deepEqual(memory.order, ["store", "publish", "store", "publish"]);
});

test("invalid source layout and publish failures remain retryable", async () => {
  const memory = memoryDependencies();
  const invalidSource = Buffer.from("not a pdf");
  memory.setRow({
    ...summaryRow(),
    pdf_source_sha256: createHash("sha256").update(invalidSource).digest("hex"),
  });
  memory.dependencies.loadSource = async () => ({
    objectName: `synthetic_${ENTRY_ID}/source.pdf`,
    buffer: invalidSource,
    generation: "10",
  });
  await assert.rejects(createFinalizer(memory.dependencies)(readyEvent()), {
    code: "SOURCE_LAYOUT_INVALID",
  });

  const publishFailure = memoryDependencies();
  publishFailure.dependencies.publish = async () => {
    throw new Error("unavailable");
  };
  await assert.rejects(createFinalizer(publishFailure.dependencies)(readyEvent()), {
    code: "READY_PUBLISH_FAILED",
  });
  assert.equal(publishFailure.objects.size, 1);
});

test("rejects source generation or digest drift before rendering", async () => {
  const generation = memoryDependencies();
  generation.dependencies.loadSource = async () => ({
    objectName: `synthetic_${ENTRY_ID}/source.pdf`,
    buffer: sourcePdf(),
    generation: "11",
  });
  await assert.rejects(createFinalizer(generation.dependencies)(readyEvent()), {
    code: "SOURCE_GENERATION_MISMATCH",
  });

  const digest = memoryDependencies();
  const originalQuery = digest.dependencies.queryRows;
  digest.dependencies.queryRows = async (entryId) => {
    const rows = await originalQuery(entryId);
    return [{ ...rows[0], pdf_source_sha256: "b".repeat(64) }];
  };
  await assert.rejects(createFinalizer(digest.dependencies)(readyEvent()), {
    code: "SOURCE_SHA256_MISMATCH",
  });
  assert.equal(digest.objects.size, 0);
});

test("message handler ACKs invalid/legacy and NACKs retryable failures without sensitive logs", async () => {
  const calls = { ack: 0, nack: 0 };
  const logs = [];
  const logger = {
    info: (value) => logs.push(value),
    warn: (value) => logs.push(value),
    error: (value) => logs.push(value),
  };
  const message = (value) => ({
    data: Buffer.from(value),
    ack: () => {
      calls.ack += 1;
    },
    nack: () => {
      calls.nack += 1;
    },
  });
  const handler = createMessageHandler({
    processEvent: async () => {
      throw Object.assign(new Error("retry"), { code: "SUMMARY_QUERY_FAILED" });
    },
    logger,
  });
  await handler(message("{"));
  await handler(message(JSON.stringify({ event_type: "legacy" })));
  await handler(message(JSON.stringify(readyEvent())));
  assert.deepEqual(calls, { ack: 2, nack: 1 });
  assert.ok(logs.every((line) => !line.includes(ENTRY_ID) && !line.includes("gs://")));
});
