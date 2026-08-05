import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  FALLBACK_NOTE,
  SUBSCRIBER_FLOW_CONTROL,
  createApplicationPdfGate,
  createExplicitAttachmentLoader,
  createFinalArtifactResolver,
  createMessageHandler,
} from "./delivery-gate.js";

const BUCKET = "app_banks";
const START = Date.parse("2026-08-05T12:00:00.000Z");
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
    submitted_at: "2026-08-05T12:00:00.000Z",
    pdf_layout_version: "underwriting-v1",
    pdf_gcs_key: "gs://app_banks/test/source.pdf",
    pdf_source_generation: "10",
    pdf_source_sha256: SOURCE_SHA,
    bank_statement_gcs_keys: ["gs://app_banks/test/bank_01_june.pdf"],
    app_param: null,
    ...overrides,
  };
}

function controlledClock(start = START) {
  let current = start;
  const sleeps = [];
  return {
    now: () => current,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      current += milliseconds;
    },
    sleeps,
  };
}

test("subscriber uses one bounded ten-minute lease owner", () => {
  assert.deepEqual(SUBSCRIBER_FLOW_CONTROL, {
    maxMessages: 5,
    allowExcessMessages: false,
    maxExtensionMinutes: 10,
  });
});

test("worker module import has no startup side effects", async () => {
  const worker = await import("./worker.js");
  assert.equal(typeof worker.startEmailer, "function");
  assert.equal(typeof worker.composeEmail, "function");
  const composed = worker.composeEmail(row(), {
    timedOut: true,
    attachments: [],
  });
  assert.match(composed.text, new RegExp(FALLBACK_NOTE));
  assert.match(composed.html, new RegExp(FALLBACK_NOTE));
});

test("zero-bank underwriting and legacy submissions send source immediately", async () => {
  for (const fixture of [
    row({ bank_statement_gcs_keys: [] }),
    row({ pdf_layout_version: null }),
  ]) {
    let finalChecks = 0;
    let sourceLoads = 0;
    const gate = createApplicationPdfGate({
      resolveFinalArtifact: async () => { finalChecks += 1; return null; },
      loadSourcePdf: async () => { sourceLoads += 1; return artifact(); },
    });
    const selected = await gate(fixture);
    assert.equal(selected.kind, "source");
    assert.equal(selected.timedOut, false);
    assert.equal(finalChecks, 0);
    assert.equal(sourceLoads, 1);
  }
});

test("finalized artifact is selected as soon as it becomes valid", async () => {
  const final = artifact("final");
  const gate = createApplicationPdfGate({
    resolveFinalArtifact: async () => final,
    loadSourcePdf: async () => assert.fail("source must not load"),
    now: () => START,
  });
  assert.deepEqual(await gate(row()), {
    artifact: final,
    kind: "finalized",
    timedOut: false,
  });
});

test("accelerated fixed seven-minute timeout uses source and records timeout", async () => {
  const clock = controlledClock();
  let checks = 0;
  const gate = createApplicationPdfGate({
    resolveFinalArtifact: async () => { checks += 1; return null; },
    loadSourcePdf: async () => artifact(),
    now: clock.now,
    sleep: clock.sleep,
  });
  const selected = await gate(row());
  assert.equal(selected.kind, "source");
  assert.equal(selected.timedOut, true);
  assert.equal(clock.sleeps.reduce((sum, value) => sum + value, 0), 420_000);
  assert.equal(checks, 43);
});

test("checks for a final artifact once more immediately before fallback", async () => {
  const clock = controlledClock();
  const final = artifact("final");
  const gate = createApplicationPdfGate({
    resolveFinalArtifact: async () => clock.now() >= START + 420_000 ? final : null,
    loadSourcePdf: async () => assert.fail("source must not load"),
    now: clock.now,
    sleep: clock.sleep,
  });
  const selected = await gate(row());
  assert.equal(selected.kind, "finalized");
  assert.equal(selected.artifact, final);
});

test("restart derives the elapsed deadline from authoritative submitted_at", async () => {
  const clock = controlledClock(START + 421_000);
  let checks = 0;
  const gate = createApplicationPdfGate({
    resolveFinalArtifact: async () => { checks += 1; return null; },
    loadSourcePdf: async () => artifact(),
    now: clock.now,
    sleep: clock.sleep,
  });
  const selected = await gate(row());
  assert.equal(selected.timedOut, true);
  assert.equal(checks, 1);
  assert.deepEqual(clock.sleeps, []);
});

test("unsupported non-null layout versions fail closed", async () => {
  const gate = createApplicationPdfGate({
    resolveFinalArtifact: async () => null,
    loadSourcePdf: async () => artifact(),
  });
  await assert.rejects(gate(row({ pdf_layout_version: "future-v2" })), {
    code: "PDF_LAYOUT_VERSION_UNSUPPORTED",
  });
});

