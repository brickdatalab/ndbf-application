# NDBF Infrastructure — Reproducible Setup

Everything that's currently provisioned in `lithe-hallway-493420-r4`. Use this doc to rebuild any piece from scratch (e.g. swap to a new VM, fork to a staging environment).

## 1. GCP Project

| Field | Value |
|---|---|
| Project ID | `lithe-hallway-493420-r4` |
| Region | `us-central1` |
| Zone (VM) | `us-central1-f` |

## 2. Compute — VM `approval-dept`

```
gcloud compute instances create approval-dept \
  --project=lithe-hallway-493420-r4 \
  --zone=us-central1-f \
  --machine-type=e2-standard-2 \
  --network-interface=network-tier=PREMIUM,stack-type=IPV4_ONLY,subnet=default \
  --maintenance-policy=MIGRATE \
  --service-account=764035945070-compute@developer.gserviceaccount.com \
  --scopes=https://www.googleapis.com/auth/cloud-platform \
  --tags=http-server,https-server \
  --create-disk=auto-delete=yes,boot=yes,image=projects/debian-cloud/global/images/family/debian-12,size=10,type=pd-balanced \
  --shielded-vtpm \
  --shielded-integrity-monitoring
```

| Field | Value |
|---|---|
| Machine type | `e2-standard-2` (2 vCPU, 8 GB RAM) |
| Disk | 10 GB balanced PD, Debian 12 (bookworm) |
| OS | Debian 12, kernel 6.1 |
| Static external IP | `136.119.104.124` (reserved as `approval-dept-ip` in `us-central1`) |
| Tags | `http-server`, `https-server` |
| Service account | `764035945070-compute@developer.gserviceaccount.com` (default compute SA) with full `cloud-platform` scope (TODO: scope down post-launch) |

### Reserve static IP (already done)

```
gcloud compute addresses create approval-dept-ip \
  --addresses=136.119.104.124 \
  --region=us-central1
```

## 3. Firewall rules

The default VPC was missing the http/https rules — both were created manually:

```
gcloud compute firewall-rules create default-allow-http \
  --network=default --direction=INGRESS --priority=1000 --action=ALLOW \
  --rules=tcp:80 --source-ranges=0.0.0.0/0 --target-tags=http-server

gcloud compute firewall-rules create default-allow-https \
  --network=default --direction=INGRESS --priority=1000 --action=ALLOW \
  --rules=tcp:443 --source-ranges=0.0.0.0/0 --target-tags=https-server
```

`tcp:22` (SSH) is already open via `default-allow-ssh`.

## 4. SSH access

Two keys authorized on the VM (both as Linux user `vitolo`):

- **Vincent's local key:** `~/.ssh/approval-dept` on his Mac (added via the metadata `ssh-keys` field at VM creation time)
- **Sandbox key (Claude):** appended to `~vitolo/.ssh/authorized_keys` for hands-off automation

```bash
# Vincent's Mac:
ssh -i ~/.ssh/approval-dept vitolo@136.119.104.124
```

## 5. Cloud Storage — bucket `app_banks`

Bucket already existed in the project. No special config — default settings work for this volume. Each submission writes a new folder:

```
gs://app_banks/
├── {slug(legal_business_name)}_{entry_id}/
│   ├── {slug}_{entry_id}.pdf          # generated application PDF
│   ├── bank_01_<original_filename>    # bank statements, prefixed for sort order
│   ├── bank_02_<original_filename>
│   └── ...
```

`{entry_id}` is a server-generated short nanoid like `ndbf_kgt3t543`. `{slug}` is a URL-safe lowercase rendering of the legal business name (max 60 chars).

## 6. BigQuery — dataset `ndbf_applications`, table `submissions`

