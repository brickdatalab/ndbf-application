CREATE TABLE IF NOT EXISTS `lithe-hallway-493420-r4.ndbf_applications.submission_documents` (
  document_id STRING NOT NULL OPTIONS(description = 'Deterministic opaque ID for one submission PDF.'),
  entry_id STRING NOT NULL OPTIONS(description = 'Parent submissions.entry_id.'),
  submitted_at TIMESTAMP NOT NULL,
  document_type STRING NOT NULL OPTIONS(description = 'Currently bank_statement only.'),
  document_index INT64 NOT NULL OPTIONS(description = 'One-based bank-statement order within the submission.'),
  gcs_uri STRING NOT NULL,
  gcs_generation STRING,
  source_content_type STRING,
  source_size_bytes INT64,
  source_sha256 STRING,
  openai_file_id STRING,
  vector_store_id STRING NOT NULL,
  vector_store_file_id STRING,
  ingestion_status STRING NOT NULL,
  openai_status STRING,
  attempt_count INT64 NOT NULL,
  source_event_id STRING,
  error_code STRING,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP
)
PARTITION BY DATE(submitted_at)
CLUSTER BY entry_id, ingestion_status, document_type
OPTIONS (
  description = 'Future submission bank-statement PDFs and their OpenAI vector-store file IDs.',
  labels = [('system', 'ndbf-application'), ('purpose', 'document-index')]
);
