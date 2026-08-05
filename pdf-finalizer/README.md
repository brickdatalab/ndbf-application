# NDBF PDF Finalizer

Consumes `bank_statement_underwriting_ready` events, validates the immutable
signed source PDF, renders the authoritative BigQuery underwriting read model,
stores a create-only finalized PDF, and then publishes `application_pdf_ready`.

```bash
npm ci --omit=dev
npm start
```

Atomic VM deployment (the tracked `shared` symlink is dereferenced into the
release so the deployed directory is self-contained):

```bash
mkdir -p /opt/ndbf-pdf-finalizer-releases
release_dir="$(mktemp -d /opt/ndbf-pdf-finalizer-releases/release.XXXXXX)"
rsync -aL --delete --exclude node_modules ./pdf-finalizer/ "$release_dir/"
(cd "$release_dir" && npm ci --omit=dev)
ln -s "$release_dir" /opt/ndbf-pdf-finalizer.next
mv -Tf /opt/ndbf-pdf-finalizer.next /opt/ndbf-pdf-finalizer
```

`/opt/ndbf-pdf-finalizer` is the atomically replaced release symlink. Retain the
prior release directory for rollback.

Start or restart only the finalizer after the release symlink is verified:

```bash
cd /opt/ndbf-pdf-finalizer
pm2 start worker.js --name ndbf-pdf-finalizer --time
# For an existing process:
pm2 restart ndbf-pdf-finalizer --update-env
pm2 save
```

Rollback repoints the service to the retained prior release, then restarts only
this process:

```bash
ln -sfn /opt/ndbf-pdf-finalizer-releases/<prior-release> /opt/ndbf-pdf-finalizer.next
mv -Tf /opt/ndbf-pdf-finalizer.next /opt/ndbf-pdf-finalizer
pm2 restart ndbf-pdf-finalizer --update-env
pm2 save
```

Defaults:

- Subscription: `bank-statement-underwriting-pdf-finalizer`
- Output topic: `application-pdf-ready`
- Bucket: `app_banks`
- BigQuery project: `PROJECT_ID` or `lithe-hallway-493420-r4`
- BigQuery dataset: `BQ_DATASET` or `ndbf_applications`

The input subscription is attached to `bank-statement-underwriting-ready`. The
output topic has the retained `application-pdf-ready-monitor` subscription for
operations evidence only. The emailer does not subscribe to either resource;
`submission-completed-emailer` remains the sole email owner.

For an isolated proof, point the exact worker at temporary resources through
`PROJECT_ID`, `BQ_DATASET`, `BUCKET_NAME`, `PDF_FINALIZER_SUBSCRIPTION`, and
`PDF_READY_TOPIC`. Dataset and project identifiers are validated before a query
is constructed, while `entry_id` remains a typed query parameter.

The repository-only proof uses no cloud or SMTP resources:

```bash
npm run test:pdf-pipeline
```

The worker logs stable status codes only. It never logs applicant data,
financial values, account digits, object paths, PDF contents, or credentials.
