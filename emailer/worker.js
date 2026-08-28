// NDBF email worker.
//
// Subscribes to the submission and finalized-PDF Pub/Sub topics. For each message:
//   1. Fetches the BigQuery row by entry_id.
//   2. Defers versioned bank-statement submissions until the finalized-PDF event.
//   3. Composes an email with every form field unredacted (phone + email shown
//      in full) and attaches only the declared PDF + bank statement objects.
//   4. Sends via Gmail SMTP (App Password auth) to the recipients in EMAIL_TO.
//
// This service is intentionally decoupled from the main backend — if it crashes
// or the SMTP relay rejects a message, submissions still succeed end-to-end.
// Pub/Sub handles redelivery and dead-letter routing.

import { PubSub } from "@google-cloud/pubsub";
import { Storage } from "@google-cloud/storage";
import { BigQuery } from "@google-cloud/bigquery";
import nodemailer from "nodemailer";
import { pathToFileURL } from "node:url";
import {
  SUBSCRIBER_FLOW_CONTROL,
  createExplicitAttachmentLoader,
  createFinalArtifactResolver,
  createMessageHandler,
  createSourcePdfLoader,
  parseGsUri,
} from "./delivery-gate.js";

// ---------- Config ----------

const PROJECT_ID = process.env.PROJECT_ID || "lithe-hallway-493420-r4";
const BUCKET_NAME = process.env.BUCKET_NAME || "app_banks";
const BQ_DATASET = process.env.BQ_DATASET || "ndbf_applications";
const BQ_TABLE = process.env.BQ_TABLE || "submissions";
const SUBMISSION_SUBSCRIPTION = process.env.SUBSCRIPTION || "submission-completed-emailer";
const PDF_READY_SUBSCRIPTION =
  process.env.PDF_READY_EMAIL_SUBSCRIPTION || "application-pdf-ready-emailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const FROM = process.env.FROM || `NextDay Biz Funding <${SMTP_USER}>`;
// vincent@ included for live testing — easy to remove from the default later.
const EMAIL_TO = (
  process.env.EMAIL_TO ||
  "Josh@theapprovaldept.com,fab@theapprovaldept.com,vincent@theapprovaldept.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const MAX_TOTAL_ATTACHMENT_BYTES = 24 * 1024 * 1024; // ~24MB safety margin under Gmail's 25MB cap

// ---------- Helpers ----------

const SALES_BUCKET_LABELS = {
  gt_5m: "Greater than $5M",
  "1m_5m": "$1M – $5M",
  "500k_1m": "$500K – $1M",
  "100k_500k": "$100K – $500K",
  lt_100k: "Less than $100K",
};

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtUSD(n) {
  if (n === null || n === undefined || n === "") return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return "$" + num.toLocaleString("en-US");
}

function fmtBQDateTime(v) {
  if (!v) return "—";
  // BigQuery returns timestamps as { value: '2026-04-29T15:30:00.000Z' } via the client lib
  const iso = typeof v === "object" && v.value ? v.value : v;
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(iso);
  }
}

function fmtBQDate(v) {
  if (!v) return "—";
  const iso = typeof v === "object" && v.value ? v.value : v;
  return String(iso);
}

function shortDate(v) {
  if (!v) return new Date().toLocaleDateString("en-US");
  const iso = typeof v === "object" && v.value ? v.value : v;
  try {
    return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York" });
  } catch {
    return String(iso);
  }
}

