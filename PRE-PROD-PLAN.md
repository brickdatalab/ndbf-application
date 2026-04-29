# NDBF Application — Pre-Production Plan

> Status: this folder is the **frontend** repo. Push as-is to a private GitHub repo, connect it to a Vercel project, and the rest runs automatically. Backend lives on the GCP VM `approval-dept` and is mirrored to `server/` in this repo for version control / reference.

---

## 1. Where everything lives right now

| Component | Where | URL / location |
|---|---|---|
| **Frontend (this folder)** | local + ready to push | `ndbf-application-demo/` |
| **Backend API** | GCP VM `approval-dept` | `https://136-119-104-124.nip.io` (will become `https://api.nextdaybizfunding.com` after DNS) |
| **GCS bucket** | GCP project `lithe-hallway-493420-r4` | `gs://app_banks/` |
| **BQ table** | same project | `ndbf_applications.submissions` (partitioned by `DATE(submitted_at)`, clustered by `app_param`, `business_legal_name`) |

---

## 2. What I'm cleaning up in this folder before you push it

These steps are no-input — I do them now.

1. **Gitignore audit** — confirm `.gitignore` excludes `node_modules/`, `dist/`, `*.tsbuildinfo`, `vite.config.js`, `vite.config.d.ts`, `vite.config.js.timestamp-*.mjs`, `.env*`, `.vercel/`, `.DS_Store`. Add anything missing.
2. **Add `.vercelignore`** — keep `server/` and large reference docs out of the Vercel build context (faster builds, cleaner deploys).
3. **Add `vercel.json`** — explicit framework hint (Vite), build/output config, SPA rewrite so deep links work.
4. **Add `.env.example`** — single env var (`VITE_API_URL`) with comments. The frontend already defaults to the production VM URL when this is unset.
5. **Add `.editorconfig`** — keep formatting consistent across machines (you, me, anyone else).
6. **Mirror the backend** into `server/` — copy `package.json` + `server.js` + a small `README.md` explaining it runs on the VM via pm2. This way the repo is the source of truth for both pieces.
7. **Rewrite top-level `README.md`** — concise project overview: what's in the repo, local dev commands, env vars, prod URLs, where data lands, how to deploy.
8. **Add `INFRA.md`** — single-page doc capturing the entire GCP setup (VM specs, firewall rules, GCS bucket, BQ DDL, Caddy config) so we can rebuild it from scratch if needed.
9. **Verify build still passes** (`npm install && npm run build`) — must compile clean before we call it pre-prod.

---

## 3. What you do once I'm done with §2

These steps need your hands — credentials, repo creation, Vercel UI.

1. **Create a private GitHub repo** (suggested name: `ndbf-application` or `nextdaybizfunding-app`).
2. From inside `ndbf-application-demo/` on your Mac:
   ```
   git init
   git add .
   git commit -m "Initial commit: NDBF application, pre-prod ready"
   git branch -M main
   git remote add origin git@github.com:<you>/<repo>.git
   git push -u origin main
   ```
3. **Create a new Vercel project** → import that GitHub repo. Vercel will auto-detect Vite. Build = `npm run build`, output = `dist`. Accept defaults.
4. **Set the Vercel environment variable** in the project settings → Environment Variables:
   - Name: `VITE_API_URL`
   - Value: `https://136-119-104-124.nip.io`  *(swap to `https://api.nextdaybizfunding.com` once DNS is live — see §5)*
   - Apply to: Production, Preview, Development
5. **Trigger a fresh deploy** — Vercel does this automatically when you push or when env vars change. After ~30 seconds you have a `*.vercel.app` URL.
6. **Test** — open the URL, fill the form, hit Submit. Confirm a row lands in BQ:
   ```
   ssh -i ~/.ssh/approval-dept vitolo@136.119.104.124 \
     "bq query --use_legacy_sql=false 'SELECT entry_id, contact_name, business_legal_name FROM \`lithe-hallway-493420-r4.ndbf_applications.submissions\` ORDER BY submitted_at DESC LIMIT 3'"
   ```

---

## 4. How changes get deployed going forward

Once the repo + Vercel project are linked, the workflow is:

1. I edit files in `ndbf-application-demo/` (this folder, on your Mac).
2. You `git commit` and `git push`.
3. Vercel sees the push, auto-builds, auto-deploys. Production URL updates within ~30 seconds.
4. Pull-request branches get their own Preview URLs automatically — easy way to review before promoting to prod.

If a backend change is needed (very rare — backend is deliberately small), I edit `server/server.js`, you commit/push, then I `scp` the new file to the VM and `pm2 restart ndbf-backend`. Production traffic isn't disrupted (pm2 graceful restart, ~50ms blip).

---

## 5. Production cutover when the client adds DNS

Already-given DNS records the client needs to add:

| Record | Type | Host | Value |
|---|---|---|---|
| Backend API | A | `api` | `136.119.104.124` |
| Frontend app | CNAME | `application` | `cname.vercel-dns.com` |

When `api.nextdaybizfunding.com` resolves to the VM, **Caddy auto-issues a Let's Encrypt cert with zero work from us** — the Caddyfile is already pre-configured for that hostname.

When DNS is fully propagated:

1. **In Vercel project settings → Domains:** add `application.nextdaybizfunding.com`. Vercel will verify it through the CNAME and provision its own cert.
2. **In Vercel env vars:** flip `VITE_API_URL` from `https://136-119-104-124.nip.io` to `https://api.nextdaybizfunding.com`. Vercel re-deploys automatically.
3. **The `nip.io` URL keeps working forever** as a fallback (it's still in the Caddyfile), so we have a safety net.

---

## 6. Open / future items (not blockers for go-live)

- **Service-account least privilege** — VM currently runs with `cloud-platform` (full) scope. Tighten to `storage.objectAdmin` on `app_banks` + `bigquery.dataEditor` on the dataset post-launch.
- **Vercel Speed Insights / Web Analytics** — one-click enable from Vercel dashboard once the project is live. Nice-to-have for the client's marketing.
- **Sentry or similar** — optional, for catching client-side errors in production. Add when volume justifies it.
- **VM monitoring** — Cloud Ops Agent already installed during VM creation; logs flow to Cloud Logging. Set up an alert for backend errors.
- **Static IP confirmation** — already done (`approval-dept-ip` reserved).
- **Backups / DR** — BQ is durable by default. Consider GCS object versioning on `app_banks` if the client cares.

---

## 7. Acceptance criteria — "done" for pre-prod

- [ ] `ndbf-application-demo/` builds cleanly (`npm install && npm run build`)
- [ ] All required config files present (`.gitignore`, `.vercelignore`, `vercel.json`, `.env.example`, `.editorconfig`)
- [ ] `server/` mirrors the deployed backend code
- [ ] `README.md` and `INFRA.md` cover everything a new dev needs to know
- [ ] No secrets, tokens, or credentials in the repo
- [ ] `git status` would only stage the source files (no `node_modules`, no `dist`, no build cache)

I check all of these off in the next batch of edits. Then it's all on you for the GitHub repo + Vercel hook-up.
