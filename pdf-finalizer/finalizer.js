import { createHash } from "node:crypto";
import { posix as path } from "node:path";
import {
  NonRetryableFinalizerError,
  RetryableFinalizerError,
  isSha256,
  parseUnderwritingReadyEvent,
  validateSummaryRow,
} from "./contracts.js";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function requireGeneration(value, code) {
  const generation = String(value ?? "");
  if (!/^[0-9]+$/.test(generation)) {
    throw new RetryableFinalizerError(code);
  }
  return generation;
}

function finalObjectName(sourceObjectName, entryId, fingerprint) {
  const folder = path.dirname(sourceObjectName);
  if (!sourceObjectName || folder === "." || folder === "/") {
    throw new RetryableFinalizerError("SOURCE_OBJECT_INVALID");
  }
  return path.join(
    folder,
    `${entryId}_underwritten_v1_${fingerprint}.pdf`,
  );
}

function artifactMetadata({ entryId, fingerprint, sourceGeneration, sourceSha256, finalSha256 }) {
  return {
    artifactType: "underwritten-v1",
    entryId,
    summaryFingerprint: fingerprint,
    sourceGeneration,
    sourceSha256,
    finalSha256,
  };
}

async function verifyArtifact(artifact, expected, verifyFinalizedPdf) {
  if (!artifact || !Buffer.isBuffer(artifact.buffer)) {
    throw new RetryableFinalizerError("FINAL_ARTIFACT_INVALID");
  }
  const generation = requireGeneration(
    artifact.generation,
    "FINAL_GENERATION_INVALID",
  );
  const actualSha256 = sha256(artifact.buffer);
  const metadata = artifact.metadata ?? {};
  if (
    metadata.artifactType !== "underwritten-v1" ||
    metadata.entryId !== expected.entryId ||
    metadata.summaryFingerprint !== expected.fingerprint ||
    metadata.sourceGeneration !== expected.sourceGeneration ||
    metadata.sourceSha256 !== expected.sourceSha256 ||
    metadata.finalSha256 !== actualSha256 ||
    !isSha256(actualSha256)
  ) {
    throw new RetryableFinalizerError("FINAL_ARTIFACT_MISMATCH");
  }
  await verifyFinalizedPdf(artifact.buffer, expected.entryId);
  return { generation, sha256: actualSha256 };
}

