# NDBF PDF Finalizer

Consumes `bank_statement_underwriting_ready` events, validates the immutable
signed source PDF, renders the authoritative BigQuery underwriting read model,
stores a create-only finalized PDF, and then publishes `application_pdf_ready`.

```bash
npm ci --omit=dev
npm start
```

Defaults:

- Subscription: `bank-statement-underwriting-pdf-finalizer`
- Output topic: `application-pdf-ready`
- Bucket: `app_banks`

The worker logs stable status codes only. It never logs applicant data,
financial values, account digits, object paths, PDF contents, or credentials.
