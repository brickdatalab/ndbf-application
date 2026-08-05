# Task 4 report

Status: DONE

Implemented the seven-minute, single-owner email gate on the existing
`submission-completed-emailer` subscription. The subscriber now limits itself
to five messages, rejects excess in-memory delivery, and extends leases for at
most ten minutes. The fixed 420-second deadline is always derived from the
authoritative BigQuery `submitted_at`, including after process restarts.

For `underwriting-v1` submissions with bank statements, the original message
polls every ten seconds and performs a separate final check at the deadline.
It sends the immutable finalized PDF as soon as its expected object name,
fingerprint, custom metadata, GCS generation, content type, and SHA-256 all
validate. Otherwise it sends the pinned signed source PDF with one concise
internal timeout note. Legacy `NULL` and zero-bank submissions send immediately;
unsupported non-null versions fail closed.

Attachment discovery was removed. Each email contains one application PDF and
only objects named in `bank_statement_gcs_keys`, in stored order, subject to the
existing 24 MB safety limit. The original message remains the only delivery
owner, and it acknowledges only after SMTP acceptance, so a later finalization
cannot produce a second email. Nicole routing, recipients, subject, body,
SMTP configuration, and size behavior remain intact. Runtime logs contain only
opaque identifiers, counts, and stable status/error codes.

Files:

- `emailer/delivery-gate.js`
- `emailer/delivery-gate.node-test.js`
- `emailer/worker.js`
- `emailer/README.md`
- `emailer/package-lock.json`

Verification:

- `cd emailer && npm ci` — passed.
- `cd emailer && npm test` — 14 passed, 0 failed.
- `node --check worker.js` — passed.
- `node --check delivery-gate.js` — passed.
- `git diff --check -- emailer` — passed.
- No production BigQuery, GCS, Pub/Sub, SMTP, VM, Vercel, credential, or
  environment operation was performed.

Coverage includes bounded flow control, side-effect-free import, zero-bank,
legacy, immediate finalization, accelerated timeout, final pre-fallback race,
restart-safe deadline, unsupported versions, strict final artifact validation,
explicit attachments, SMTP redelivery, Nicole routing, and no second email.

Operational note: the clean npm install reports the dependency tree's existing
UUID deprecation warning and 10 audit findings (9 moderate, 1 high). No
dependency upgrades were made because they are outside this focused delivery
gate and would change the production dependency surface.
