import { BigQuery } from "@google-cloud/bigquery";
import { PubSub } from "@google-cloud/pubsub";
import { Storage } from "@google-cloud/storage";

const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const DATASET_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,1023}$/;

function requireIdentifier(value, pattern, code) {
  const identifier = String(value ?? "");
  if (!pattern.test(identifier)) throw new Error(code);
  return identifier;
}

export function buildSummaryQuery({
  projectId = "lithe-hallway-493420-r4",
  datasetId = "ndbf_applications",
} = {}) {
  const project = requireIdentifier(
    projectId,
    PROJECT_ID_PATTERN,
    "BIGQUERY_PROJECT_ID_INVALID",
  );
  const dataset = requireIdentifier(
    datasetId,
    DATASET_ID_PATTERN,
    "BIGQUERY_DATASET_ID_INVALID",
  );
  return `
  SELECT
    summary.entry_id,
    summary.analysis_version,
    summary.analysis_status,
    summary.expected_document_count,
    summary.extracted_document_count,
    summary.all_documents_processed,
    summary.statements,
    summary.mca_deposits,
    summary.debt_accounts,
    summary.summary_fingerprint,
    source.pdf_gcs_key,
    source.pdf_layout_version,
    source.pdf_source_generation,
    source.pdf_source_sha256
  FROM \`${project}.${dataset}.application_pdf_underwriting_summary\` AS summary
  JOIN \`${project}.${dataset}.submissions\` AS source
    USING (entry_id)
  WHERE summary.entry_id = @entry_id
`;
}

export const SUMMARY_QUERY = buildSummaryQuery();

function parseGsUri(uri, expectedBucket) {
  const match = String(uri ?? "").match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match || match[1] !== expectedBucket || !match[2]) {
    throw new Error("GCS_SOURCE_URI_INVALID");
  }
  return { bucketName: match[1], objectName: match[2] };
}

function isNotFound(error) {
  return error?.code === 404;
}

function customMetadata(metadata) {
  return metadata?.metadata ?? {};
}

export function createProductionAdapters({
  projectId = "lithe-hallway-493420-r4",
  datasetId = "ndbf_applications",
  bucketName = "app_banks",
  readyTopicName = "application-pdf-ready",
  bigquery = new BigQuery({ projectId }),
  storage = new Storage({ projectId }),
  pubsub = new PubSub({ projectId }),
} = {}) {
  const summaryQuery = buildSummaryQuery({ projectId, datasetId });
  const bucket = storage.bucket(bucketName);
  const readyTopic = pubsub.topic(readyTopicName);

  return {
    async queryRows(entryId) {
      const [rows] = await bigquery.query({
        query: summaryQuery,
        params: { entry_id: entryId },
        types: { entry_id: "STRING" },
        useLegacySql: false,
      });
      return rows;
    },

    async loadSource(uri, expectedGeneration) {
      const { objectName } = parseGsUri(uri, bucketName);
      const generation = String(expectedGeneration ?? "");
      if (!/^[0-9]+$/.test(generation)) {
        throw new Error("GCS_SOURCE_GENERATION_INVALID");
      }
      const pinned = bucket.file(objectName, { generation });
      const [buffer] = await pinned.download({ validation: "crc32c" });
      const [verifiedMetadata] = await pinned.getMetadata();
      if (String(verifiedMetadata.generation ?? "") !== generation) {
        throw new Error("GCS_SOURCE_GENERATION_CHANGED");
      }
      return {
        objectName,
        buffer,
        generation,
        metadata: customMetadata(verifiedMetadata),
      };
    },

    async findArtifact(objectName) {
      const file = bucket.file(objectName);
      let metadata;
      try {
        [metadata] = await file.getMetadata();
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
      const generation = String(metadata.generation ?? "");
      const pinned = bucket.file(objectName, { generation });
      const [buffer] = await pinned.download({ validation: "crc32c" });
      return {
        objectName,
        buffer,
        generation,
        metadata: customMetadata(metadata),
      };
    },

    async createArtifact({
      objectName,
      buffer,
      metadata,
      ifGenerationMatch,
    }) {
      const file = bucket.file(objectName);
      await file.save(buffer, {
        contentType: "application/pdf",
        resumable: false,
        validation: "crc32c",
        metadata: {
          cacheControl: "private, max-age=0, no-transform",
          metadata,
        },
        preconditionOpts: { ifGenerationMatch },
      });
      const [storedMetadata] = await file.getMetadata();
      return { generation: String(storedMetadata.generation ?? "") };
    },

    async publish(event) {
      return readyTopic.publishMessage({
        json: event,
        attributes: {
          event_type: event.event_type,
          schema_version: String(event.schema_version),
        },
      });
    },
  };
}
