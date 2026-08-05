// NDBF application submission backend.
// Receives multipart form submissions from the React frontend,
// writes uploaded files + generated PDF to gs://app_banks/{slug}_{entry_id}/,
// and inserts one row into BigQuery ndbf_applications.submissions.
//
// Auth: uses the VM's attached service account (Application Default Credentials).
// No secrets needed in env.

import express from "express";
import cors from "cors";
import multer from "multer";
import { Storage } from "@google-cloud/storage";
import { BigQuery } from "@google-cloud/bigquery";
import { PubSub } from "@google-cloud/pubsub";
import { serializeRawPayloadForBigQuery } from "./raw-payload.js";
import {
  PdfLayoutValidationError,
  validateDeclaredPdfLayout,
} from "./pdf-layout-validator.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

// ---------- Config ----------

const PROJECT_ID = process.env.PROJECT_ID || "lithe-hallway-493420-r4";
const BUCKET_NAME = process.env.BUCKET_NAME || "app_banks";
const BQ_DATASET = process.env.BQ_DATASET || "ndbf_applications";
const BQ_TABLE = process.env.BQ_TABLE || "submissions";
const NOTIFY_TOPIC = process.env.NOTIFY_TOPIC || "submission-completed";
const PORT = Number(process.env.PORT || 8080);
const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 25;

// ---------- Clients ----------

const storage = new Storage({ projectId: PROJECT_ID });
const bucket = storage.bucket(BUCKET_NAME);
const bigquery = new BigQuery({ projectId: PROJECT_ID });
const bqTable = bigquery.dataset(BQ_DATASET).table(BQ_TABLE);
const pubsub = new PubSub({ projectId: PROJECT_ID });
const notifyTopic = pubsub.topic(NOTIFY_TOPIC);

// ---------- Express ----------

const app = express();

// CORS: allow the Vercel demo origins, the eventual NDBF subdomain, and localhost dev.
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl / server-to-server
      const allow =
        /\.vercel\.app$/i.test(origin) ||
        /(^|\.)nextdaybizfunding\.com$/i.test(origin) ||
        /^https?:\/\/localhost(:\d+)?$/i.test(origin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin);
      return cb(allow ? null : new Error(`CORS blocked for origin ${origin}`), allow);
    },
    credentials: false,
  })
);

app.use(express.json({ limit: "5mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    files: MAX_FILES + 1, // + 1 for the generated PDF
  },
});

// ---------- Helpers ----------

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
function shortId(len = 8) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "unknown";
}

function iso() {
  return new Date().toISOString();
}

async function uploadToGcs({ folder, filename, buffer, contentType, createOnly = true }) {
  const objectName = `${folder}/${filename}`;
  const file = bucket.file(objectName);
  await file.save(buffer, {
    contentType: contentType || "application/octet-stream",
    resumable: false,
    metadata: { cacheControl: "private, max-age=0, no-transform" },
    ...(createOnly ? { preconditionOpts: { ifGenerationMatch: 0 } } : {}),
  });
  const [metadata] = await file.getMetadata();
  return {
    uri: `gs://${BUCKET_NAME}/${objectName}`,
    generation: String(metadata.generation ?? ""),
  };
}

function uploadUri(result) {
  return typeof result === "string" ? result : result?.uri ?? null;
}

function uploadGeneration(result) {
  return typeof result === "object" && result
    ? String(result.generation ?? "")
    : "";
}