function strOrDash(v) {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s.length ? s : "—";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchBqRow(bigquery, entryId) {
  const sql = `
    SELECT *
    FROM \`${PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE}\`
    WHERE entry_id = @entry_id
    ORDER BY submitted_at DESC
    LIMIT 1
  `;
  const [rows] = await bigquery.query({
    query: sql,
    params: { entry_id: entryId },
  });
  return rows[0] || null;
}

function isNotFound(error) {
  return error?.code === 404;
}

async function readObject(bucket, uri, { expectedGeneration, allowNotFound = false } = {}) {
  const { objectName } = parseGsUri(uri, BUCKET_NAME);
  let generation = expectedGeneration ? String(expectedGeneration) : null;
  try {
    if (!generation) {
      const [latestMetadata] = await bucket.file(objectName).getMetadata();
      generation = String(latestMetadata.generation ?? "");
    }
    const pinned = bucket.file(objectName, { generation });
    const [[buffer], [metadata]] = await Promise.all([
      pinned.download({ validation: "crc32c" }),
      pinned.getMetadata(),
    ]);
    if (String(metadata.generation ?? "") !== generation) {
      throw new Error("GCS_GENERATION_CHANGED");
    }
    return {
      uri,
      objectName,
      buffer,
      generation,
      contentType: metadata.contentType || "application/octet-stream",
      metadata: metadata.metadata ?? {},
    };
  } catch (error) {
    if (allowNotFound && isNotFound(error)) return null;
    throw error;
  }
}

/**
 * Build the email subject + body + attachments from a BigQuery row.
 */
export function composeEmail(
  row,
  { truncated = false, attachments = [] } = {},
) {
  const businessName = strOrDash(row.business_legal_name);
  const dateStr = shortDate(row.submitted_at);
  const subject = `${businessName} - Submission - ${dateStr}`;

  // ---- Resolve nicer labels ----
  const industry =
    row.industry === "Other" && row.industry_other
      ? `Other — ${row.industry_other}`
      : strOrDash(row.industry);

  const monthIdx = row.business_started_month ? Number(row.business_started_month) - 1 : null;
  const businessStarted =
    monthIdx !== null && monthIdx >= 0 && row.business_started_year
      ? `${MONTH_LABELS[monthIdx]} ${row.business_started_year}`
      : "—";

  const salesBucket = row.gross_annual_sales_bucket
    ? SALES_BUCKET_LABELS[row.gross_annual_sales_bucket] || row.gross_annual_sales_bucket
    : "—";

  const physicalAddr = [
    row.business_physical_street,
    row.business_physical_city,
    row.business_physical_state,
    row.business_physical_zip,
  ]
    .filter(Boolean)
    .join(", ") || "—";

  const ownerAddr = [
    row.owner_address_street,
    row.owner_address_city,
    row.owner_address_state,
    row.owner_address_zip,
  ]
    .filter(Boolean)
    .join(", ") || "—";

  // ---- Field groups ----
  const groups = [
    {
      title: "Submission Metadata",
      fields: [
        ["Entry ID", strOrDash(row.entry_id)],
        ["Submitted At", fmtBQDateTime(row.submitted_at)],
        ["Rep (app param)", strOrDash(row.app_param)],
        ["UTM Source", strOrDash(row.utm_source)],
        ["UTM Medium", strOrDash(row.utm_medium)],
        ["UTM Campaign", strOrDash(row.utm_campaign)],
        ["Referrer", strOrDash(row.referrer)],
        // IP address and user agent are intentionally omitted from the alert.
        // Both are still captured in BigQuery (`ip_address`, `user_agent`) for
        // audit/fraud review; they just add noise for the underwriting team.
      ],
    },
    {
      title: "Primary Contact",
      fields: [
        ["Full Name", strOrDash(row.contact_name)],
        ["Email", strOrDash(row.contact_email)],
        ["Phone", strOrDash(row.contact_phone)],
      ],
    },
    {
      title: "Business",
      fields: [
        ["Legal Business Name", strOrDash(row.business_legal_name)],
        ["DBA", strOrDash(row.dba)],
        ["Physical Address", physicalAddr],
        ["Industry", industry],
        ["State of Incorporation", strOrDash(row.state_of_incorporation)],
        ["Date Business Started", businessStarted],
        ["Federal Tax ID (EIN)", strOrDash(row.federal_tax_id)],
        ["Entity Type", strOrDash(row.business_entity_type)],
        ["Gross Annual Sales", salesBucket],
        ["Requested Funding Amount", fmtUSD(row.requested_funding_amount)],
      ],
    },
    {
      title: "Primary Owner",
      fields: [
        ["Full Name", strOrDash(row.owner_full_name)],
        ["Ownership %", row.owner_ownership_percentage ? `${row.owner_ownership_percentage}%` : "—"],
        ["SSN", strOrDash(row.owner_ssn)],
        ["Date of Birth", fmtBQDate(row.owner_dob)],
        ["Home Address", ownerAddr],
      ],
    },
  ];

  // ---- Plain-text body ----
  const textParts = [
    `New application submission`,
    ``,
    `${businessName}`,
    `Entry ${row.entry_id}  ·  ${fmtBQDateTime(row.submitted_at)}`,
    ``,
  ];
  for (const g of groups) {
    textParts.push(`── ${g.title.toUpperCase()} ──`);
    for (const [k, v] of g.fields) textParts.push(`${k.padEnd(28)}  ${v}`);
    textParts.push("");
  }

  // ---- HTML body ----
  const htmlGroups = groups
    .map(
      (g) => `
    <h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.6px;color:#0075DF;text-transform:uppercase;border-bottom:1px solid #E6E6E6;padding-bottom:4px;">
      ${escapeHtml(g.title)}
    </h3>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      ${g.fields
        .map(
          ([k, v]) => `
        <tr>
          <td style="padding:6px 14px 6px 0;color:#494F54;width:200px;vertical-align:top;white-space:nowrap;">${escapeHtml(k)}</td>
          <td style="padding:6px 0;color:#1a1a1a;vertical-align:top;">${escapeHtml(v)}</td>
        </tr>`
        )
        .join("")}
    </table>`
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F1F6FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:680px;margin:0 auto;padding:24px;background:#ffffff;">
    <div style="background:#002140;color:#fff;padding:18px 22px;border-radius:8px;margin-bottom:18px;">
      <div style="font-size:12px;letter-spacing:.6px;text-transform:uppercase;opacity:.8;">NextDay Biz Funding</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">New Application — ${escapeHtml(businessName)}</div>
      <div style="font-size:12px;opacity:.8;margin-top:4px;">Entry ${escapeHtml(row.entry_id)} · ${escapeHtml(fmtBQDateTime(row.submitted_at))}</div>
    </div>
    ${htmlGroups}
    <div style="margin-top:28px;padding-top:14px;border-top:1px solid #E6E6E6;font-size:11px;color:#888;">
      Attachments: application PDF + uploaded bank statements.
      Files also stored at <code>gs://${BUCKET_NAME}/${escapeHtml(row.gcs_folder?.replace(/^gs:\/\/[^/]+\//, "") || "")}/</code>.
    </div>
  </div>
</body></html>`;

  const notes = [];
  if (truncated) {
    notes.push("Internal note: one or more bank statements exceeded the email attachment limit and remain stored in GCS.");
  }
  const finalText = notes.length
    ? `${textParts.join("\n")}\n\n${notes.join("\n")}`
    : textParts.join("\n");

  return { subject, text: finalText, html, attachments };
}

// ---------- Boot ----------

export function startEmailer({
  bigquery = new BigQuery({ projectId: PROJECT_ID }),
  storage = new Storage({ projectId: PROJECT_ID }),
  pubsub = new PubSub({ projectId: PROJECT_ID }),
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  }),
  logger = console,
} = {}) {
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP_CONFIG_MISSING");
  }
  const bucket = storage.bucket(BUCKET_NAME);
  const readGcsObject = (uri, options) => readObject(bucket, uri, options);
  const resolveFinalArtifact = createFinalArtifactResolver({
    bucketName: BUCKET_NAME,
    readObject: readGcsObject,
  });
  const loadSourcePdf = createSourcePdfLoader({
    bucketName: BUCKET_NAME,
    readObject: readGcsObject,
  });
  const loadAttachments = createExplicitAttachmentLoader({
    bucketName: BUCKET_NAME,
    readObject: readGcsObject,
    maxTotalBytes: MAX_TOTAL_ATTACHMENT_BYTES,
  });
  const handleMessage = createMessageHandler({
    fetchSubmission: (entryId) => fetchBqRow(bigquery, entryId),
    loadSourcePdf,
    resolveFinalArtifact,
    loadAttachments,
    composeEmail,
    sendMail: (email) => transporter.sendMail(email),
    defaultRecipients: EMAIL_TO,
    from: FROM,
    logger,
  });
  const subscriptions = [SUBMISSION_SUBSCRIPTION, PDF_READY_SUBSCRIPTION].map(
    (name) => pubsub.subscription(name, { flowControl: SUBSCRIBER_FLOW_CONTROL }),
  );
  logger.info(
    `[emailer] starting subscriptions=${SUBMISSION_SUBSCRIPTION},${PDF_READY_SUBSCRIPTION} project=${PROJECT_ID} smtp=${SMTP_HOST}:${SMTP_PORT} recipient_count=${EMAIL_TO.length}`,
  );
  for (const subscription of subscriptions) {
    subscription.on("message", handleMessage);
    subscription.on("error", () => logger.error("[emailer] subscription_error"));
  }
  return { subscriptions, handleMessage };
}

const isMain =
  process.env.pm_id !== undefined ||
  (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url);
if (isMain) {
  try {
    const { subscriptions } = startEmailer();
    process.on("SIGINT", async () => {
      console.log("[emailer] SIGINT — closing subscriptions");
      await Promise.all(subscriptions.map((subscription) => subscription.close()));
      process.exit(0);
    });
  } catch (error) {
    console.error(`[emailer] fatal=${error.message === "SMTP_CONFIG_MISSING" ? error.message : "STARTUP_FAILURE"}`);
    process.exit(1);
  }
}
