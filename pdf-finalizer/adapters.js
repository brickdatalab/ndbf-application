import { createHash } from "node:crypto";

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

function identifiers({
  projectId = "lithe-hallway-493420-r4",
  datasetId = "ndbf_applications",
} = {}) {
  return {
    project: requireIdentifier(projectId, PROJECT_ID_PATTERN, "BIGQUERY_PROJECT_ID_INVALID"),
    dataset: requireIdentifier(datasetId, DATASET_ID_PATTERN, "BIGQUERY_DATASET_ID_INVALID"),
  };
}

export function buildSummaryQueries(options = {}) {
  const { project, dataset } = identifiers(options);
  return {
    metadata: `
      SELECT
        summary.entry_id,
        summary.analysis_version,
        summary.analysis_status,
        summary.expected_document_count,
        summary.extracted_document_count,
        summary.all_documents_processed,
        source.pdf_gcs_key,
        source.pdf_layout_version,
        source.pdf_source_generation,
        source.pdf_source_sha256
      FROM \`${project}.${dataset}.submission_underwriting_summary\` AS summary
      JOIN \`${project}.${dataset}.submissions\` AS source USING (entry_id)
      WHERE summary.entry_id = @entry_id
      LIMIT 2
    `,
    statements: `
      SELECT
        underwriting.document_id,
        underwriting.document_index,
        underwriting.openai_file_id,
        REGEXP_EXTRACT(
          REGEXP_REPLACE(COALESCE(calculated.statement.summary.account_number, ''), r'[^0-9]', ''),
          r'([0-9]{4})$'
        ) AS account_last_four,
        CAST(underwriting.statement_start_date AS STRING) AS statement_start_date,
        CAST(underwriting.statement_end_date AS STRING) AS statement_end_date,
        CAST(underwriting.total_deposits AS STRING) AS deposits,
        calculated.statement.summary.num_credits AS deposit_count,
        CAST(underwriting.true_deposits AS STRING) AS true_revenue,
        CAST(calculated.statement.summary.calculated_total_debits AS STRING) AS withdrawals,
        underwriting.negative_balance_days AS negative_ending_days,
        CAST(underwriting.average_daily_balance AS STRING) AS average_daily_balance,
        CASE
          WHEN ARRAY_LENGTH(underwriting.mca_positions) > 0 THEN 'Yes'
          WHEN 'MCA_CANDIDATE_UNCONFIRMED' IN UNNEST(underwriting.quality_reasons) THEN 'Review'
          ELSE '—'
        END AS mca_detected,
        underwriting.quality_status
      FROM \`${project}.${dataset}.bank_statement_underwriting_summary\` AS underwriting
      JOIN \`${project}.${dataset}.bank_statement_calculated\` AS calculated
        USING (entry_id, document_id, document_index, openai_file_id)
      WHERE underwriting.entry_id = @entry_id
      ORDER BY underwriting.statement_start_date, underwriting.statement_end_date,
        underwriting.document_index, underwriting.document_id
    `,
  };
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function mergeSummary(metadata, statements) {
  if (!metadata) return null;
  const displayed = {
    entry_id: metadata.entry_id,
    analysis_version: Number(metadata.analysis_version),
    analysis_status: metadata.analysis_status,
    expected_document_count: Number(metadata.expected_document_count),
    extracted_document_count: Number(metadata.extracted_document_count),
    all_documents_processed: metadata.all_documents_processed,
    statements,
  };
  return {
    ...displayed,
    summary_fingerprint: fingerprint(displayed),
    pdf_gcs_key: metadata.pdf_gcs_key,
    pdf_layout_version: metadata.pdf_layout_version,
    pdf_source_generation: String(metadata.pdf_source_generation ?? ""),
    pdf_source_sha256: String(metadata.pdf_source_sha256 ?? "").toLowerCase(),
  };
}

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
  const queries = buildSummaryQueries({ projectId, datasetId });
  const bucket = storage.bucket(bucketName);
  const readyTopic = pubsub.topic(readyTopicName);
  const query = async (queryText, entryId) => {
    const [rows] = await bigquery.query({
      query: queryText,
      params: { entry_id: entryId },
      types: { entry_id: "STRING" },
      useLegacySql: false,
    });
    return rows;
  };

  return {
    async queryRows(entryId) {
      const [metadataRows, statements] = await Promise.all([
        query(queries.metadata, entryId),
        query(queries.statements, entryId),
      ]);
      if (metadataRows.length > 1) return metadataRows;
      const summary = mergeSummary(metadataRows[0], statements);
      return summary ? [summary] : [];
    },

    async loadSource(uri, expectedGeneration) {
      const { objectName } = parseGsUri(uri, bucketName);
      const generation = String(expectedGeneration ?? "");
      if (!/^[0-9]+$/.test(generation)) throw new Error("GCS_SOURCE_GENERATION_INVALID");
      const pinned = bucket.file(objectName, { generation });
      const [buffer] = await pinned.download({ validation: "crc32c" });
      const [verifiedMetadata] = await pinned.getMetadata();
      if (String(verifiedMetadata.generation ?? "") !== generation) {
        throw new Error("GCS_SOURCE_GENERATION_CHANGED");
      }
      return { objectName, buffer, generation, metadata: customMetadata(verifiedMetadata) };
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
      return { objectName, buffer, generation, metadata: customMetadata(metadata) };
    },

    async createArtifact({ objectName, buffer, metadata, ifGenerationMatch }) {
      const file = bucket.file(objectName);
      await file.save(buffer, {
        contentType: "application/pdf",
        resumable: false,
        validation: "crc32c",
        metadata: { cacheControl: "private, max-age=0, no-transform", metadata },
        preconditionOpts: { ifGenerationMatch },
      });
      const [storedMetadata] = await file.getMetadata();
      return { generation: String(storedMetadata.generation ?? "") };
    },

    async publish(event) {
      return readyTopic.publishMessage({
        json: event,
        attributes: { event_type: event.event_type, schema_version: String(event.schema_version) },
      });
    },
  };
}