function pickNum(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickStr(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function monthYearToStartDate(m, y) {
  const month = pickNum(m);
  const year = pickNum(y);
  if (!month || !year) return { m: null, y: null };
  return { m: month, y: year };
}

// Parse sales bucket to a canonical string (we store the label too in raw JSON)
function mapSalesBucket(b) {
  return pickStr(b); // already a short key like "gt_5m"
}

// Map the client payload to a BigQuery row matching the submissions schema.
export function buildBqRow({ entryId, submittedAt, payload, pdfLayoutVersion, pdfSourceGeneration, pdfSourceSha256, gcsFolder, bankKeys, pdfKey, ipAddress, userAgent }) {
  const f = payload.formData || {};
  const owner = f.owner || {};
  const addr = f.physicalAddress || {};
  const oAddr = owner.address || {};
  const utm = payload.utm || {};
  const { m: startedM, y: startedY } = monthYearToStartDate(f.businessStartedMonth, f.businessStartedYear);

  return {
    entry_id: entryId,
    submitted_at: submittedAt,
    app_param: pickStr(payload.appParam),
    utm_source: pickStr(utm.utm_source),
    utm_medium: pickStr(utm.utm_medium),
    utm_campaign: pickStr(utm.utm_campaign),
    utm_term: pickStr(utm.utm_term),
    utm_content: pickStr(utm.utm_content),
    referrer: pickStr(utm.referrer),
    ip_address: ipAddress || null,
    user_agent: userAgent || null,

    contact_name: pickStr(f.contactName),
    contact_email: pickStr(f.contactEmail),
    contact_phone: pickStr(f.contactPhone),

    business_legal_name: pickStr(f.businessLegalName),
    dba: pickStr(f.dba),
    business_physical_street: pickStr(addr.street),
    business_physical_city: pickStr(addr.city),
    business_physical_state: pickStr(addr.state),
    business_physical_zip: pickStr(addr.zip),
    industry: pickStr(f.industry),
    industry_other: pickStr(f.industryOther),
    state_of_incorporation: pickStr(f.stateOfIncorporation),
    business_started_month: startedM,
    business_started_year: startedY,
    federal_tax_id: pickStr(f.federalTaxId),
    business_entity_type: pickStr(f.businessEntityType),
    gross_annual_sales_bucket: mapSalesBucket(f.grossAnnualSalesBucket),
    requested_funding_amount: pickNum(f.requestedFundingAmount),

    owner_full_name: pickStr(owner.fullName),
    owner_ownership_percentage: pickNum(owner.ownershipPercentage),
    owner_ssn: pickStr(owner.ssn),
    owner_dob: pickStr(owner.dateOfBirth), // YYYY-MM-DD
    owner_address_street: pickStr(oAddr.street),
    owner_address_city: pickStr(oAddr.city),
    owner_address_state: pickStr(oAddr.state),
    owner_address_zip: pickStr(oAddr.zip),

    bank_statement_gcs_keys: bankKeys,
    pdf_gcs_key: pdfKey || null,
    pdf_layout_version: pdfLayoutVersion,
    pdf_source_generation: pdfSourceGeneration,
    pdf_source_sha256: pdfSourceSha256,
    gcs_folder: `gs://${BUCKET_NAME}/${gcsFolder}`,

    signature_captured: Boolean(f.signature),
    terms_accepted: Boolean(f.termsAccepted),

    raw_payload_json: serializeRawPayloadForBigQuery(payload),
  };
}

// ---------- Routes ----------

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ndbf-backend",
    project: PROJECT_ID,
    bucket: BUCKET_NAME,
    dataset: BQ_DATASET,
    table: BQ_TABLE,
    time: iso(),
  });
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "ndbf-backend" });
});

