ALTER TABLE `lithe-hallway-493420-r4.ndbf_applications.submissions`
ADD COLUMN IF NOT EXISTS extraction_provider STRING
  OPTIONS(description = 'Locked bank-statement extraction provider: openai or llama.'),
ADD COLUMN IF NOT EXISTS extraction_provider_locked_at TIMESTAMP
  OPTIONS(description = 'Time the extraction provider was locked for this submission.');

ALTER TABLE `lithe-hallway-493420-r4.ndbf_applications.submission_documents`
ALTER COLUMN vector_store_id DROP NOT NULL;

ALTER TABLE `lithe-hallway-493420-r4.ndbf_applications.submission_documents`
ADD COLUMN IF NOT EXISTS extraction_provider STRING
  OPTIONS(description = 'Bank-statement extraction provider locked by the parent submission.'),
ADD COLUMN IF NOT EXISTS provider_file_id STRING
  OPTIONS(description = 'Provider-native uploaded file identifier.'),
ADD COLUMN IF NOT EXISTS provider_job_id STRING
  OPTIONS(description = 'Provider-native extraction job identifier.'),
ADD COLUMN IF NOT EXISTS provider_event_id STRING
  OPTIONS(description = 'Latest accepted provider webhook event identifier.'),
ADD COLUMN IF NOT EXISTS provider_status STRING
  OPTIONS(description = 'PENDING, SUBMITTING, SUBMITTED, COMPLETED, or FAILED.'),
ADD COLUMN IF NOT EXISTS extraction_completed_at TIMESTAMP
  OPTIONS(description = 'Time the provider extraction row became durable in BigQuery.');
