# NDBF Email Worker

Decoupled Pub/Sub subscriber that emails Josh + Fab every time a new application lands. Independent process from the main `server/` backend; if it crashes, submissions still succeed.

**Lives on:** the same GCP VM (`approval-dept`) at `/opt/ndbf-emailer/`, run under `pm2`.

## Flow

```
server.js (after BQ insert) ──publish──▶  Pub/Sub topic "submission-completed"
                                            │
                                            ▼
                                          Subscription "submission-completed-emailer"
                                            │
                                            ▼ (Pub/Sub pushes to subscriber)
                                          worker.js  ─┬─▶  fetch authoritative BQ row
                                                      ├─▶  wait up to seven minutes for a valid finalized PDF
                                                      ├─▶  load only the declared PDF and bank-statement keys
                                                      ├─▶  compose email (no clause, no signature)
                                                      └─▶  smtp.gmail.com:587
                                                            │
                                                            ▼
                                                      Josh@theapprovaldept.com,
                                                      fab@theapprovaldept.com
```

Pub/Sub retries up to 5 times with exponential backoff on `nack`. After 5 failures, the message is forwarded to `submission-completed-dead-letter` (or dropped if dead-letter IAM is not yet bound).

## Email content

- **Subject:** `{Business Legal Name} - Submission - MM/DD/YYYY`
- **Body:** every form field from BQ, **phone + email unredacted**. No clause, no signature image.
- **Attachments:** exactly one application PDF plus only the bank-statement objects declared in `bank_statement_gcs_keys`; the worker never lists the submission folder. `underwriting-v1` submissions with statements wait a fixed seven minutes from authoritative `submitted_at` for the validated immutable final PDF, then fall back to the signed source PDF with an internal note. Legacy and zero-bank submissions send immediately. Total attachments remain capped at ~24MB; oversized statements are skipped with a note and remain in GCS.

The original `submission-completed-emailer` message is the sole owner of delivery. Its ACK deadline is extended for at most ten minutes, and it is acknowledged only after SMTP accepts the message. A finalized PDF created after a timeout is retained in GCS and never triggers a second email.

`application-pdf-ready` is an observability event, not an email trigger. Its
`application-pdf-ready-monitor` subscription must never be handled by this
worker, and no second email subscription may be created. This preserves one
send owner and makes a late finalization incapable of sending a duplicate.

## Environment variables (set in `pm2` ecosystem file or via systemd env)

| Var | Required | Default |
|---|---|---|
| `PROJECT_ID` | no | `lithe-hallway-493420-r4` |
| `BUCKET_NAME` | no | `app_banks` |
| `BQ_DATASET` | no | `ndbf_applications` |
| `BQ_TABLE` | no | `submissions` |
| `SUBSCRIPTION` | no | `submission-completed-emailer` |
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
