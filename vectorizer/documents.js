import { createHash } from "node:crypto";

function timestampValue(value) {
  if (value && typeof value === "object" && "value" in value) return String(value.value);
  return String(value);
}

export function documentIdFor(entryId, gcsUri) {
  const digest = createHash("sha256")
    .update(`${entryId}\n${gcsUri}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `doc_${digest}`;
}

export function parseGcsUri(gcsUri) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(String(gcsUri || ""));
  if (!match || !match[1] || !match[2]) {
    const error = new Error("INVALID_GCS_URI");
    error.code = "INVALID_GCS_URI";
    throw error;
  }
  return { bucket: match[1], object: match[2] };
}

export function buildSubmissionDocuments(row) {
  const entryId = String(row?.entry_id || "");
  if (!entryId || !row?.submitted_at) {
    const error = new Error("INVALID_SUBMISSION_ROW");
    error.code = "INVALID_SUBMISSION_ROW";
    throw error;
  }

  const candidates = [];
  for (const [index, gcsUri] of (row.bank_statement_gcs_keys || []).entries()) {
    if (!gcsUri) continue;
    if (!/\.pdf(?:[?#].*)?$/i.test(String(gcsUri))) continue;
    candidates.push({
      document_type: "bank_statement",
      document_index: index + 1,
      gcs_uri: String(gcsUri),
    });
  }

  const seen = new Set();
  return candidates.map((candidate) => {
    if (seen.has(candidate.gcs_uri)) {
      const error = new Error("DUPLICATE_GCS_URI");
      error.code = "DUPLICATE_GCS_URI";
      throw error;
    }
    seen.add(candidate.gcs_uri);
    parseGcsUri(candidate.gcs_uri);
    return {
      document_id: documentIdFor(entryId, candidate.gcs_uri),
      entry_id: entryId,
      submitted_at: timestampValue(row.submitted_at),
      ...candidate,
    };
  });
}
