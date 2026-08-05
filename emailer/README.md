# NDBF Email Worker

Decoupled Pub/Sub subscriber that emails Josh + Fab every time a new application lands. Independent process from the main `server/` backend; if it crashes, submissions still succeed.

**Lives on:** the same GCP VM (`approval-dept`) at `/opt/ndbf-emailer/`, run under `pm2`.

## Flow

```
submission-completed ──▶ submission-completed-emailer ──▶ defer when bank statements exist
application-pdf-ready ─▶ application-pdf-ready-emailer ─▶ validate finalized PDF ─▶ SMTP
```

Pub/Sub retries up to 5 times with exponential backoff on `nack`. After 5 failures, the message is forwarded to `submission-completed-dead-letter` (or dropped if dead-letter IAM is not yet bound).

## Email content

- **Subject:** `{Business Legal Name} - Submission - MM/DD/YYYY`
- **Body:** every form field from BQ, **phone + email unredacted**. No clause, no signature image.
- **Attachments:** exactly one application PDF plus only the bank-statement objects declared in `bank_statement_gcs_keys`; the worker never lists the submission folder. `underwriting-v1` submissions with statements are emailed only from the finalized-PDF event. Legacy and zero-bank submissions send immediately. Total attachments remain capped at ~24MB.

The initial submission event owns immediate legacy/zero-bank delivery. For a
versioned bank-statement submission it only defers; `application-pdf-ready-emailer`
then owns the finalized delivery and acknowledges only after SMTP accepts it.

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
