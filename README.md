# NextDay Biz Funding — Application

Five-step business-funding application. Vite + React + TypeScript frontend on Vercel; Node/Express backend on a GCP VM that writes to Google Cloud Storage + BigQuery.

Live URLs:

- **Frontend:** `https://application.nextdaybizfunding.com` (live)
- **Backend API:** `https://136-119-104-124.nip.io` — what production actually calls.
  `https://api.nextdaybizfunding.com` resolves and serves the same backend, but
  `VITE_API_URL` in Vercel has not been switched over.

When a user fills out the form and clicks Submit:

1. The PDF is generated client-side (with the full T&C clause + embedded signature).
2. Frontend POSTs `payload` (JSON) + `pdf` (Blob) + `banks` (file[]) to the backend.
3. Backend uploads everything to `gs://app_banks/{slug(business_legal_name)}_{entry_id}/`.
4. Backend inserts one row into `ndbf_applications.submissions` in BigQuery.
5. User sees a confirmation screen with their real `entry_id`.
6. Backend publishes to `submission-completed`; `ndbf-emailer` on the VM emails the
   underwriters the signed PDF plus every bank statement, then POSTs the full
   BigQuery row to the ClearScrub Flow webhook. See `emailer/README.md`.

## Repo layout

```
ndbf-application-demo/
├── public/                     # Static assets (logo)
├── src/                        # Frontend
│   ├── components/             # Layout, Stepper, SignaturePad, AddressAutocomplete, FileUpload, etc.
│   │   └── ui/                 # Button, Input, FormField primitives
│   ├── steps/                  # ContactInfo, BusinessInfo, OwnershipDetails, BankStatements, SignSubmit, Confirmation
│   ├── lib/                    # analytics, attribution, prefill, PDF, constants, and utilities
│   ├── store.ts                # Zustand store with per-tab sessionStorage persistence
│   └── ...
├── server/                     # Backend mirror (deployed to VM, not Vercel)
│   ├── server.js               # Express app
│   ├── package.json
│   └── README.md
├── INFRA.md                    # Full GCP / VM / Caddy / BQ / GCS setup, reproducible from scratch
├── PRE-PROD-PLAN.md            # Pre-prod cleanup + cutover plan
├── vercel.json                 # Vite framework hint, SPA rewrite, security headers
├── tailwind.config.js          # NDBF brand tokens (navy / blue / orange CTA)
├── tsconfig.json
├── vite.config.ts
└── package.json
```

## Local development

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173`.

By default the local app submits to the production backend (`https://136-119-104-124.nip.io`) — real submissions land in production BigQuery. To run against a different backend, copy `.env.example` to `.env.local` and edit `VITE_API_URL`.

Test rep-attribution: open `http://localhost:5173/?app=rep-vincent` — the `app`
parameter flows into the submission payload and analytics.

### Link attribution and prefill

The application captures `app`, `utm_id`, `utm_source`, `utm_medium`,
`utm_campaign`, `utm_content`, `utm_term`, and `utm_source_platform`. Safe
attribution is retained for 30 days in `ndbf-attribution-v1`; a later bare
application URL restores the latest non-expired values. Existing submission
attribution remains limited to `app` plus the established standard UTM fields,
while `utm_id` and `utm_source_platform` are analytics-only.

The application also maps these URL parameters into editable application fields
on page load:

| URL parameter | Application field |
|---|---|
| `first_name` + `last_name` | Full Name (preferred) |
| `full_name` | Full Name (fallback) |
| `email` | Email Address |
| `phone` | Phone Number |
| `business_legal_name` | Legal Business Name |

Example:

```text
https://ndbf-application.vercel.app/?app=nicole&utm_source=mailgun&first_name=Jim&last_name=&email=jim%40example.com&phone=5555550100&business_legal_name=Jim%27s%20Gym
```

`first_name` and `last_name` are trimmed and joined when either is present;
`full_name` is used only when both are absent. Phone values use the same
`(XXX) XXX-XXXX` format as manual entry. All populated values remain editable.
PII-prefill and recipient-level parameters are removed with
`history.replaceState` before GTM loads.

### Hidden underwriting parameters

