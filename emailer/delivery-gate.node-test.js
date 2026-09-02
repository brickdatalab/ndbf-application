import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  SUBSCRIBER_FLOW_CONTROL,
  buildSubmissionWebhookPayload,
  createExplicitAttachmentLoader,
  createFinalArtifactResolver,
  createMessageHandler,
  createSubmissionWebhookNotifier,
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
  assert.equal(shouldDeferSubmissionEmail(row()), false);
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

test("versioned submission with bank statements sends the source PDF immediately", async () => {
  // Notification delivery must never wait on the AI underwriting pipeline.
  const order = [];
  const current = message({ entry_id: "ndbf_test" });
  await handler({
    loadSourcePdf: async () => { order.push("source"); return artifact("source"); },
    resolveFinalArtifact: async () => assert.fail("final artifact must not be required"),
    sendMail: async () => { order.push("smtp"); },
  })(current);
  assert.deepEqual(order, ["source", "smtp"]);
  assert.equal(current.ackCount, 1);
  assert.equal(current.nackCount, 0);
});

test("submission email NACKs when SMTP fails so Pub/Sub redelivers", async () => {
  const failed = message({ entry_id: "ndbf_test" });
  await handler({ sendMail: async () => { throw new Error("synthetic"); } })(failed);
  assert.equal(failed.ackCount, 0);
  assert.equal(failed.nackCount, 1);
});