```sql
CREATE SCHEMA IF NOT EXISTS `lithe-hallway-493420-r4.ndbf_applications`
OPTIONS(location = "US");

CREATE TABLE IF NOT EXISTS `lithe-hallway-493420-r4.ndbf_applications.submissions` (
  -- Metadata
  entry_id STRING NOT NULL,
  submitted_at TIMESTAMP NOT NULL,
  app_param STRING,
  utm_source STRING,
  utm_medium STRING,
  utm_campaign STRING,
  utm_term STRING,
  utm_content STRING,
  referrer STRING,
  ip_address STRING,
  user_agent STRING,

  -- Contact (Part 1)
  contact_name STRING,
  contact_email STRING,
  contact_phone STRING,

  -- Business (Part 2)
  business_legal_name STRING,
  dba STRING,
  business_physical_street STRING,
  business_physical_city STRING,
  business_physical_state STRING,
  business_physical_zip STRING,
  industry STRING,
  industry_other STRING,
  state_of_incorporation STRING,
  business_started_month INT64,
  business_started_year INT64,
  federal_tax_id STRING,
  business_entity_type STRING,
  gross_annual_sales_bucket STRING,
  requested_funding_amount NUMERIC,

  -- Ownership (Part 3, single owner)
  owner_full_name STRING,
  owner_ownership_percentage INT64,
  owner_ssn STRING,
  owner_dob DATE,
  owner_address_street STRING,
  owner_address_city STRING,
  owner_address_state STRING,
  owner_address_zip STRING,

  -- Files (Part 4 + generated PDF)
  bank_statement_gcs_keys ARRAY<STRING>,
  pdf_gcs_key STRING,
  gcs_folder STRING,

  -- Signature (Part 5)
  signature_captured BOOL,
  terms_accepted BOOL,

  -- Raw payload for schema-evolution safety; excludes the duplicate base64
  -- signature image, which remains embedded in the signed PDF stored in GCS.
  raw_payload_json STRING
)
PARTITION BY DATE(submitted_at)
CLUSTER BY app_param, business_legal_name;
```

### Future bank-statement vector index

The independent `/opt/ndbf-vectorizer` worker consumes a new subscription on
`submission-completed`. It uploads only bank-statement PDFs from future
submissions to the configured OpenAI vector store, using 800-token chunks with
400-token overlap. The generated application PDF is excluded.

Each PDF has one lookup row in
`ndbf_applications.submission_documents`, keyed by an opaque deterministic
`document_id` and linked to the parent `entry_id`, GCS URI, OpenAI file ID, and
indexing status. No historical documents are backfilled automatically.

The external extraction agent writes one nested row per PDF to
`ndbf_applications.bank_statement_agent_extractions`. BigQuery immediately
exposes deterministic per-document calculations through
`bank_statement_calculated` and submission-wide underwriting totals through
`submission_bank_statement_summary`. A canonical extraction view prevents retry
fan-out, and the versioned underwriting views calculate true deposits, daily
balances, MCA positions, missed payments, and submission-level status without
exposing account numbers or raw descriptions at the final retrieval boundary.

After all expected PDFs are visible, `ndbf-extraction-worker` publishes a
privacy-safe, at-least-once event to `bank-statement-underwriting-ready`.
Downstream consumers deduplicate with its stable `event_key`; the retained
`bank-statement-underwriting-ready-monitor` subscription holds events until a
relay consumer is connected. The agent posting contract and table ID are
documented in `vectorizer/BANK_STATEMENT_EXTRACTION_CONTRACT.md`.

### Underwritten application PDF finalizer

The finalizer consumes the existing `bank-statement-underwriting-ready` topic
through one dedicated subscription, writes an immutable populated application
PDF, and publishes a privacy-safe completion event. These commands describe the
required resources; run them only during an authorized production rollout:

```bash
gcloud pubsub topics create application-pdf-ready
gcloud pubsub subscriptions create bank-statement-underwriting-pdf-finalizer \
  --topic=bank-statement-underwriting-ready \
  --ack-deadline=600 \
  --message-retention-duration=7d \
  --expiration-period=never
gcloud pubsub subscriptions create application-pdf-ready-emailer \
  --topic=application-pdf-ready \
  --ack-deadline=60 \
  --message-retention-duration=7d \
  --expiration-period=never
```

For versioned submissions with bank statements, `submission-completed-emailer`
defers without sending. `application-pdf-ready-emailer` sends only after the
finalizer stores and publishes the completed PDF. There is no polling deadline
or blank-PDF fallback.

Deploy the self-contained finalizer to a timestamped release, atomically repoint
`/opt/ndbf-pdf-finalizer`, then start it under PM2:

```bash
mkdir -p /opt/ndbf-pdf-finalizer-releases
release_dir="$(mktemp -d /opt/ndbf-pdf-finalizer-releases/release.XXXXXX)"
rsync -aL --delete --exclude node_modules ./pdf-finalizer/ "$release_dir/"
(cd "$release_dir" && npm ci --omit=dev)
ln -sfn "$release_dir" /opt/ndbf-pdf-finalizer.next
mv -Tf /opt/ndbf-pdf-finalizer.next /opt/ndbf-pdf-finalizer
cd /opt/ndbf-pdf-finalizer
pm2 start worker.js --name ndbf-pdf-finalizer --time
pm2 save
```

