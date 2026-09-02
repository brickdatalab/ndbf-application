-- Hidden underwriting values passed in the application URL by a rep
-- (src/lib/underwriting.ts). Strings, optional, NULL when absent.
-- Applied to production 2026-09-02 (columns), descriptions set the same night.
-- Must run BEFORE deploying server/server.js: the backend inserts with
-- ignoreUnknownValues: false, so a row carrying these keys fails on a table
-- that lacks the columns.

ALTER TABLE `lithe-hallway-493420-r4.ndbf_applications.submissions`
ADD COLUMN IF NOT EXISTS avg_monthly_deposits STRING
  OPTIONS(description = 'Rep-supplied via URL param avg_monthly_deposits. Free text, max 100 chars.'),
ADD COLUMN IF NOT EXISTS total_mca_debits STRING
  OPTIONS(description = 'Rep-supplied via URL param total_mca_debits. Free text, max 100 chars.'),
ADD COLUMN IF NOT EXISTS avg_balance STRING
  OPTIONS(description = 'Rep-supplied via URL param avg_balance. Free text, max 100 chars.'),
ADD COLUMN IF NOT EXISTS avg_negative_balance_days STRING
  OPTIONS(description = 'Rep-supplied via URL param avg_negative_balance_days. Free text, max 100 chars.'),
ADD COLUMN IF NOT EXISTS open_mca STRING
  OPTIONS(description = 'Rep-supplied via URL param open_mca. Free text, max 400 chars.');