test("PDF-ready event is acknowledged without sending a duplicate email", async () => {
  // The alert already went out at submit time. The finalized underwriting PDF is
  // persisted in GCS as an enrichment and must not produce a second email.
  const ready = message(readyEvent());
  await handler({
    resolveFinalArtifact: async () => assert.fail("final artifact must not be loaded"),
    sendMail: async () => assert.fail("SMTP must not run for a finalized event"),
  })(ready);
  assert.equal(ready.ackCount, 1);
  assert.equal(ready.nackCount, 0);
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

// ---------- Submission webhook ----------

function bqRow() {
  // Shapes the @google-cloud/bigquery client actually returns: TIMESTAMP/DATE
  // wrappers with a single `value`, NUMERIC as a Big-like object, INTEGER as
  // number, REPEATED as array, raw_payload_json as a JSON string.
  return row({
    submitted_at: { value: "2026-09-01T18:15:38.000Z" },
    owner_dob: { value: "1980-01-02" },
    requested_funding_amount: { toNumber: () => 50000, toString: () => "50000" },
    business_started_year: 2015,
    terms_accepted: true,
    industry_other: null,
    extraction_provider_locked_at: null,
    bank_statement_gcs_keys: ["gs://app_banks/test/bank_01_june.pdf", "gs://app_banks/test/bank_02_july.pdf"],
    raw_payload_json: JSON.stringify({ appParam: "nicole", formData: { contactName: "Test", bankStatements: [{ name: "june.pdf" }, { name: "july.pdf" }] } }),
  });
}

test("webhook payload mirrors the BigQuery row with plain JSON values and the raw payload expanded", () => {
  const payload = buildSubmissionWebhookPayload(bqRow());
  assert.equal(payload.entry_id, "ndbf_test");
  assert.equal(payload.submitted_at, "2026-09-01T18:15:38.000Z");
  assert.equal(payload.owner_dob, "1980-01-02");
  assert.equal(payload.requested_funding_amount, 50000);
  assert.equal(payload.business_started_year, 2015);
  assert.equal(payload.terms_accepted, true);
  assert.equal(payload.industry_other, null);
  assert.equal(payload.extraction_provider_locked_at, null);
  assert.deepEqual(payload.bank_statement_gcs_keys, [
    "gs://app_banks/test/bank_01_june.pdf",
    "gs://app_banks/test/bank_02_july.pdf",
  ]);
  assert.equal(payload.raw_payload_json.appParam, "nicole");
  assert.equal(payload.raw_payload_json.formData.bankStatements.length, 2);
  assert.equal(JSON.parse(JSON.stringify(payload)).requested_funding_amount, 50000);
});

test("webhook payload keeps raw_payload_json as a string when it is not valid JSON", () => {
  const payload = buildSubmissionWebhookPayload(row({ raw_payload_json: "{not json" }));
  assert.equal(payload.raw_payload_json, "{not json");
});

test("webhook fires once, after the email is accepted and the message is acked", async () => {
  const sequence = [];
  const calls = [];
  const msg = message({ entry_id: "ndbf_test" });
  const originalAck = msg.ack.bind(msg);
  msg.ack = () => { sequence.push("ack"); originalAck(); };
  const handle = handler({
    fetchSubmission: async () => bqRow(),
    sendMail: async () => { sequence.push("smtp"); return { accepted: true }; },
    notifyWebhook: async (row) => { sequence.push("webhook"); calls.push(row); return { delivered: true, status: 200, attempts: 1 }; },
  });
  await handle(msg);
  assert.deepEqual(sequence, ["smtp", "ack", "webhook"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].entry_id, "ndbf_test");
  assert.equal(msg.ackCount, 1);
  assert.equal(msg.nackCount, 0);
});

test("webhook failure never NACKs or re-sends the email", async () => {
  let sends = 0;
  const errors = [];
  const msg = message({ entry_id: "ndbf_test" });
  const handle = handler({
    sendMail: async () => { sends += 1; return { accepted: true }; },
    notifyWebhook: async () => { throw new Error("boom"); },
    logger: { info() {}, warn() {}, error(line) { errors.push(line); } },
  });
  await handle(msg);
  assert.equal(sends, 1);
  assert.equal(msg.ackCount, 1);
  assert.equal(msg.nackCount, 0);
  assert.ok(errors.some((line) => line.includes("webhook=failed")));
});

test("webhook does not fire when SMTP fails", async () => {
  let webhookCalls = 0;
  const msg = message({ entry_id: "ndbf_test" });
  const handle = handler({
    sendMail: async () => { throw new Error("smtp down"); },
    notifyWebhook: async () => { webhookCalls += 1; },
  });
  await handle(msg);
  assert.equal(webhookCalls, 0);
  assert.equal(msg.nackCount, 1);
});

test("webhook does not fire for the PDF-ready event", async () => {
  let webhookCalls = 0;
  const msg = message(readyEvent());
  const handle = handler({ notifyWebhook: async () => { webhookCalls += 1; } });
  await handle(msg);
  assert.equal(webhookCalls, 0);
  assert.equal(msg.ackCount, 1);
});

test("handler without a webhook configured behaves exactly as before", async () => {
  const msg = message({ entry_id: "ndbf_test" });
  await handler({ notifyWebhook: null })(msg);
  assert.equal(msg.ackCount, 1);
  assert.equal(msg.nackCount, 0);
});

function notifier(responses, overrides = {}) {
  const requests = [];
  const queue = [...responses];
  const notify = createSubmissionWebhookNotifier({
    url: "https://example.test/webhook",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return { ok: next >= 200 && next < 300, status: next };
    },
    sleep: async () => {},
    logger: { info() {}, warn() {}, error() {} },
    ...overrides,
  });
  return { notify, requests };
}

test("notifier POSTs the JSON payload and reports delivery", async () => {
  const { notify, requests } = notifier([200]);
  const result = await notify(bqRow());
  assert.deepEqual(result, { delivered: true, status: 200, attempts: 1 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://example.test/webhook");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers["content-type"], "application/json");
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.entry_id, "ndbf_test");
  assert.equal(body.raw_payload_json.appParam, "nicole");
});

test("notifier retries on 5xx and network errors, then gives up without throwing", async () => {
  const retried = notifier([503, new Error("ECONNRESET"), 200]);
  assert.deepEqual(await retried.notify(bqRow()), { delivered: true, status: 200, attempts: 3 });
  const exhausted = notifier([500, 500, 500]);
  assert.deepEqual(await exhausted.notify(bqRow()), { delivered: false, status: 500, attempts: 3 });
  const network = notifier([new Error("a"), new Error("b"), new Error("c")]);
  assert.deepEqual(await network.notify(bqRow()), { delivered: false, status: "network_error", attempts: 3 });
});

test("notifier does not retry a 4xx rejection", async () => {
  const { notify, requests } = notifier([404, 200]);
  assert.deepEqual(await notify(bqRow()), { delivered: false, status: 404, attempts: 1 });
  assert.equal(requests.length, 1);
});

test("notifier is disabled when the URL is empty", () => {
  assert.equal(createSubmissionWebhookNotifier({ url: "" }), null);
});
