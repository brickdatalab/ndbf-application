# NDBF Email Worker

Decoupled Pub/Sub subscriber that emails Josh + Fab every time a new application lands. Independent process from the main `server/` backend; if it crashes, submissions still succeed.

**Lives on:** the same GCP VM (`approval-dept`) at `/opt/ndbf-emailer/`, run under `pm2`.

## Flow

```
submission-completed ──▶ submission-completed-emailer ──▶ load source PDF ──▶ SMTP
application-pdf-ready ─▶ application-pdf-ready-emailer ─▶ ack only (no duplicate email)
```

Email delivery is deliberately decoupled from the AI underwriting pipeline. Every
submission — versioned or legacy, with or without bank statements — is emailed
immediately from `submission-completed` using the source PDF uploaded at submit
time (integrity-checked against `pdf_source_generation` + `pdf_source_sha256`).
The finalized `underwritten-v1` PDF remains an enrichment persisted to GCS and
never gates notification.

Pub/Sub retries up to 5 times with exponential backoff on `nack`. After 5 failures, the message is forwarded to `submission-completed-dead-letter` (or dropped if dead-letter IAM is not yet bound).

## Email content

- **Subject:** `{Business Legal Name} - Submission - MM/DD/YYYY`
- **Body:** every form field from BQ, **phone + email unredacted**. No clause, no signature image.
- **Attachments:** exactly one application PDF plus only the bank-statement objects declared in `bank_statement_gcs_keys`; the worker never lists the submission folder. All submissions send immediately from the submission event using the source PDF. Total attachments remain capped at ~24MB.

The submission event owns delivery for every submission. `application-pdf-ready-emailer`
acknowledges finalized-PDF events without emailing, so underwriters receive exactly
one alert per application.

## Environment variables (set in `pm2` ecosystem file or via systemd env)

| Var | Required | Default |
|---|---|---|
| `PROJECT_ID` | no | `lithe-hallway-493420-r4` |
| `BUCKET_NAME` | no | `app_banks` |
| `BQ_DATASET` | no | `ndbf_applications` |
| `BQ_TABLE` | no | `submissions` |
| `SUBSCRIPTION` | no | `submission-completed-emailer` |
| `PDF_READY_EMAIL_SUBSCRIPTION` | no | `application-pdf-ready-emailer` |
| `SMTP_HOST` | no | `smtp.gmail.com` |
| `SMTP_PORT` | no | `587` |
| `SMTP_USER` | **yes** | (sender Gmail address) |
| `SMTP_PASS` | **yes** | (Google App Password — 16 chars) |
| `FROM` | no | `NextDay Biz Funding <SMTP_USER>` |
| `EMAIL_TO` | no | `Josh@theapprovaldept.com,fab@theapprovaldept.com` |

## Deploying changes

```bash
# from your Mac, with the repo working tree
scp -i ~/.ssh/approval-dept emailer/worker.js emailer/delivery-gate.js \
    emailer/recipient-routing.js emailer/package.json \
    vitolo@136.119.104.124:/opt/ndbf-emailer/

ssh -i ~/.ssh/approval-dept vitolo@136.119.104.124 \
    "cd /opt/ndbf-emailer && npm install --omit=dev && pm2 restart ndbf-emailer"
```

For an atomic deployment, copy into a timestamped release directory, repoint
`/opt/ndbf-emailer`, restart only `ndbf-emailer`, and retain the prior target.
Rollback repoints that symlink to the retained release and runs:

```bash
pm2 restart ndbf-emailer --update-env
pm2 save
```

The repository's accelerated fallback proof replaces SMTP with an in-memory
boundary:

```bash
cd /path/to/ndbf-application-demo
npm run test:pdf-pipeline
```

## Test it

Publish a synthetic message for a known recent `entry_id`:

```bash
ssh -i ~/.ssh/approval-dept vitolo@136.119.104.124 \
  "gcloud pubsub topics publish submission-completed \
     --message='{\"entry_id\":\"ndbf_xxxxxxxx\"}'"
```

Tail logs:

```bash
ssh -i ~/.ssh/approval-dept vitolo@136.119.104.124 "pm2 logs ndbf-emailer --lines 50 --nostream"
```
