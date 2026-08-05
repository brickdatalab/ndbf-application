import { createHash, timingSafeEqual } from "node:crypto";
import { posix as path } from "node:path";

import { resolveRecipients } from "./recipient-routing.js";

export const PDF_LAYOUT_VERSION = "underwriting-v1";
export const SUBSCRIBER_FLOW_CONTROL = Object.freeze({
  maxMessages: 5,
  allowExcessMessages: false,
  maxExtensionMinutes: 10,
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GENERATION_PATTERN = /^[0-9]+$/;
const ENTRY_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const FINAL_ARTIFACT_TYPE = "underwritten-v1";
const READY_EVENT_KEYS = new Set([
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

function equalText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
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

export function parseGsUri(uri, expectedBucket) {
  const match = String(uri ?? "").match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match || match[1] !== expectedBucket || !match[2]) {
    throw new EmailerError("GCS_URI_INVALID");
  }
  return { bucketName: match[1], objectName: match[2] };
}

export function parseApplicationPdfReadyEvent(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new EmailerError("READY_EVENT_INVALID");
  }
  const fingerprint = String(payload.summary_fingerprint ?? "").toLowerCase();
  const finalSha256 = String(payload.final_pdf_sha256 ?? "").toLowerCase();
  if (
    Object.keys(payload).length !== READY_EVENT_KEYS.size ||
    Object.keys(payload).some((key) => !READY_EVENT_KEYS.has(key)) ||
    payload.event_type !== "application_pdf_ready" ||
    payload.schema_version !== 1 ||
    payload.analysis_version !== 1 ||
    !ENTRY_ID_PATTERN.test(String(payload.entry_id ?? "")) ||
    payload.event_key !== `application_pdf:${payload.entry_id}:v1:${fingerprint}` ||
    !new Set(["READY", "REVIEW_REQUIRED"]).has(payload.status) ||
    !SHA256_PATTERN.test(fingerprint) ||
    !GENERATION_PATTERN.test(String(payload.source_generation ?? "")) ||
    !GENERATION_PATTERN.test(String(payload.final_generation ?? "")) ||
    !SHA256_PATTERN.test(finalSha256)
  ) {
    throw new EmailerError("READY_EVENT_INVALID");
  }
  return {
    ...payload,
    summary_fingerprint: fingerprint,
    source_generation: String(payload.source_generation),
    final_generation: String(payload.final_generation),
    final_pdf_sha256: finalSha256,
  };
}

export function finalizedPdfUri(row, fingerprint, bucketName) {
  const normalizedFingerprint = String(fingerprint ?? "").toLowerCase();
  if (!SHA256_PATTERN.test(normalizedFingerprint) || !ENTRY_ID_PATTERN.test(String(row.entry_id ?? ""))) {
    throw new EmailerError("FINAL_DESCRIPTOR_INVALID");
  }
  const { objectName } = parseGsUri(row.pdf_gcs_key, bucketName);
  const folder = path.dirname(objectName);
  if (folder === "." || folder === "/") throw new EmailerError("SOURCE_OBJECT_INVALID");
  return `gs://${bucketName}/${path.join(folder, `${row.entry_id}_underwritten_v1_${normalizedFingerprint}.pdf`)}`;
}

export function shouldDeferSubmissionEmail(row) {
  const version = row.pdf_layout_version;
  if (version !== null && version !== undefined && version !== PDF_LAYOUT_VERSION) {
    throw new EmailerError("PDF_LAYOUT_VERSION_UNSUPPORTED");
  }
  const bankKeys = row.bank_statement_gcs_keys ?? [];
  if (!Array.isArray(bankKeys)) throw new EmailerError("BANK_KEYS_INVALID");
  return version === PDF_LAYOUT_VERSION && bankKeys.length > 0;
}

export function createFinalArtifactResolver({ bucketName, readObject }) {
  return async function resolveFinalArtifact(row, readyEvent) {
    const event = parseApplicationPdfReadyEvent(readyEvent);
    const sourceGeneration = String(row.pdf_source_generation ?? "");
    const sourceSha256 = String(row.pdf_source_sha256 ?? "").toLowerCase();
    if (
      event.entry_id !== row.entry_id ||
      row.pdf_layout_version !== PDF_LAYOUT_VERSION ||
      !equalText(event.source_generation, sourceGeneration) ||
      !SHA256_PATTERN.test(sourceSha256)
    ) {
      throw new EmailerError("FINAL_DESCRIPTOR_INVALID");
    }

    const uri = finalizedPdfUri(row, event.summary_fingerprint, bucketName);
    const object = requirePdfObject(
      await readObject(uri, { expectedGeneration: event.final_generation }),
      "FINAL_ARTIFACT_INVALID",
    );
    const actualSha256 = sha256(object.buffer);
    const metadata = object.metadata ?? {};
    if (
      !equalText(String(object.generation), event.final_generation) ||
      metadata.artifactType !== FINAL_ARTIFACT_TYPE ||
      metadata.entryId !== row.entry_id ||
      String(metadata.summaryFingerprint ?? "").toLowerCase() !== event.summary_fingerprint ||
      !equalText(String(metadata.sourceGeneration ?? ""), sourceGeneration) ||
      String(metadata.sourceSha256 ?? "").toLowerCase() !== sourceSha256 ||
      String(metadata.finalSha256 ?? "").toLowerCase() !== actualSha256 ||
      actualSha256 !== event.final_pdf_sha256
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
    const expectedGeneration = versioned ? String(row.pdf_source_generation ?? "") : undefined;
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

export function createExplicitAttachmentLoader({ bucketName, readObject, maxTotalBytes }) {
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
    if (totalBytes > maxTotalBytes) throw new EmailerError("APPLICATION_PDF_TOO_LARGE");
    let truncated = false;
    for (const uri of bankKeys) {
      const { objectName } = parseGsUri(uri, bucketName);
      const object = requirePdfObject(await readObject(uri, {}), "BANK_STATEMENT_INVALID");
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
  loadSourcePdf,
  resolveFinalArtifact,
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
    const isReadyEvent = payload?.event_type === "application_pdf_ready";
    if (payload?.event_type && !isReadyEvent) {
      logger.warn("[emailer] dropped=EVENT_TYPE_IRRELEVANT");
      message.ack();
      return;
    }
    let readyEvent = null;
    try {
      if (isReadyEvent) readyEvent = parseApplicationPdfReadyEvent(payload);
    } catch {
      logger.warn("[emailer] dropped=READY_EVENT_INVALID");
      message.ack();
      return;
    }
    const entryId = readyEvent?.entry_id ?? payload?.entry_id;
    if (typeof entryId !== "string" || !ENTRY_ID_PATTERN.test(entryId)) {
      logger.warn("[emailer] dropped=ENTRY_ID_INVALID");
      message.ack();
      return;
    }

    try {
      const row = await fetchSubmission(entryId);
      if (!row) throw new EmailerError("SUBMISSION_NOT_VISIBLE");
      if (!readyEvent && shouldDeferSubmissionEmail(row)) {
        message.ack();
        logger.info(`[emailer] msg=${messageId} entry=${entryId} delivery=deferred`);
        return;
      }
      if (readyEvent && !shouldDeferSubmissionEmail(row)) {
        throw new EmailerError("READY_EVENT_SUBMISSION_MISMATCH");
      }
      const applicationArtifact = readyEvent
        ? await resolveFinalArtifact(row, readyEvent)
        : await loadSourcePdf(row);
      const kind = readyEvent ? "finalized" : "source";
      const attachmentResult = await loadAttachments(row, applicationArtifact);
      const email = composeEmail(row, {
        truncated: attachmentResult.truncated,
        attachments: attachmentResult.attachments,
      });
      const { appKey, extras, recipients } = resolveRecipients(defaultRecipients, row.app_param);
      if (extras.length) {
        logger.info(`[emailer] msg=${messageId} app_param=${appKey} extra_recipient_count=${extras.length}`);
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
      logger.info(`[emailer] msg=${messageId} entry=${entryId} smtp=accepted pdf=${kind} attachments=${email.attachments.length}`);
    } catch (error) {
      message.nack();
      logger.error(`[emailer] msg=${messageId} entry=${entryId} error=${safeErrorCode(error)}`);
    }
  };
}
