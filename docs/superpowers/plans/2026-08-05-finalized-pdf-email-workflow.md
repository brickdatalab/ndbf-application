# Finalized PDF Email Workflow

For future submissions with bank statements:

```text
Submit and persist
→ show thank-you page
→ vectorize and extract statements
→ calculate underwriting
→ create a second, populated PDF
→ publish application_pdf_ready
→ email that PDF and the declared bank statements
```

Implementation requirements:

- Preserve the original signed PDF unchanged.
- Reuse the existing underwriting views; do not add an aggregate mega-view.
- Defer the initial email event for `underwriting-v1` submissions with bank statements.
- Trigger the representative email only from `application_pdf_ready`.
- Keep immediate email delivery for legacy and zero-bank-statement submissions.
- Use no polling timer or blank-PDF fallback.
- Acknowledge the final email event only after SMTP acceptance.

Acceptance requires the finalizer, emailer, backend, Pub/Sub subscriptions, local tests, production build, deployed hashes, and VM health checks to pass before a live user test.