test("final resolver verifies immutable name, generation, fingerprint, and hashes", async () => {
  const finalBuffer = pdf("final");
  const finalSha = createHash("sha256").update(finalBuffer).digest("hex");
  let requestedUri;
  const resolver = createFinalArtifactResolver({
    bucketName: BUCKET,
    fetchSummaryFingerprint: async () => FINGERPRINT.toUpperCase(),
    readObject: async (uri) => {
      requestedUri = uri;
      return {
        buffer: finalBuffer,
        generation: "20",
        contentType: "application/pdf",
        metadata: {
          artifactType: "underwriting-v1",
          entryId: "ndbf_test",
          summaryFingerprint: FINGERPRINT,
          sourceGeneration: "10",
          sourceSha256: SOURCE_SHA,
          finalSha256: finalSha,
        },
      };
    },
  });
  const result = await resolver(row());
  assert.equal(
    requestedUri,
    `gs://app_banks/test/ndbf_test_underwritten_v1_${FINGERPRINT}.pdf`,
  );
  assert.equal(result.sha256, finalSha);

  const mismatched = createFinalArtifactResolver({
    bucketName: BUCKET,
    fetchSummaryFingerprint: async () => FINGERPRINT,
    readObject: async () => ({ ...result, metadata: { ...result.metadata, finalSha256: "c".repeat(64) } }),
  });
  await assert.rejects(mismatched(row()), { code: "FINAL_ARTIFACT_MISMATCH" });
});

test("attachment loader reads only one application PDF and exact bank keys", async () => {
  const reads = [];
  const bankKeys = [
    "gs://app_banks/test/bank_01_june.pdf",
    "gs://app_banks/test/bank_02_july.pdf",
  ];
  const loader = createExplicitAttachmentLoader({
    bucketName: BUCKET,
    maxTotalBytes: 1_000_000,
    readObject: async (uri) => {
      reads.push(uri);
      return artifact(uri.includes("june") ? "june" : "july");
    },
  });
  const result = await loader(row({ bank_statement_gcs_keys: bankKeys }), artifact());
  assert.deepEqual(reads, bankKeys);
  assert.deepEqual(result.attachments.map((value) => value.filename), [
    "source.pdf",
    "june.pdf",
    "july.pdf",
  ]);
});

function fakeMessage() {
  return {
    id: "message-1",
    data: Buffer.from(JSON.stringify({ entry_id: "ndbf_test" })),
    ackCount: 0,
    nackCount: 0,
    ack() { this.ackCount += 1; },
    nack() { this.nackCount += 1; },
  };
}

test("SMTP failure nacks for redelivery and ACK occurs only after acceptance", async () => {
  let attempts = 0;
  const sent = [];
  const handler = createMessageHandler({
    fetchSubmission: async () => row(),
    selectApplicationPdf: async () => ({ artifact: artifact(), kind: "source", timedOut: true }),
    loadAttachments: async (_row, application) => ({
      attachments: [{ filename: application.filename, content: application.buffer, contentType: application.contentType }],
      truncated: false,
    }),
    composeEmail: (_row, options) => {
      assert.equal(options.timedOut, true);
      return { subject: "subject", text: FALLBACK_NOTE, html: FALLBACK_NOTE, attachments: options.attachments };
    },
    sendMail: async (email) => {
      attempts += 1;
      sent.push(email);
      if (attempts === 1) throw new Error("synthetic SMTP failure");
      return { accepted: true };
    },
    defaultRecipients: ["default@example.com"],
    from: "sender@example.com",
    logger: { info() {}, warn() {}, error() {} },
  });

  const first = fakeMessage();
  await handler(first);
  assert.equal(first.ackCount, 0);
  assert.equal(first.nackCount, 1);

  const redelivery = fakeMessage();
  await handler(redelivery);
  assert.equal(redelivery.ackCount, 1);
  assert.equal(redelivery.nackCount, 0);
  assert.equal(sent.length, 2);
});

test("fallback remains the only email even if finalization completes later", async () => {
  let sends = 0;
  const message = fakeMessage();
  const handler = createMessageHandler({
    fetchSubmission: async () => row(),
    selectApplicationPdf: async () => ({ artifact: artifact(), kind: "source", timedOut: true }),
    loadAttachments: async () => ({ attachments: [], truncated: false }),
    composeEmail: () => ({ subject: "subject", text: FALLBACK_NOTE, html: FALLBACK_NOTE, attachments: [] }),
    sendMail: async () => { sends += 1; return { accepted: true }; },
    defaultRecipients: ["default@example.com"],
    from: "sender@example.com",
    logger: { info() {}, warn() {}, error() {} },
  });
  await handler(message);
  assert.equal(message.ackCount, 1);
  assert.equal(sends, 1);
  await Promise.resolve(); // A later finalizer has no email handler to invoke.
  assert.equal(sends, 1);
});
