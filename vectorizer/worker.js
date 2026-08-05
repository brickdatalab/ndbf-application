// Future-submission bank-statement PDF vectorization worker.
//
// This worker has its own Pub/Sub subscription. It does not upload historical
// documents, generated application PDFs, images, or spreadsheets.

import { createHash } from "node:crypto";

import { BigQuery } from "@google-cloud/bigquery";
import { PubSub } from "@google-cloud/pubsub";
import { Storage } from "@google-cloud/storage";

import { buildSubmissionDocuments, parseGcsUri } from "./documents.js";
import { createExtractionClient } from "./extraction-client.js";
import { ingestAndEnqueue } from "./extraction-handoff.js";
import { ingestDocument } from "./ingest.js";
import { createOpenAIClient } from "./openai.js";

const PROJECT_ID = process.env.PROJECT_ID || "lithe-hallway-493420-r4";
const BUCKET_NAME = process.env.BUCKET_NAME || "app_banks";
const BQ_DATASET = process.env.BQ_DATASET || "ndbf_applications";
const BQ_SUBMISSIONS_TABLE = process.env.BQ_TABLE || "submissions";
const BQ_DOCUMENTS_TABLE =
  process.env.BQ_DOCUMENTS_TABLE || "submission_documents";
const SUBSCRIPTION =
  process.env.VECTOR_SUBSCRIPTION || "submission-completed-vectorizer";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_VECTOR_STORE_ID = process.env.OPENAI_VECTOR_STORE_ID || "";
const NDBF_EXTRACTION_URL = process.env.NDBF_EXTRACTION_URL || "";
const NDBF_EXTRACTION_API_TOKEN = process.env.NDBF_EXTRACTION_API_TOKEN || "";

if (
  !OPENAI_API_KEY ||
  !OPENAI_VECTOR_STORE_ID ||
  !NDBF_EXTRACTION_URL ||
  !NDBF_EXTRACTION_API_TOKEN
) {
  console.error("[vectorizer] FATAL: required runtime environment variables are missing");
  process.exit(1);
}

const bigquery = new BigQuery({ projectId: PROJECT_ID });
const storage = new Storage({ projectId: PROJECT_ID });
const pubsub = new PubSub({ projectId: PROJECT_ID });
const subscription = pubsub.subscription(SUBSCRIPTION, {
  flowControl: { maxMessages: 2 },
});
const openai = createOpenAIClient({
  apiKey: OPENAI_API_KEY,
  vectorStoreId: OPENAI_VECTOR_STORE_ID,
});
const extractionClient = createExtractionClient({
  endpoint: NDBF_EXTRACTION_URL,
  token: NDBF_EXTRACTION_API_TOKEN,
});

const submissionsTable = `\`${PROJECT_ID}.${BQ_DATASET}.${BQ_SUBMISSIONS_TABLE}\``;
const documentsTable = `\`${PROJECT_ID}.${BQ_DATASET}.${BQ_DOCUMENTS_TABLE}\``;

function stableErrorCode(error) {
  const value = String(error?.code || "UNEXPECTED_ERROR");
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(value) ? value : "UNEXPECTED_ERROR";
}

async function fetchSubmission(entryId) {
  const [rows] = await bigquery.query({
    query: `
      SELECT entry_id, submitted_at, bank_statement_gcs_keys
      FROM ${submissionsTable}
      WHERE entry_id = @entry_id
        AND submitted_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
      ORDER BY submitted_at DESC
      LIMIT 1
    `,
    params: { entry_id: entryId },
  });
  return rows[0] || null;
}

