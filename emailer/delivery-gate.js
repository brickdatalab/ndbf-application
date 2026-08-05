import { createHash } from "node:crypto";
import { posix as path } from "node:path";

import { resolveRecipients } from "./recipient-routing.js";

export const PDF_LAYOUT_VERSION = "underwriting-v1";
export const FINALIZATION_WAIT_MS = 420_000;
export const FINALIZATION_POLL_MS = 10_000;
export const SUBSCRIBER_FLOW_CONTROL = Object.freeze({
  maxMessages: 5,
  allowExcessMessages: false,
  maxExtensionMinutes: 10,
});
export const FALLBACK_NOTE =
  "Internal note: underwriting finalization did not complete within seven minutes; the signed source PDF is attached.";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GENERATION_PATTERN = /^[0-9]+$/;
const ENTRY_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const FINAL_ARTIFACT_TYPE = "underwritten-v1";

export class EmailerError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = "EmailerError";
    this.code = code;
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function requirePdfObject(object, code) {
  if (
    !object ||
    !Buffer.isBuffer(object.buffer) ||
    object.contentType !== "application/pdf" ||
    !object.buffer.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
    !GENERATION_PATTERN.test(String(object.generation ?? ""))
  ) {
    throw new EmailerError(code);
  }
  return object;
}

function bqTimestampMs(value) {
  const raw = value && typeof value === "object" && "value" in value
    ? value.value
    : value;
  const timestamp = Date.parse(String(raw ?? ""));
  if (!Number.isFinite(timestamp)) {
    throw new EmailerError("SUBMITTED_AT_INVALID");
  }
  return timestamp;
}

export function parseGsUri(uri, expectedBucket) {
  const match = String(uri ?? "").match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match || match[1] !== expectedBucket || !match[2]) {
    throw new EmailerError("GCS_URI_INVALID");
  }
  return { bucketName: match[1], objectName: match[2] };
}

export function finalizedPdfUri(row, fingerprint, bucketName) {
  const normalizedFingerprint = String(fingerprint ?? "").toLowerCase();
  if (
    !SHA256_PATTERN.test(normalizedFingerprint) ||
    !ENTRY_ID_PATTERN.test(String(row.entry_id ?? ""))
  ) {
    throw new EmailerError("FINAL_DESCRIPTOR_INVALID");
  }
  const { objectName } = parseGsUri(row.pdf_gcs_key, bucketName);
  const folder = path.dirname(objectName);
  if (folder === "." || folder === "/") {
    throw new EmailerError("SOURCE_OBJECT_INVALID");
  }
  return `gs://${bucketName}/${path.join(
    folder,
    `${row.entry_id}_underwritten_v1_${normalizedFingerprint}.pdf`,
  )}`;
}

export function createFinalArtifactResolver({
  bucketName,
  fetchSummaryFingerprint,
  readObject,
}) {
  return async function resolveFinalArtifact(row) {
    const fingerprintValue = await fetchSummaryFingerprint(row.entry_id);
    if (fingerprintValue === null || fingerprintValue === undefined) return null;

    const fingerprint = String(fingerprintValue).toLowerCase();
    const sourceGeneration = String(row.pdf_source_generation ?? "");
    const sourceSha256 = String(row.pdf_source_sha256 ?? "").toLowerCase();
    if (
      !SHA256_PATTERN.test(fingerprint) ||
      !GENERATION_PATTERN.test(sourceGeneration) ||
      !SHA256_PATTERN.test(sourceSha256)
    ) {
      throw new EmailerError("FINAL_DESCRIPTOR_INVALID");
    }

    const uri = finalizedPdfUri(row, fingerprint, bucketName);
    const object = await readObject(uri, { allowNotFound: true });
    if (!object) return null;
    requirePdfObject(object, "FINAL_ARTIFACT_INVALID");

    const actualSha256 = sha256(object.buffer);
    const metadata = object.metadata ?? {};
    if (
      metadata.artifactType !== FINAL_ARTIFACT_TYPE ||
      metadata.entryId !== row.entry_id ||
      String(metadata.summaryFingerprint ?? "").toLowerCase() !== fingerprint ||
      metadata.sourceGeneration !== sourceGeneration ||
      String(metadata.sourceSha256 ?? "").toLowerCase() !== sourceSha256 ||
      String(metadata.finalSha256 ?? "").toLowerCase() !== actualSha256
    ) {
      throw new EmailerError("FINAL_ARTIFACT_MISMATCH");
    }

    return {
      ...object,
      uri,
      filename: path.basename(parseGsUri(uri, bucketName).objectName),
      sha256: actualSha256,
    };
  };
}

export function createSourcePdfLoader({ bucketName, readObject }) {
  return async function loadSourcePdf(row) {
    parseGsUri(row.pdf_gcs_key, bucketName);
    const versioned = row.pdf_layout_version === PDF_LAYOUT_VERSION;
    const expectedGeneration = versioned
      ? String(row.pdf_source_generation ?? "")
      : undefined;
    if (versioned && !GENERATION_PATTERN.test(expectedGeneration)) {
      throw new EmailerError("SOURCE_GENERATION_INVALID");
    }
    const object = requirePdfObject(
      await readObject(row.pdf_gcs_key, { expectedGeneration }),
      "SOURCE_PDF_INVALID",
    );
    const actualSha256 = sha256(object.buffer);
    if (
      versioned &&
      (String(object.generation) !== expectedGeneration ||
        !SHA256_PATTERN.test(String(row.pdf_source_sha256 ?? "").toLowerCase()) ||
        actualSha256 !== String(row.pdf_source_sha256).toLowerCase())
    ) {
      throw new EmailerError("SOURCE_INTEGRITY_MISMATCH");
    }
    return {
      ...object,
      uri: row.pdf_gcs_key,
      filename: path.basename(parseGsUri(row.pdf_gcs_key, bucketName).objectName),
      sha256: actualSha256,
    };
  };
}

