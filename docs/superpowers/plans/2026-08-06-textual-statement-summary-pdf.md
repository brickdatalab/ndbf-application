# Textual Statement Summary PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the finalized PDF underwriting table with compact textual statement summaries and remove all MCA Deposits and Debt Summary content.

**Architecture:** Keep the existing underwriting-v1 source/finalization workflow and data query unchanged. Change only the shared source-page shell and PDF finalizer presentation, retain old accepted layout fingerprints for compatibility, and deploy those matching files to the frontend, backend validator, and finalizer.

**Tech Stack:** JavaScript, TypeScript, jsPDF, pdf-lib, Vitest, Node test runner.

## Global Constraints

- Do not change OpenAI, LlamaExtract, BigQuery extraction, calculations, email routing, or any non-underwriting PDF content.
- Render only Statement Summary.
- Use compact text blocks without grid cells or column headings.
- Format financial values to two decimals without JavaScript floating-point conversion.

---

### Task 1: Regression expectations

**Files:**
- Modify: `ndbf-application-demo/src/lib/pdf-layout.test.ts`
- Modify: `ndbf-application-demo/pdf-finalizer/renderer.node-test.js`

- [ ] Assert the blank source page contains no statement column headings.
- [ ] Assert the finalized page contains labeled text metrics and no MCA Deposits or Debt Summary.
- [ ] Run the focused tests and observe the old column layout fail.

### Task 2: Textual layout

**Files:**
- Modify: `ndbf-application-demo/shared/pdf-layout-contract.js`
- Modify: `ndbf-application-demo/shared/pdf-underwriting-page.js`
- Modify: `ndbf-application-demo/pdf-finalizer/renderer.js`

- [ ] Remove source-page column headings and their rule.
- [ ] Render each statement as a bold period/account line followed by two compact labeled metric lines.
- [ ] Wrap long text within the writable width and paginate complete blocks without clipping.
- [ ] Round displayed currency strings to two decimals using string/BigInt arithmetic.
- [ ] Regenerate and register the source-page fingerprint while retaining prior accepted fingerprints.

### Task 3: Verify and deploy

**Files:**
- Modify: `CHANGELOG.md`

- [ ] Run finalizer, PDF pipeline, frontend tests, typecheck, and production build.
- [ ] Render a representative PDF and inspect the underwriting page as an image.
- [ ] Deploy matching shared layout files to the VM backend and finalizer.
- [ ] Commit/push the frontend change to GitHub main and verify Vercel production is READY.
- [ ] Confirm backend/finalizer PM2 processes remain online and deployed hashes match.

