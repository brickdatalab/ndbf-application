# Speed Insights Transfer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Hobby-plan Speed Insights entitlement from Clear Scrub to NDBF and safely instrument the NDBF Vite application.

**Architecture:** Vercel owns the one-project entitlement. The React app mounts `@vercel/speed-insights` only after recipient PII prefill parameters have been consumed and removed from the browser URL; attribution parameters remain available to the existing submission flow.

**Tech Stack:** Vercel CLI/API, React 18, TypeScript, Vite, Vitest

---

### Task 1: Transfer the Vercel entitlement

**Projects:**
- Disable: `clearscrub-dashboard` (`prj_wZeaiGhhIiLsuEMWf657jInqsY8D`)
- Enable: `ndbf-application` (`prj_UyEs911rzUZZ54KBUOqJOlUbJHug`)

- [x] Disable Speed Insights for Clear Scrub through Vercel's authenticated API.
- [x] Enable Speed Insights for NDBF with `vercel project speed-insights`.
- [x] Confirm the API/CLI reports the intended state.

### Task 2: Add privacy-safe React instrumentation

**Files:**
- Modify: `src/lib/prefill.ts`
- Modify: `src/lib/prefill.test.ts`
- Modify: `src/App.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] Add a test proving PII prefill parameters are removed while `app` and `utm_*` are retained.
- [x] Add the minimal URL-sanitizing helper.
- [x] Install `@vercel/speed-insights`.
- [x] Mount `<SpeedInsights />` only after prefill and URL sanitization complete.

### Task 3: Verify and publish the branch

- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Confirm the working-tree diff contains no environment or credential changes.
- [x] Commit and push the release branch.
- [x] Record whether Vercel deployment quota allows the updated build to reach production (the current daily deployment quota remains exhausted until its reset).
