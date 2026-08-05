import assert from "node:assert/strict";
import test from "node:test";
import { createFinalizer, createMessageHandler } from "./finalizer.js";
import { parseUnderwritingReadyEvent } from "./contracts.js";
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

test("queries the joined read model once with an entry_id parameter", async () => {
  let queryOptions;
  const adapters = createProductionAdapters({
    bigquery: {
      query: async (options) => {
        queryOptions = options;
        return [[{ entry_id: ENTRY_ID }]];
      },
    },
    storage: { bucket: () => ({}) },
    pubsub: { topic: () => ({}) },
  });
  const rows = await adapters.queryRows(ENTRY_ID);
  assert.equal(rows.length, 1);
  assert.equal(queryOptions.params.entry_id, ENTRY_ID);
  assert.equal(queryOptions.types.entry_id, "STRING");
  assert.match(queryOptions.query, /@entry_id/);
  assert.doesNotMatch(queryOptions.query, new RegExp(ENTRY_ID));
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
  memory.dependencies.loadSource = async () => ({
    objectName: `synthetic_${ENTRY_ID}/source.pdf`,
    buffer: Buffer.from("not a pdf"),
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