export function createFinalizer({
  queryRows,
  loadSource,
  findArtifact,
  createArtifact,
  publish,
  validateSourcePdf,
  renderFinalizedPdf,
  verifyFinalizedPdf,
}) {
  return async function processEvent(event) {
    let rows;
    try {
      rows = await queryRows(event.entry_id);
    } catch (error) {
      throw new RetryableFinalizerError("SUMMARY_QUERY_FAILED", error);
    }
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new RetryableFinalizerError("SUMMARY_ROW_COUNT_INVALID");
    }
    const summary = validateSummaryRow(rows[0], event);

    let source;
    try {
      source = await loadSource(
        summary.pdf_gcs_key,
        summary.pdf_source_generation,
      );
    } catch (error) {
      throw new RetryableFinalizerError("SOURCE_READ_FAILED", error);
    }
    if (!source || !Buffer.isBuffer(source.buffer)) {
      throw new RetryableFinalizerError("SOURCE_INVALID");
    }
    const sourceGeneration = requireGeneration(
      source.generation,
      "SOURCE_GENERATION_INVALID",
    );
    if (sourceGeneration !== summary.pdf_source_generation) {
      throw new RetryableFinalizerError("SOURCE_GENERATION_MISMATCH");
    }
    const sourceSha256 = sha256(source.buffer);
    if (
      !isSha256(sourceSha256) ||
      sourceSha256 !== summary.pdf_source_sha256
    ) {
      throw new RetryableFinalizerError("SOURCE_SHA256_MISMATCH");
    }
    try {
      await validateSourcePdf({
        declaredVersion: summary.pdf_layout_version,
        pdfBuffer: source.buffer,
      });
    } catch (error) {
      throw new RetryableFinalizerError("SOURCE_LAYOUT_INVALID", error);
    }

    const objectName = finalObjectName(
      source.objectName,
      event.entry_id,
      summary.summary_fingerprint,
    );
    const expectedArtifact = {
      entryId: event.entry_id,
      fingerprint: summary.summary_fingerprint,
      sourceGeneration,
      sourceSha256,
    };

    let artifact;
    try {
      artifact = await findArtifact(objectName);
    } catch (error) {
      throw new RetryableFinalizerError("FINAL_LOOKUP_FAILED", error);
    }
    let finalGeneration;
    let finalSha256;
    if (artifact) {
      const verified = await verifyArtifact(
        artifact,
        expectedArtifact,
        verifyFinalizedPdf,
      );
      finalGeneration = verified.generation;
      finalSha256 = verified.sha256;
    } else {
      const rendered = await renderFinalizedPdf({
        sourcePdf: source.buffer,
        entryId: event.entry_id,
        status: event.status,
        summary,
      });
      if (!rendered || !Buffer.isBuffer(rendered.buffer)) {
        throw new RetryableFinalizerError("FINAL_RENDER_INVALID");
      }
      finalSha256 = sha256(rendered.buffer);
      const metadata = artifactMetadata({
        entryId: event.entry_id,
        fingerprint: summary.summary_fingerprint,
        sourceGeneration,
        sourceSha256,
        finalSha256,
      });
      try {
        const created = await createArtifact({
          objectName,
          buffer: rendered.buffer,
          metadata,
          ifGenerationMatch: 0,
        });
        finalGeneration = requireGeneration(
          created?.generation,
          "FINAL_GENERATION_INVALID",
        );
        await verifyFinalizedPdf(rendered.buffer, event.entry_id);
      } catch (error) {
        if (error?.code !== 412) {
          throw new RetryableFinalizerError("FINAL_CREATE_FAILED", error);
        }
        const racedArtifact = await findArtifact(objectName);
        const verified = await verifyArtifact(
          racedArtifact,
          expectedArtifact,
          verifyFinalizedPdf,
        );
        finalGeneration = verified.generation;
        finalSha256 = verified.sha256;
      }
    }

    const readyEvent = {
      event_type: "application_pdf_ready",
      schema_version: 1,
      analysis_version: 1,
      event_key: `application_pdf:${event.entry_id}:v1:${summary.summary_fingerprint}`,
      entry_id: event.entry_id,
      status: event.status,
      summary_fingerprint: summary.summary_fingerprint,
      source_generation: sourceGeneration,
      final_generation: finalGeneration,
      final_pdf_sha256: finalSha256,
    };
    try {
      const messageId = await publish(readyEvent);
      if (!messageId) throw new Error("empty message ID");
    } catch (error) {
      throw new RetryableFinalizerError("READY_PUBLISH_FAILED", error);
    }
    return { code: artifact ? "ARTIFACT_REUSED" : "ARTIFACT_CREATED" };
  };
}

export function createMessageHandler({ processEvent, logger = console }) {
  return async function handleMessage(message) {
    let parsed;
    try {
      parsed = parseUnderwritingReadyEvent(message.data);
      if (parsed.kind === "irrelevant") {
        message.ack();
        logger.info("pdf_finalizer_event_irrelevant");
        return;
      }
      const result = await processEvent(parsed.event);
      message.ack();
      logger.info(`pdf_finalizer_${result.code.toLowerCase()}`);
    } catch (error) {
      if (error instanceof NonRetryableFinalizerError) {
        message.ack();
        logger.warn(`pdf_finalizer_${error.code.toLowerCase()}`);
        return;
      }
      message.nack();
      const code =
        error instanceof RetryableFinalizerError
          ? error.code
          : "UNEXPECTED_FAILURE";
      logger.error(`pdf_finalizer_${code.toLowerCase()}`);
    }
  };
}