export function createApplicationPdfGate({
  resolveFinalArtifact,
  loadSourcePdf,
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  waitMs = FINALIZATION_WAIT_MS,
  pollMs = FINALIZATION_POLL_MS,
}) {
  if (!(waitMs >= 0) || !(pollMs > 0)) {
    throw new EmailerError("GATE_CONFIGURATION_INVALID");
  }
  return async function selectApplicationPdf(row) {
    const version = row.pdf_layout_version;
    if (version !== null && version !== undefined && version !== PDF_LAYOUT_VERSION) {
      throw new EmailerError("PDF_LAYOUT_VERSION_UNSUPPORTED");
    }
    const bankKeys = row.bank_statement_gcs_keys ?? [];
    if (!Array.isArray(bankKeys)) {
      throw new EmailerError("BANK_KEYS_INVALID");
    }
    if (version == null || bankKeys.length === 0) {
      return { artifact: await loadSourcePdf(row), kind: "source", timedOut: false };
    }

    const deadline = bqTimestampMs(row.submitted_at) + waitMs;
    while (now() < deadline) {
      const artifact = await resolveFinalArtifact(row);
      if (artifact) return { artifact, kind: "finalized", timedOut: false };
      await sleep(Math.min(pollMs, Math.max(0, deadline - now())));
    }

    // This check is intentionally separate from the loop. It closes the race
    // where finalization finishes as the fixed submission-relative deadline lands.
    const finalArtifact = await resolveFinalArtifact(row);
    if (finalArtifact) {
      return { artifact: finalArtifact, kind: "finalized", timedOut: false };
    }
    return { artifact: await loadSourcePdf(row), kind: "source", timedOut: true };
  };
}

export function createExplicitAttachmentLoader({
  bucketName,
  readObject,
  maxTotalBytes,
}) {
  return async function loadAttachments(row, applicationArtifact) {
    requirePdfObject(applicationArtifact, "APPLICATION_PDF_INVALID");
    const bankKeys = row.bank_statement_gcs_keys ?? [];
    if (!Array.isArray(bankKeys) || new Set(bankKeys).size !== bankKeys.length) {
      throw new EmailerError("BANK_KEYS_INVALID");
    }

    const attachments = [{
      filename: applicationArtifact.filename,
      content: applicationArtifact.buffer,
      contentType: applicationArtifact.contentType,
    }];
    let totalBytes = applicationArtifact.buffer.length;
    if (totalBytes > maxTotalBytes) {
      throw new EmailerError("APPLICATION_PDF_TOO_LARGE");
    }
    let truncated = false;

    for (const uri of bankKeys) {
      const { objectName } = parseGsUri(uri, bucketName);
      const object = requirePdfObject(
        await readObject(uri, {}),
        "BANK_STATEMENT_INVALID",
      );
      if (totalBytes + object.buffer.length > maxTotalBytes) {
        truncated = true;
        continue;
      }
      attachments.push({
        filename: path.basename(objectName).replace(/^bank_\d+_/, ""),
        content: object.buffer,
        contentType: object.contentType,
      });
      totalBytes += object.buffer.length;
    }
    return { attachments, truncated };
  };
}

function safeErrorCode(error) {
  return error instanceof EmailerError ? error.code : "UNEXPECTED_FAILURE";
}

export function createMessageHandler({
  fetchSubmission,
  selectApplicationPdf,
  loadAttachments,
  composeEmail,
  sendMail,
  defaultRecipients,
  from,
  logger = console,
}) {
  return async function handleMessage(message) {
    const messageId = String(message.id ?? "unknown");
    let payload;
    try {
      payload = JSON.parse(message.data.toString());
    } catch {
      logger.warn("[emailer] dropped=PAYLOAD_JSON_INVALID");
      message.ack();
      return;
    }
    const entryId = payload?.entry_id;
    if (typeof entryId !== "string" || !ENTRY_ID_PATTERN.test(entryId)) {
      logger.warn("[emailer] dropped=ENTRY_ID_INVALID");
      message.ack();
      return;
    }

    try {
      const row = await fetchSubmission(entryId);
      if (!row) throw new EmailerError("SUBMISSION_NOT_VISIBLE");
      const selected = await selectApplicationPdf(row);
      const attachmentResult = await loadAttachments(row, selected.artifact);
      const email = composeEmail(row, {
        timedOut: selected.timedOut,
        truncated: attachmentResult.truncated,
        attachments: attachmentResult.attachments,
      });
      const { appKey, extras, recipients } = resolveRecipients(
        defaultRecipients,
        row.app_param,
      );
      if (extras.length) {
        logger.info(
          `[emailer] msg=${messageId} app_param=${appKey} extra_recipient_count=${extras.length}`,
        );
      }
      await sendMail({
        from,
        to: recipients,
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: email.attachments,
      });
      message.ack();
      logger.info(
        `[emailer] msg=${messageId} entry=${entryId} smtp=accepted pdf=${selected.kind} attachments=${email.attachments.length}`,
      );
    } catch (error) {
      message.nack();
      logger.error(
        `[emailer] msg=${messageId} entry=${entryId} error=${safeErrorCode(error)}`,
      );
    }
  };
}