Added 2026-09-02 (`src/lib/underwriting.ts`). Five values a rep puts in the link.
They are **not** form fields — nothing is rendered, nothing is editable, and the
applicant never sees them. All five are optional strings, kept in session state
for the length of the visit, and scrubbed from the URL with the PII prefill
params before GTM loads.

| URL parameter | PDF label | Max length |
|---|---|---|
| `avg_monthly_deposits` | AVG MONTHLY DEPOSITS | 100 |
| `total_mca_debits` | TOTAL MCA DEBITS | 100 |
| `avg_balance` | AVG BALANCE | 100 |
| `avg_negative_balance_days` | AVG NEGATIVE BALANCE DAYS | 100 |
| `open_mca` | OPEN MCA | 400 |

Each populated value gets a line in a new "Underwriting" section of the generated
PDF, placed after "Bank Statements"; a value that is absent or blank is omitted,
and the section itself is omitted when all five are. Values over the cap are
truncated, not rejected. Each also lands in its own `STRING` column in
`ndbf_applications.submissions` and therefore in the submission webhook payload.
The alert email body is unchanged.

`n8n-build-url-code-node.js` in the workspace root is the n8n Code node that
builds these links: it drops absent keys, rounds the four numeric values to whole
numbers, reduces the phone to ten digits, and cuts `open_mca` to 400 characters.

## Analytics

The application dynamically loads GTM container `GTM-N9WZSDXR` only after URL
prefill sanitation. The container sends privacy-safe application journey events
to GA4 measurement ID `G-BSXPQ0QP2B`. Analytics events contain safe attribution,
step numbers and controlled step/error categories only—never form values,
application IDs, contact IDs, recipient IDs, message IDs, or backend responses.

`generate_lead` is queued only after the submission API returns a successful
response. Do not submit a production application to test analytics; use the
mocked-success unit test and a synthetic GTM Preview event.

## Brand tokens

The application uses these brand tokens:

- Navy `#002140`, blues `#0075DF` / `#0057A8` / `#0F447A`, orange CTA `#FF6600`
- Fonts: Inter (body), DM Sans (headings) — both loaded from Google Fonts in `index.html`

## Deployment

Vercel auto-deploys on every push to the connected branch.

| Branch | Vercel deploy |
|---|---|
| `main` | Production (`<project>.vercel.app` + custom domain) |
| any other | Preview (unique URL per commit) |

### Vercel project settings

- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variables (Production + Preview + Development):**
  - `VITE_API_URL` = `https://136-119-104-124.nip.io` *(swap to `https://api.nextdaybizfunding.com` after DNS)*

### Custom domain (post-DNS)

Once the client adds the CNAME for `application.nextdaybizfunding.com`, add the domain in Vercel → Project Settings → Domains. Vercel will verify and provision the cert automatically.

## What the data looks like

### BigQuery — `ndbf_applications.submissions`

One row per submission. Partitioned by `DATE(submitted_at)`, clustered by `app_param`, `business_legal_name`. Full schema is in `INFRA.md`. Quick check:

```bash
bq query --use_legacy_sql=false \
  'SELECT entry_id, contact_name, business_legal_name, app_param, submitted_at
   FROM `lithe-hallway-493420-r4.ndbf_applications.submissions`
   ORDER BY submitted_at DESC LIMIT 5'
```

### GCS — `gs://app_banks/{slug}_{entry_id}/`

Each submission writes its own folder. Inside:

- `{slug}_{entry_id}.pdf` — the generated application PDF (with clause + signature, contact phone/email redacted)
- `bank_01_*.pdf`, `bank_02_*.pdf`, … — uploaded bank statements (original filenames sanitized)

```bash
gsutil ls -r gs://app_banks/
```

## Backend updates

The backend code in `server/` is the source of truth in version control. To push a change to the running VM, see `server/README.md`. Production traffic blip on `pm2 restart` is sub-second.

## DNS records the client still needs to add

Both records — see `PRE-PROD-PLAN.md` §5.

| Record | Type | Host | Value |
|---|---|---|---|
| API | A | `api` | `136.119.104.124` |
| App | CNAME | `application` | `cname.vercel-dns.com` |
