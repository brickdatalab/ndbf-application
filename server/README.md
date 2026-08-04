# NDBF Backend

Node 20 + Express service. Receives multipart submissions from the frontend, writes uploaded files + the generated PDF to GCS, and inserts one row into BigQuery per application.

**This code is deployed on the GCP VM `approval-dept`** (not Vercel). Vercel ignores this folder — see the project's `.vercelignore`.

## Where it runs in production

- VM: `approval-dept` in `us-central1-f`
- External IP (static): `136.119.104.124`
- Public URL: `https://136-119-104-124.nip.io` → eventually `https://api.nextdaybizfunding.com`
- Process manager: `pm2` (auto-restart on crash, survives reboot via `pm2 save`)
- TLS: Caddy fronts pm2, auto-issues Let's Encrypt certs

## Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | JSON health probe (project, bucket, dataset, table) |
| `GET` | `/` | Same shape as `/health` minus details |
| `POST` | `/api/submit` | Multipart submission: `payload` (JSON), `pdf` (file), `banks` (file[]) |

On `POST /api/submit` the server:

1. Generates a server-side `entry_id` (`ndbf_xxxxxxxx`).
2. Slugifies the legal business name → folder key `{slug}_{entry_id}/`.
3. Uploads the PDF and every bank statement to `gs://app_banks/{folder}/` in parallel.
4. Inserts one row into `ndbf_applications.submissions` with all form fields, GCS paths, UTM/ref/IP/UA, and the raw payload JSON excluding only the duplicate base64 signature image. The signed PDF remains the authoritative signature artifact in GCS.
5. Returns `{ ok, entryId, submittedAt, gcsFolder, bankCount, pdfStored }`.

## Local dev

You shouldn't need to run this locally — production is the only place it makes sense. But if you do:

```bash
cd server
npm install
PROJECT_ID=lithe-hallway-493420-r4 \
  BUCKET_NAME=app_banks \
  BQ_DATASET=ndbf_applications \
  BQ_TABLE=submissions \
  PORT=8080 \
  npm start
```

You'll need application-default credentials (`gcloud auth application-default login`) for GCS + BQ writes to succeed.

## Updating the deployed backend

The backend on the VM is the source of truth at runtime, but this folder is the source of truth in version control. To push a change:

```bash
# From your Mac, with this repo's working tree:
scp -i ~/.ssh/approval-dept server/server.js server/package.json vitolo@136.119.104.124:/opt/ndbf-backend/

ssh -i ~/.ssh/approval-dept vitolo@136.119.104.124 \
  "cd /opt/ndbf-backend && npm install --omit=dev && pm2 restart ndbf-backend"
```

`pm2 restart` does a graceful restart — production traffic blip is sub-second.

## Environment variables (all optional, defaults are correct)

| Var | Default | Purpose |
|---|---|---|
| `PROJECT_ID` | `lithe-hallway-493420-r4` | GCP project |
| `BUCKET_NAME` | `app_banks` | GCS bucket for files |
| `BQ_DATASET` | `ndbf_applications` | BQ dataset |
| `BQ_TABLE` | `submissions` | BQ table |
| `PORT` | `8080` | TCP port (Caddy proxies to this) |

## Auth

Uses Application Default Credentials. On the VM, that's the attached service account (`764035945070-compute@developer.gserviceaccount.com`) which currently has `cloud-platform` scope. Future: scope down to least privilege (`storage.objectAdmin` on the bucket + `bigquery.dataEditor` on the dataset).