function createRepository(sourceEventId) {
  return {
    async ensure(document) {
      await bigquery.query({
        query: `
          MERGE ${documentsTable} AS target
          USING (
            SELECT
              @document_id AS document_id,
              @entry_id AS entry_id,
              TIMESTAMP(@submitted_at) AS submitted_at,
              @document_type AS document_type,
              @document_index AS document_index,
              @gcs_uri AS gcs_uri
          ) AS source
          ON target.document_id = source.document_id
            AND target.submitted_at = source.submitted_at
          WHEN MATCHED AND target.ingestion_status != 'COMPLETED' THEN
            UPDATE SET
              attempt_count = target.attempt_count + 1,
              source_event_id = @source_event_id,
              updated_at = CURRENT_TIMESTAMP()
          WHEN NOT MATCHED THEN
            INSERT (
              document_id, entry_id, submitted_at, document_type,
              document_index, gcs_uri, vector_store_id, ingestion_status,
              attempt_count, source_event_id, created_at, updated_at
            )
            VALUES (
              source.document_id, source.entry_id, source.submitted_at,
              source.document_type, source.document_index, source.gcs_uri,
              @vector_store_id, 'PENDING', 1, @source_event_id,
              CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
            )
        `,
        params: {
          ...document,
          source_event_id: sourceEventId,
          vector_store_id: OPENAI_VECTOR_STORE_ID,
        },
      });

      const [rows] = await bigquery.query({
        query: `
          SELECT ingestion_status, openai_file_id, vector_store_file_id
          FROM ${documentsTable}
          WHERE document_id = @document_id
            AND submitted_at = TIMESTAMP(@submitted_at)
          LIMIT 1
        `,
        params: {
          document_id: document.document_id,
          submitted_at: document.submitted_at,
        },
      });
      return rows[0] || null;
    },

    async markUploaded(document, value) {
      await bigquery.query({
        query: `
          UPDATE ${documentsTable}
          SET
            gcs_generation = @gcs_generation,
            source_content_type = @source_content_type,
            source_size_bytes = @source_size_bytes,
            source_sha256 = @source_sha256,
            openai_file_id = @openai_file_id,
            ingestion_status = 'UPLOADED',
            openai_status = 'uploaded',
            error_code = NULL,
            updated_at = CURRENT_TIMESTAMP()
          WHERE document_id = @document_id
            AND submitted_at = TIMESTAMP(@submitted_at)
        `,
        params: {
          document_id: document.document_id,
          submitted_at: document.submitted_at,
          gcs_generation: String(value.generation || ""),
          source_content_type: String(value.contentType || "application/pdf"),
          source_size_bytes: Number(value.sizeBytes || 0),
          source_sha256: value.sha256,
          openai_file_id: value.openaiFileId,
        },
      });
    },

    async markAttached(document, value) {
      await bigquery.query({
        query: `
          UPDATE ${documentsTable}
          SET
            vector_store_file_id = @vector_store_file_id,
            ingestion_status = 'PROCESSING',
            openai_status = @openai_status,
            error_code = NULL,
            updated_at = CURRENT_TIMESTAMP()
          WHERE document_id = @document_id
            AND submitted_at = TIMESTAMP(@submitted_at)
        `,
        params: {
          document_id: document.document_id,
          submitted_at: document.submitted_at,
          vector_store_file_id: value.vectorStoreFileId,
          openai_status: value.openaiStatus,
        },
      });
    },

    async markCompleted(document, value) {
      await bigquery.query({
        query: `
          UPDATE ${documentsTable}
          SET
            vector_store_file_id = @vector_store_file_id,
            ingestion_status = 'COMPLETED',
            openai_status = @openai_status,
            error_code = NULL,
            completed_at = CURRENT_TIMESTAMP(),
            updated_at = CURRENT_TIMESTAMP()
          WHERE document_id = @document_id
            AND submitted_at = TIMESTAMP(@submitted_at)
        `,
        params: {
          document_id: document.document_id,
          submitted_at: document.submitted_at,
          vector_store_file_id: value.vectorStoreFileId,
          openai_status: value.openaiStatus,
        },
      });
    },

    async markFailed(document, value) {
      await bigquery.query({
        query: `
          UPDATE ${documentsTable}
          SET
            ingestion_status = 'FAILED',
            error_code = @error_code,
            updated_at = CURRENT_TIMESTAMP()
          WHERE document_id = @document_id
            AND submitted_at = TIMESTAMP(@submitted_at)
        `,
        params: {
          document_id: document.document_id,
          submitted_at: document.submitted_at,
          error_code: value.errorCode,
        },
      });
    },
  };
}

async function loadSource(gcsUri) {
  const parsed = parseGcsUri(gcsUri);
  if (parsed.bucket !== BUCKET_NAME) {
    const error = new Error("UNEXPECTED_GCS_BUCKET");
    error.code = "UNEXPECTED_GCS_BUCKET";
    throw error;
  }
  const file = storage.bucket(parsed.bucket).file(parsed.object);
  const [[metadata], [bytes]] = await Promise.all([
    file.getMetadata(),
    file.download(),
  ]);
  const headerPosition = bytes.indexOf(Buffer.from("%PDF-"));
  if (headerPosition < 0 || headerPosition > 1024) {
    const error = new Error("INVALID_PDF_HEADER");
    error.code = "INVALID_PDF_HEADER";
    throw error;
  }
  return {
    bytes,
    generation: String(metadata.generation || ""),
    contentType: "application/pdf",
    sizeBytes: Number(metadata.size || bytes.length),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function prepareUpload(source, document) {
  return {
    bytes: source.bytes,
    filename: `${document.document_id}.pdf`,
    contentType: "application/pdf",
  };
}

async function handleMessage(message) {
  let payload;
  try {
    payload = JSON.parse(message.data.toString("utf8"));
  } catch {
    console.error(`[vectorizer] msg=${message.id} drop=INVALID_JSON`);
    message.ack();
    return;
  }
  const entryId = String(payload?.entry_id || "");
  if (!entryId) {
    console.error(`[vectorizer] msg=${message.id} drop=ENTRY_ID_MISSING`);
    message.ack();
    return;
  }

  try {
    const row = await fetchSubmission(entryId);
    if (!row) {
      console.warn(`[vectorizer] msg=${message.id} retry=SUBMISSION_NOT_VISIBLE`);
      message.nack();
      return;
    }
    const documents = buildSubmissionDocuments(row);
    const repo = createRepository(message.id);
    for (const document of documents) {
      const result = await ingestAndEnqueue(document, {
        ingest: ingestDocument,
        ingestOptions: {
          repo,
          loadSource,
          prepareUpload,
          openai,
        },
        extractionClient,
      });
      console.log(
        `[vectorizer] msg=${message.id} document=${document.document_id} ` +
          `status=${result.status} extraction=${result.extractionStatus}`
      );
    }
    console.log(`[vectorizer] msg=${message.id} completed_pdfs=${documents.length}`);
    message.ack();
  } catch (error) {
    console.error(
      `[vectorizer] msg=${message.id} retry=${stableErrorCode(error)}`
    );
    message.nack();
  }
}

console.log(
  `[vectorizer] starting subscription=${SUBSCRIPTION} project=${PROJECT_ID} ` +
    `table=${BQ_DATASET}.${BQ_DOCUMENTS_TABLE} chunking=800/400 scope=future-bank-pdfs`
);

subscription.on("message", handleMessage);
subscription.on("error", (error) => {
  console.error(`[vectorizer] subscription_error=${stableErrorCode(error)}`);
});

async function shutdown(signal) {
  console.log(`[vectorizer] ${signal} closing subscription`);
  await subscription.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
