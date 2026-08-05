// NDBF email worker.
//
// Subscribes to the `submission-completed` Pub/Sub topic. For each message:
//   1. Fetches the BigQuery row by entry_id.
//   2. Lists all objects in the submission's GCS folder.
//   3. Composes an email with every form field unredacted (phone + email shown
//      in full) and attaches the PDF + every bank statement file.
//   4. Sends via Gmail SMTP (App Password auth) to the recipients in EMAIL_TO.
//
// This service is intentionally decoupled from the main backend — if it crashes
// or the SMTP relay rejects a message, submissions still succeed end-to-end.
// Pub/Sub handles redelivery and dead-letter routing.

import { PubSub } from "@google-cloud/pubsub";
import { Storage } from "@google-cloud/storage";
import { BigQuery } from "@google-cloud/bigquery";
import nodemailer from "nodemailer";
import { resolveRecipients } from "./recipient-routing.js";

// ---------- Config ----------

const PROJECT_ID = process.env.PROJECT_ID || "lithe-hallway-493420-r4";
const BUCKET_NAME = process.env.BUCKET_NAME || "app_banks";
const BQ_DATASET = process.env.BQ_DATASET || "ndbf_applications";
const BQ_TABLE = process.env.BQ_TABLE || "submissions";
const SUBSCRIPTION = process.env.SUBSCRIPTION || "submission-completed-emailer";

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

if (!SMTP_USER || !SMTP_PASS) {
  console.error("[emailer] FATAL: SMTP_USER and SMTP_PASS env vars are required");
  process.exit(1);
}

// ---------- Clients ----------

const pubsub = new PubSub({ projectId: PROJECT_ID });
const subscription = pubsub.subscription(SUBSCRIPTION, {
  flowControl: { maxMessages: 5 }, // process up to 5 in parallel
});
const storage = new Storage({ projectId: PROJECT_ID });
const bucket = storage.bucket(BUCKET_NAME);
const bigquery = new BigQuery({ projectId: PROJECT_ID });

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

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

async function fetchBqRow(entryId) {
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

/**
 * List every object in the submission's GCS folder. Returns
 * [{ name, prettyName, size, contentType }] sorted by name.
 */
async function listFolderObjects(gcsFolder) {
  // gcsFolder is the *bare* prefix like "smith-and-sons-llc_ndbf_xxx"
  const prefix = gcsFolder.endsWith("/") ? gcsFolder : `${gcsFolder}/`;
  const [files] = await bucket.getFiles({ prefix });
  return files
    .map((f) => {
      const baseName = f.name.replace(prefix, "");
      // Strip the "bank_NN_" prefix the backend adds, for nicer attachment names.
      const prettyName = baseName.replace(/^bank_\d+_/, "");
      return {
        name: f.name,
        prettyName,
        size: Number(f.metadata?.size || 0),
        contentType: f.metadata?.contentType || "application/octet-stream",
        file: f,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function downloadFile(file) {
  const [buf] = await file.download();
  return buf;
}

/**
 * Build the email subject + body + attachments from a BigQuery row.
 */
async function composeEmail(row) {
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
        ["IP Address", strOrDash(row.ip_address)],
        ["User Agent", strOrDash(row.user_agent)],
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

  // ---- Attachments ----
  // gcs_folder in BQ looks like "gs://app_banks/biz-name_ndbf_xxx" — extract the prefix.
  const folderPrefix =
    row.gcs_folder?.replace(`gs://${BUCKET_NAME}/`, "") ||
    null;

  const attachments = [];
  let totalBytes = 0;
  let truncated = false;

  if (folderPrefix) {
    const objects = await listFolderObjects(folderPrefix);
    for (const obj of objects) {
      // Pre-check size to keep us under the SMTP cap.
      if (totalBytes + obj.size > MAX_TOTAL_ATTACHMENT_BYTES) {
        truncated = true;
        console.warn(
          `[emailer] skipping ${obj.name} (${obj.size}b) — would exceed ${MAX_TOTAL_ATTACHMENT_BYTES}b cap`
        );
        continue;
      }
      try {
        const content = await downloadFile(obj.file);
        attachments.push({
          filename: obj.prettyName,
          content,
          contentType: obj.contentType,
        });
        totalBytes += obj.size;
      } catch (err) {
        console.error(`[emailer] failed to download ${obj.name}:`, err.message);
      }
    }
  }

  const finalText = truncated
    ? textParts.join("\n") +
      `\n\n[Note: some attachments were too large to include. All files remain in gs://${BUCKET_NAME}/${folderPrefix}/ ]\n`
    : textParts.join("\n");

  return { subject, text: finalText, html, attachments };
}

// ---------- Message handler ----------

async function handleMessage(message) {
  const id = message.id;
  let payload;
  try {
    payload = JSON.parse(message.data.toString());
  } catch (err) {
    console.error(`[emailer] msg=${id} unparseable JSON, dropping:`, err.message);
    message.ack();
    return;
  }

  const entryId = payload?.entry_id;
  if (!entryId) {
    console.error(`[emailer] msg=${id} payload missing entry_id, dropping:`, payload);
    message.ack();
    return;
  }

  console.log(`[emailer] msg=${id} entry=${entryId} fetching BQ row…`);

  try {
    const row = await fetchBqRow(entryId);
    if (!row) {
      // Row not yet visible (BQ streaming buffer can lag). Nack to retry shortly.
      console.warn(`[emailer] msg=${id} entry=${entryId} not found in BQ yet — nack for retry`);
      message.nack();
      return;
    }

    const email = await composeEmail(row);

    // Layer in any rep-specific extra recipients based on app_param, deduped.
    const { appKey, extras, recipients } = resolveRecipients(EMAIL_TO, row.app_param);
    if (extras.length) {
      console.log(`[emailer] msg=${id} app_param=${appKey} adding extras=${extras.join(",")}`);
    }

    const info = await transporter.sendMail({
      from: FROM,
      to: recipients,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: email.attachments,
    });

    console.log(
      `[emailer] msg=${id} entry=${entryId} sent ok messageId=${info.messageId} attachments=${email.attachments.length}`
    );
    message.ack();
  } catch (err) {
    console.error(`[emailer] msg=${id} entry=${entryId} ERROR:`, err.message);
    // nack so Pub/Sub redelivers per the subscription policy.
    message.nack();
  }
}

// ---------- Boot ----------

console.log(
  `[emailer] starting subscription=${SUBSCRIPTION} project=${PROJECT_ID} ` +
    `smtp=${SMTP_HOST}:${SMTP_PORT} from=${FROM} to=${EMAIL_TO.join(",")}`
);

subscription.on("message", handleMessage);
subscription.on("error", (err) => {
  console.error("[emailer] subscription error:", err);
});

// Keep the process alive (Pub/Sub keeps an open stream).
process.on("SIGINT", async () => {
  console.log("[emailer] SIGINT — closing subscription");
  await subscription.close();
  process.exit(0);
});