Production defaults are project `lithe-hallway-493420-r4`, dataset
`ndbf_applications`, bucket `app_banks`, input subscription
`bank-statement-underwriting-pdf-finalizer`, and output topic
`application-pdf-ready`. Temporary isolated resources use the same worker by
overriding `PROJECT_ID`, `BQ_DATASET`, `BUCKET_NAME`,
`PDF_FINALIZER_SUBSCRIPTION`, and `PDF_READY_TOPIC`; the BigQuery lookup remains
parameterized by `entry_id`.

Rollback repoints `/opt/ndbf-pdf-finalizer` to the retained prior release and
restarts only `ndbf-pdf-finalizer`. If resource rollback is explicitly required,
delete only the two finalizer-created subscriptions and `application-pdf-ready`;
never delete the pre-existing underwriting-ready topic or email subscription.

## 7. Software stack on the VM

Pre-installed (ships with GCE Debian image):
- gcloud SDK 565.0.0, gsutil 5.36, bq 2.1.31

Installed by us:
- Node 20 LTS (NodeSource repo) — `node v20.x`, `npm 10.x`
- pm2 6.x globally (`sudo npm install -g pm2`)
- Caddy 2.11.x (Cloudsmith stable repo) — see Caddyfile below

## 8. Backend service — `/opt/ndbf-backend/`

Source: this repo's `server/` folder.

```
/opt/ndbf-backend/
├── package.json
├── server.js
└── node_modules/    # installed via `npm install --omit=dev`
```

Started under pm2:

```bash
cd /opt/ndbf-backend
pm2 start server.js --name ndbf-backend --time
pm2 save
sudo pm2 startup systemd -u vitolo --hp /home/vitolo
```

Listens on `0.0.0.0:8080`. Caddy reverse-proxies to it.

## 9. Caddy — TLS + reverse proxy

`/etc/caddy/Caddyfile`:

```
api.nextdaybizfunding.com, 136-119-104-124.nip.io {
    encode zstd gzip
    reverse_proxy localhost:8080 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
    }
    request_body { max_size 200MB }
}

:80 {
    @healthOnly path /health /
    reverse_proxy @healthOnly localhost:8080
    respond 404
}
```

Auto-issues Let's Encrypt certs:
- `136-119-104-124.nip.io` — already issued
- `api.nextdaybizfunding.com` — issues automatically the moment DNS resolves to `136.119.104.124`

Runs as systemd service `caddy.service` (enabled, auto-starts on boot).

## 10. DNS records the client needs to add

| Record | Type | Host | Value |
|---|---|---|---|
| Backend API | A | `api` | `136.119.104.124` |
| Frontend | CNAME | `application` | `cname.vercel-dns.com` |

Both must be DNS-only (grey cloud) if Cloudflare-managed. After both are valid, proxy can be re-enabled.

## 11. Verifying it all works

```bash
# Backend health
curl -sS https://136-119-104-124.nip.io/health

# Confirm a row landed in BQ (after a real submission)
bq query --use_legacy_sql=false \
  'SELECT entry_id, contact_name, business_legal_name FROM `lithe-hallway-493420-r4.ndbf_applications.submissions` ORDER BY submitted_at DESC LIMIT 5'

# Confirm files landed in GCS
gsutil ls -r gs://app_banks/

# Backend logs (pm2)
ssh -i ~/.ssh/approval-dept vitolo@136.119.104.124 "pm2 logs ndbf-backend --lines 50 --nostream"

# Caddy / TLS logs
ssh -i ~/.ssh/approval-dept vitolo@136.119.104.124 "sudo journalctl -u caddy --no-pager -n 50"
```

## 12. Costs (rough)

| Item | Monthly |
|---|---|
| `e2-standard-2` VM (24/7) | ~$50 |
| 10 GB balanced PD | ~$1 |
| Static IP (in use) | $0 (free while attached to a running VM) |
| GCS `app_banks` storage | $0.02/GB/month |
| BigQuery storage (active) | $0.02/GB/month after free tier |
| BigQuery query | $5/TB (query volume here is trivial) |
| Vercel (Hobby tier) | $0 |

Realistic monthly: ~$55 total at low volume. If volume justifies it, downsize the VM to `e2-small` (~$15/mo) — backend load is tiny.
