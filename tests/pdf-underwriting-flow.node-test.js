import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createApplicationPdfGate,
  createMessageHandler as createEmailMessageHandler,
  createSourcePdfLoader,
} from "../emailer/delivery-gate.js";
import { createFinalizer } from "../pdf-finalizer/finalizer.js";
import {
  renderFinalizedPdf,
  verifyFinalizedPdf,
} from "../pdf-finalizer/renderer.js";
import {
  ENTRY_ID,
  readyEvent,
  sourcePdf,
  summaryRow,
} from "../pdf-finalizer/test-fixtures.js";
import { validateDeclaredPdfLayout } from "../shared/pdf-layout-validator.js";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

test("synthetic source finalizes all three sections and replay is idempotent", async () => {
  const source = sourcePdf();
  const sourceHash = sha256(source);
  const summary = summaryRow();
  const artifacts = new Map();
  const published = [];
  const renderedMetrics = [];
  let createCount = 0;

  const finalize = createFinalizer({
    queryRows: async (entryId) => {
      assert.equal(entryId, ENTRY_ID);
      return [summary];
    },
    loadSource: async (_uri, generation) => ({
      objectName: `synthetic_${ENTRY_ID}/source.pdf`,
      buffer: source,
      generation,
    }),
    findArtifact: async (objectName) => artifacts.get(objectName) ?? null,
    createArtifact: async ({ objectName, buffer, metadata, ifGenerationMatch }) => {
      assert.equal(ifGenerationMatch, 0);
      createCount += 1;
      artifacts.set(objectName, {
        objectName,
        buffer: Buffer.from(buffer),
        metadata,
        generation: "20",
      });
      return { generation: "20" };
    },
    publish: async (event) => {
      published.push(structuredClone(event));
      return `message-${published.length}`;
    },
    validateSourcePdf: validateDeclaredPdfLayout,
    renderFinalizedPdf: async (input) => {
      const rendered = await renderFinalizedPdf(input);
      renderedMetrics.push(rendered.metrics);
      return rendered;
    },
    verifyFinalizedPdf,
  });

  assert.deepEqual(await finalize(readyEvent()), { code: "ARTIFACT_CREATED" });
  const [artifact] = artifacts.values();
  const firstArtifactHash = sha256(artifact.buffer);
  assert.equal(renderedMetrics.length, 1);
  assert.equal(renderedMetrics[0].statementRows, 1);
  assert.equal(renderedMetrics[0].mcaDepositRows, 1);
  assert.equal(renderedMetrics[0].debtRows, 1);
  assert.equal(renderedMetrics[0].clippedRows, 0);
  assert.ok(renderedMetrics[0].pageCount >= 2);
  assert.equal(await verifyFinalizedPdf(artifact.buffer, ENTRY_ID), true);
  assert.equal(sha256(source), sourceHash);

  assert.deepEqual(await finalize(readyEvent()), { code: "ARTIFACT_REUSED" });
  assert.equal(createCount, 1);
  assert.equal(artifacts.size, 1);
  assert.equal(sha256([...artifacts.values()][0].buffer), firstArtifactHash);
  assert.equal(published.length, 2);
  assert.equal(published[0].event_key, published[1].event_key);
  assert.deepEqual(published[0], published[1]);
  assert.equal(sha256(source), sourceHash);
});

test("accelerated email deadline falls back to the unchanged source without SMTP", async () => {
  const source = sourcePdf();
  const sourceHash = sha256(source);
  const start = Date.parse("2026-08-05T12:00:00.000Z");
  let now = start;
  let finalChecks = 0;
  const row = {
    entry_id: ENTRY_ID,
    submitted_at: "2026-08-05T12:00:00.000Z",
    pdf_layout_version: "underwriting-v1",
    pdf_gcs_key: `gs://app_banks/synthetic_${ENTRY_ID}/source.pdf`,
    pdf_source_generation: "10",
    pdf_source_sha256: sourceHash,
    bank_statement_gcs_keys: [
      `gs://app_banks/synthetic_${ENTRY_ID}/bank_01_synthetic.pdf`,
    ],
    app_param: null,
  };
  const loadSourcePdf = createSourcePdfLoader({
    bucketName: "app_banks",
    readObject: async () => ({
      buffer: source,
      generation: "10",
      contentType: "application/pdf",
      metadata: {},
    }),
  });
  const selectApplicationPdf = createApplicationPdfGate({
    resolveFinalArtifact: async () => {
      finalChecks += 1;
      return null;
    },
    loadSourcePdf,
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
    waitMs: 5,
    pollMs: 2,
  });
  const sentAtBoundary = [];
  let timedOut = false;
  const handleMessage = createEmailMessageHandler({
    fetchSubmission: async () => row,
    selectApplicationPdf,
    loadAttachments: async (_row, application) => ({
      attachments: [{
        filename: application.filename,
        content: application.buffer,
        contentType: application.contentType,
      }],
      truncated: false,
    }),
    composeEmail: (_row, options) => {
      timedOut = options.timedOut;
      return {
        subject: "Synthetic fallback",
        text: "Synthetic fallback",
        html: "Synthetic fallback",
        attachments: options.attachments,
      };
    },
    // This in-memory boundary proves behavior without constructing a transporter
    // or contacting an SMTP server.
    sendMail: async (email) => {
      sentAtBoundary.push(email);
      return { accepted: ["underwriting-test@example.invalid"] };
    },
    defaultRecipients: ["underwriting-test@example.invalid"],
    from: "underwriting-test@example.invalid",
    logger: { info() {}, warn() {}, error() {} },
  });
  const message = {
    id: "synthetic-message",
    data: Buffer.from(JSON.stringify({ entry_id: ENTRY_ID })),
    acked: false,
    nacked: false,
    ack() { this.acked = true; },
    nack() { this.nacked = true; },
  };

  await handleMessage(message);
  assert.equal(message.acked, true);
  assert.equal(message.nacked, false);
  assert.equal(timedOut, true);
  assert.equal(now - start, 5);
  assert.equal(finalChecks, 4);
  assert.equal(sentAtBoundary.length, 1);
  assert.equal(sentAtBoundary[0].attachments.length, 1);
  assert.equal(sha256(sentAtBoundary[0].attachments[0].content), sourceHash);
  assert.equal(sha256(source), sourceHash);
});