// Main submission endpoint.
// Expects multipart/form-data with:
//   - payload    : JSON string  (form data, utm, appParam)
//   - pdf        : File         (client-generated application PDF) [optional]
//   - banks      : File(s)      (uploaded bank statements, up to MAX_FILES)
export function createSubmitHandler({
  uploadFile = uploadToGcs,
  insertRows = (rows, options) => bqTable.insert(rows, options),
  publishMessage = (message) => notifyTopic.publishMessage(message),
  now = iso,
} = {}) {
  return async (req, res) => {
    const reqStart = Date.now();
    try {
      const raw = req.body?.payload;
      if (!raw) {
        return res.status(400).json({ ok: false, error: "Missing payload field" });
      }
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return res.status(400).json({ ok: false, error: "Invalid JSON in payload" });
      }

      const pdfFile = (req.files?.pdf || [])[0];
      const bankFiles = req.files?.banks || [];
      let pdfLayoutVersion;
      try {
        pdfLayoutVersion = await validateDeclaredPdfLayout({
          declaredVersion: payload.pdfLayoutVersion,
          pdfBuffer: pdfFile?.buffer,
        });
      } catch (error) {
        if (error instanceof PdfLayoutValidationError) {
          return res.status(error.statusCode).json({ ok: false, error: error.code });
        }
        throw error;
      }

      const entryId = `ndbf_${shortId(8)}`;
      const submittedAt = now();
      const slug = slugify(payload?.formData?.businessLegalName || "unknown");
      const folder = `${slug}_${entryId}`;

      // Validation is complete before this persistence boundary. Upload bank
      // statements and the signed source PDF only after the layout is trusted.

      const uploadPromises = [];

      for (let i = 0; i < bankFiles.length; i++) {
        const f = bankFiles[i];
        const safe = String(f.originalname || `statement_${i + 1}`).replace(/[^\w.\- ]+/g, "_");
        uploadPromises.push(
          uploadFile({
            folder,
            filename: `bank_${String(i + 1).padStart(2, "0")}_${safe}`,
            buffer: f.buffer,
            contentType: f.mimetype || "application/octet-stream",
            createOnly: true,
          })
        );
      }

      let pdfPromise = null;
      if (pdfFile) {
        pdfPromise = uploadFile({
          folder,
          filename: `${slug}_${entryId}.pdf`,
          buffer: pdfFile.buffer,
          contentType: "application/pdf",
          createOnly: true,
        });
      }

      const [bankUploadResults, pdfUploadResult] = await Promise.all([
        Promise.all(uploadPromises),
        pdfPromise || Promise.resolve(null),
      ]);
      const bankKeys = bankUploadResults.map(uploadUri);
      const pdfKey = uploadUri(pdfUploadResult);
      const pdfSourceGeneration = pdfLayoutVersion
        ? uploadGeneration(pdfUploadResult)
        : null;
      const pdfSourceSha256 = pdfLayoutVersion
        ? createHash("sha256").update(pdfFile.buffer).digest("hex")
        : null;
      if (
        pdfLayoutVersion &&
        (!/^[0-9]+$/.test(pdfSourceGeneration) ||
          !/^[a-f0-9]{64}$/.test(pdfSourceSha256))
      ) {
        throw new Error("PDF source integrity metadata was not confirmed");
      }

      // Insert BQ row. Streaming insert is fine for our volume.
      const ipAddress =
        (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
        req.socket.remoteAddress ||
        null;
      const userAgent = String(req.headers["user-agent"] || "").slice(0, 500) || null;

      const row = buildBqRow({
        entryId,
        submittedAt,
        payload,
        pdfLayoutVersion,
        pdfSourceGeneration,
        pdfSourceSha256,
        gcsFolder: folder,
        bankKeys,
        pdfKey,
        ipAddress,
        userAgent,
      });

      await insertRows([row], { raw: false, skipInvalidRows: false, ignoreUnknownValues: false });

      // Fire-and-forget notification to the email worker. Wrapped in try/catch
      // and bounded by a 2s timeout so a Pub/Sub blip never affects the
      // applicant's submit response. The submission is already persisted at
      // this point — the notification is purely out-of-band.
      try {
        const publishPromise = publishMessage({
          json: {
            entry_id: entryId,
            gcs_folder: `gs://${BUCKET_NAME}/${folder}`,
            pdf_layout_version: pdfLayoutVersion,
          },
          attributes: { entry_id: entryId },
        });
        await Promise.race([
          publishPromise,
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      } catch (publishErr) {
        console.error(`[submit] entryId=${entryId} pubsub publish failed (non-fatal):`, publishErr.message);
      }

      const elapsedMs = Date.now() - reqStart;
      console.log(
        `[submit] entryId=${entryId} slug=${slug} banks=${bankFiles.length} pdf=${pdfFile ? 1 : 0} elapsed=${elapsedMs}ms`
      );

      return res.json({
        ok: true,
        entryId,
        submittedAt,
        gcsFolder: `gs://${BUCKET_NAME}/${folder}/`,
        bankCount: bankFiles.length,
        pdfStored: Boolean(pdfFile),
      });
    } catch (err) {
      console.error("[submit] error:", err);
      // Surface the BQ error details if they're there — super helpful for debugging.
      const detail =
        err?.errors?.[0]?.errors?.map((e) => e.message).join("; ") ||
        err?.message ||
        String(err);
      return res.status(500).json({ ok: false, error: detail });
    }
  };
}

app.post(
  "/api/submit",
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "banks", maxCount: MAX_FILES },
  ]),
  createSubmitHandler(),
);

// ---------- Boot ----------

const isMain =
  process.env.pm_id !== undefined ||
  (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]));
if (isMain) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ndbf-backend listening on :${PORT}`);
    console.log(`  project=${PROJECT_ID}`);
    console.log(`  bucket=${BUCKET_NAME}`);
    console.log(`  bq=${BQ_DATASET}.${BQ_TABLE}`);
  });
}

export { app };
