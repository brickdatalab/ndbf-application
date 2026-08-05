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

Defaults:

- Subscription: `bank-statement-underwriting-pdf-finalizer`
- Output topic: `application-pdf-ready`
- Bucket: `app_banks`

The worker logs stable status codes only. It never logs applicant data,
financial values, account digits, object paths, PDF contents, or credentials.
