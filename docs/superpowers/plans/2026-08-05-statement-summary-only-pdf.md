# Statement-Summary-Only PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove MCA Deposits and Debt Summary from every newly generated source and finalized application PDF so Statement Summary is the only underwriting section displayed.

**Architecture:** Keep the extraction, underwriting, BigQuery, Pub/Sub, GCS, and email workflows unchanged. Narrow only the versioned PDF layout and PDF-finalizer read/render boundary so the signed source shell and finalized artifact contain Statement Summary alone.

**Tech Stack:** React/Vite, TypeScript, jsPDF, Node.js, pdf-lib, BigQuery client, PM2, GitHub, Vercel

## Global Constraints

- Preserve the eight existing Statement Summary columns, including MCA detected.
- Do not change bank-statement extraction, underwriting calculations, BigQuery schemas/views, email routing, attachments, or applicant-facing behavior.
- Continue preserving the immutable signed source PDF and creating one immutable finalized PDF.
- No historical PDF or applicant record is rewritten.
- Deploy the shared layout validator and finalizer together before activating the new frontend layout.

---

### Task 1: Make the PDF layout statement-only

**Files:**
- Modify: `shared/pdf-layout-contract.js`
- Modify: `src/lib/pdf-layout.test.ts`

**Interfaces:**
- Consumes: `getPdfLayoutContract("underwriting-v1")`
- Produces: a source underwriting page whose `sections` array contains only `statement-summary`

- [ ] **Step 1: Update the source-layout test**

Assert that the generated PDF contains `Statement Summary` and does not contain `MCA Deposits` or `Debt Summary`.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- src/lib/pdf-layout.test.ts`

Expected: failure because the current source PDF still renders both removed sections.

- [ ] **Step 3: Remove the two sections from the shared contract**

Delete the `mca-deposits` and `debt-summary` section definitions. Recompute `decodedLastPageContentSha256` from the generated statement-only source page so backend source validation remains exact.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- src/lib/pdf-layout.test.ts`

Expected: the PDF includes only Statement Summary, retains its watermark/anchor/A4 validation, and passes the exact content fingerprint check.

### Task 2: Narrow the finalizer to Statement Summary

**Files:**
- Modify: `pdf-finalizer/adapters.js`
- Modify: `pdf-finalizer/contracts.js`
- Modify: `pdf-finalizer/renderer.js`
- Modify: `pdf-finalizer/test-fixtures.js`
- Modify: `pdf-finalizer/finalizer.node-test.js`
- Modify: `pdf-finalizer/renderer.node-test.js`
- Modify: `pdf-finalizer/README.md`

**Interfaces:**
- Consumes: metadata plus ordered rows from `bank_statement_underwriting_summary` and `bank_statement_calculated`
- Produces: a validated statement-only summary fingerprint and finalized PDF

- [ ] **Step 1: Update tests to require only two parameterized BigQuery queries**

Require one metadata query and one statement query. Remove fixture and test expectations for `mca_deposits`, `debt_accounts`, MCA/debt rows, or MCA/debt continuation pages.

- [ ] **Step 2: Run finalizer tests and confirm they fail**

Run: `cd pdf-finalizer && npm test`

Expected: failures show the existing adapter and renderer still consume and display MCA/debt sections.

- [ ] **Step 3: Remove MCA/debt queries and contract fields**

Build the finalizer summary from metadata and `statements` only. Compute `summary_fingerprint` from the exact statement-only displayed model. Preserve document-binding validation, decimal validation, status validation, source integrity, and idempotent artifact naming.

- [ ] **Step 4: Render and paginate only Statement Summary**

Remove MCA deposit and debt cell formatters, row bands, continuation calls, and metrics. Keep Statement Summary pagination, Review markers, exact-decimal formatting, entry ID, A4 validation, watermark visibility, and source immutability.

- [ ] **Step 5: Run finalizer tests and confirm they pass**

Run: `cd pdf-finalizer && npm test`

Expected: zero failures, with extracted PDF text proving both removed headings and their example row data are absent.

### Task 3: Verify, document, and deploy

**Files:**
- Modify: `CHANGELOG.md` at the workspace root
- Deploy: shared layout/backend files to `/opt/ndbf-backend`
- Deploy: finalizer files to `/opt/ndbf-pdf-finalizer`

**Interfaces:**
- Consumes: verified repository artifacts
- Produces: live statement-summary-only PDFs for future submissions

- [ ] **Step 1: Run the complete relevant checks**

Run:

```bash
npm test
npm run test:pdf-pipeline
npm run build
cd server && npm test
cd ../pdf-finalizer && npm test
```

Expected: all tests and the production build pass.

- [ ] **Step 2: Deploy VM components atomically**

Copy only the verified shared layout/backend and PDF-finalizer files, preserving `.env` and secrets. Restart only `ndbf-backend` and `ndbf-pdf-finalizer`, confirm `/health`, PM2 online state, clean startup logs, and matching local/deployed hashes.

- [ ] **Step 3: Commit and publish the frontend**

Commit the cohesive repository changes, push the verified commit to GitHub `main`, wait for the Vercel production deployment to reach `READY`, and confirm the production alias points to that deployment.

- [ ] **Step 4: Record the change**

Append one concise sanitized line to `/Users/vitolo/Desktop/nextdaybizfunding.com/CHANGELOG.md` stating that future source and finalized PDFs now display Statement Summary only.

- [ ] **Step 5: Final production verification**

Confirm no live submission was created for testing, no historical objects were modified, the backend and finalizer are online, local/deployed hashes match, and the live frontend deployment contains the same commit.
