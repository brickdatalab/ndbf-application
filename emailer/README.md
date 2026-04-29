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
                                          worker.js  ─┬─▶  fetch BQ row
                                                      ├─▶  list + download files from GCS folder
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
- **Attachments:** the generated application PDF + every bank statement uploaded, as true file attachments. Total capped at ~24MB to stay under Gmail's 25MB limit; oversized statements are skipped with a note in the email body and remain available in GCS.

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
scp -i ~/.ssh/approval-dept emailer/worker.js emailer/package.json \
    vitolo@136.119.104.124:/opt/ndbf-emailer/

ssh -i ~/.ssh/approval-dept vitolo@136.119.104.124 \
    "cd /opt/ndbf-emailer && npm install --omit=dev && pm2 restart ndbf-emailer"
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
