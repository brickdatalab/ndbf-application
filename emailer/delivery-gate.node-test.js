import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  SUBSCRIBER_FLOW_CONTROL,
  createExplicitAttachmentLoader,
  createFinalArtifactResolver,
  createMessageHandler,
  parseApplicationPdfReadyEvent,
  shouldDeferSubmissionEmail,
} from "./delivery-gate.js";

const BUCKET = "app_banks";
const FINGERPRINT = "a".repeat(64);
const SOURCE_SHA = "b".repeat(64);

function pdf(label = "fixture") {
  return Buffer.from(`%PDF-1.7\n${label}`);
}

function artifact(label = "source", overrides = {}) {
  return {
    buffer: pdf(label),
    generation: "10",
    contentType: "application/pdf",
    metadata: {},
    filename: `${label}.pdf`,
    ...overrides,
  };
}

function row(overrides = {}) {
  return {
    entry_id: "ndbf_test",
    pdf_layout_version: "underwriting-v1",
    pdf_gcs_key: "gs://app_banks/test/source.pdf",
    pdf_source_generation: "10",
    pdf_source_sha256: SOURCE_SHA,
    bank_statement_gcs_keys: ["gs://app_banks/test/bank_01_june.pdf"],
    app_param: null,
    ...overrides,
  };
}

function readyEvent(overrides = {}) {
  const finalBuffer = pdf("final");
  return {
    event_type: "application_pdf_ready",
    schema_version: 1,
    analysis_version: 1,
    event_key: `application_pdf:ndbf_test:v1:${FINGERPRINT}`,
    entry_id: "ndbf_test",
    status: "READY",
    summary_fingerprint: FINGERPRINT,
    source_generation: "10",
    final_generation: "20",
    final_pdf_sha256: createHash("sha256").update(finalBuffer).digest("hex"),
    ...overrides,
  };
}

function message(payload) {
  return {
    id: "message-1",
    data: Buffer.from(JSON.stringify(payload)),
    ackCount: 0,
    nackCount: 0,
    ack() { this.ackCount += 1; },
    nack() { this.nackCount += 1; },
  };
}

function handler(overrides = {}) {
  return createMessageHandler({
    fetchSubmission: async () => row(),
    loadSourcePdf: async () => artifact(),
    resolveFinalArtifact: async () => artifact("final", { generation: "20" }),
    loadAttachments: async (_row, application) => ({
      attachments: [{ filename: application.filename, content: application.buffer, contentType: application.contentType }],
      truncated: false,
    }),
    composeEmail: (_row, options) => ({
      subject: "subject",
      text: "text",
      html: "html",
      attachments: options.attachments,
    }),
    sendMail: async () => ({ accepted: true }),
    defaultRecipients: ["default@example.com"],
    from: "sender@example.com",
    logger: { info() {}, warn() {}, error() {} },
    ...overrides,
  });
}

test("uses bounded flow control and imports worker without starting it", async () => {
  assert.deepEqual(SUBSCRIBER_FLOW_CONTROL, {
    maxMessages: 5,
    allowExcessMessages: false,
    maxExtensionMinutes: 10,
  });
  const worker = await import("./worker.js");
  assert.equal(typeof worker.startEmailer, "function");
});

test("defers only new versioned submissions that contain bank statements", () => {
  assert.equal(shouldDeferSubmissionEmail(row()), true);
  assert.equal(shouldDeferSubmissionEmail(row({ bank_statement_gcs_keys: [] })), false);
  assert.equal(shouldDeferSubmissionEmail(row({ pdf_layout_version: null })), false);
  assert.throws(() => shouldDeferSubmissionEmail(row({ pdf_layout_version: "future-v2" })), {
    code: "PDF_LAYOUT_VERSION_UNSUPPORTED",
  });
});

test("strictly validates the PDF-ready event", () => {
  assert.equal(parseApplicationPdfReadyEvent(readyEvent()).entry_id, "ndbf_test");
  assert.throws(() => parseApplicationPdfReadyEvent({ ...readyEvent(), extra: true }), {
    code: "READY_EVENT_INVALID",
  });
});

test("final resolver uses the event descriptor and verifies immutable artifact metadata", async () => {
  const event = readyEvent();
  const finalBuffer = pdf("final");
  let requested;
  const resolver = createFinalArtifactResolver({
    bucketName: BUCKET,
    readObject: async (uri, options) => {
      requested = { uri, options };
      return {
        buffer: finalBuffer,
        generation: "20",
        contentType: "application/pdf",
        metadata: {
          artifactType: "underwritten-v1",
          entryId: "ndbf_test",
          summaryFingerprint: FINGERPRINT,
          sourceGeneration: "10",
          sourceSha256: SOURCE_SHA,
          finalSha256: event.final_pdf_sha256,
        },
      };
    },
  });
  const resolved = await resolver(row(), event);
  assert.equal(requested.uri, `gs://app_banks/test/ndbf_test_underwritten_v1_${FINGERPRINT}.pdf`);
  assert.deepEqual(requested.options, { expectedGeneration: "20" });
  assert.equal(resolved.sha256, event.final_pdf_sha256);
});

test("submission event defers without loading a PDF or contacting SMTP", async () => {
  const deferred = message({ entry_id: "ndbf_test" });
  await handler({
    loadSourcePdf: async () => assert.fail("source must not load"),
    resolveFinalArtifact: async () => assert.fail("final must not load"),
    sendMail: async () => assert.fail("SMTP must not run"),
  })(deferred);
  assert.equal(deferred.ackCount, 1);
  assert.equal(deferred.nackCount, 0);
});

test("PDF-ready event sends the finalized PDF and ACKs only after SMTP", async () => {
  const order = [];
  const ready = message(readyEvent());
  await handler({
    resolveFinalArtifact: async (_row, event) => {
      order.push(`resolve:${event.final_generation}`);
      return artifact("final", { generation: "20" });
    },
    sendMail: async () => { order.push("smtp"); },
  })(ready);
  assert.deepEqual(order, ["resolve:20", "smtp"]);
  assert.equal(ready.ackCount, 1);
  assert.equal(ready.nackCount, 0);

  const failed = message(readyEvent());
  await handler({ sendMail: async () => { throw new Error("synthetic"); } })(failed);
  assert.equal(failed.ackCount, 0);
  assert.equal(failed.nackCount, 1);
});

test("legacy and zero-bank submissions still send the source PDF immediately", async () => {
  for (const sourceRow of [
    row({ pdf_layout_version: null }),
    row({ bank_statement_gcs_keys: [] }),
  ]) {
    let sent = 0;
    const current = message({ entry_id: "ndbf_test" });
    await handler({
      fetchSubmission: async () => sourceRow,
      sendMail: async () => { sent += 1; },
    })(current);
    assert.equal(sent, 1);
    assert.equal(current.ackCount, 1);
  }
});

test("attachment loader reads only the declared bank-statement keys", async () => {
  const reads = [];
  const loader = createExplicitAttachmentLoader({
    bucketName: BUCKET,
    maxTotalBytes: 1_000_000,
    readObject: async (uri) => { reads.push(uri); return artifact("bank"); },
  });
  const result = await loader(row(), artifact());
  assert.deepEqual(reads, ["gs://app_banks/test/bank_01_june.pdf"]);
  assert.equal(result.attachments.length, 2);
});
