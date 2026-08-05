-- Additive source-PDF metadata used by the finalizer. No underwriting view is created.
ALTER TABLE `lithe-hallway-493420-r4.ndbf_applications.submissions`
ADD COLUMN IF NOT EXISTS pdf_layout_version STRING
OPTIONS(description = 'Versioned PDF layout declared by the submitting client; NULL means legacy.');

ALTER TABLE `lithe-hallway-493420-r4.ndbf_applications.submissions`
ADD COLUMN IF NOT EXISTS pdf_source_generation STRING
OPTIONS(description = 'Immutable GCS generation captured when the signed source PDF was stored.');

ALTER TABLE `lithe-hallway-493420-r4.ndbf_applications.submissions`
ADD COLUMN IF NOT EXISTS pdf_source_sha256 STRING
OPTIONS(description = 'Lowercase SHA-256 of the exact signed source PDF bytes.');
