import { File } from "node:buffer";

const API_BASE = "https://api.openai.com/v1";
const TERMINAL_FAILURES = new Set(["failed", "cancelled"]);

class OpenAIRequestError extends Error {
  constructor(code) {
    super(code);
    this.name = "OpenAIRequestError";
    this.code = code;
  }
}

function wait(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createOpenAIClient({
  apiKey,
  vectorStoreId,
  fetchImpl = globalThis.fetch,
  pollIntervalMs = 2000,
  pollTimeoutMs = 10 * 60 * 1000,
}) {
  if (!apiKey) throw new OpenAIRequestError("OPENAI_API_KEY_MISSING");
  if (!vectorStoreId) throw new OpenAIRequestError("OPENAI_VECTOR_STORE_ID_MISSING");
  if (typeof fetchImpl !== "function") throw new OpenAIRequestError("OPENAI_FETCH_UNAVAILABLE");

  const authHeaders = { Authorization: `Bearer ${apiKey}` };

  async function requestJson(path, options = {}) {
    let response;
    try {
      response = await fetchImpl(`${API_BASE}${path}`, options);
    } catch {
      throw new OpenAIRequestError("OPENAI_NETWORK_ERROR");
    }
    if (!response.ok) {
      try {
        await response.arrayBuffer();
      } catch {
        // The response body is intentionally discarded and never logged.
      }
      throw new OpenAIRequestError(`OPENAI_HTTP_${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new OpenAIRequestError("OPENAI_JSON_INVALID");
    }
  }

  return {
    vectorStoreId,

    async uploadFile({ bytes, filename, contentType }) {
      const body = new FormData();
      body.set("purpose", "assistants");
      body.set(
        "file",
        new File([bytes], filename, { type: contentType || "application/octet-stream" })
      );
      const result = await requestJson("/files", {
        method: "POST",
        headers: authHeaders,
        body,
      });
      if (!result?.id) throw new OpenAIRequestError("OPENAI_FILE_ID_MISSING");
      return { id: String(result.id) };
    },

    async attachFile({ fileId, attributes }) {
      const result = await requestJson(`/vector_stores/${vectorStoreId}/files`, {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          file_id: fileId,
          attributes,
          chunking_strategy: {
            type: "static",
            static: {
              max_chunk_size_tokens: 800,
              chunk_overlap_tokens: 400,
            },
          },
        }),
      });
      if (!result?.id) throw new OpenAIRequestError("OPENAI_VECTOR_FILE_ID_MISSING");
      return { id: String(result.id), status: String(result.status || "in_progress") };
    },

    async pollFile(fileId) {
      const deadline = Date.now() + pollTimeoutMs;
      while (Date.now() <= deadline) {
        const result = await requestJson(
          `/vector_stores/${vectorStoreId}/files/${encodeURIComponent(fileId)}`,
          { headers: authHeaders }
        );
        const status = String(result?.status || "unknown");
        if (status === "completed") return { id: String(result.id || fileId), status };
        if (TERMINAL_FAILURES.has(status)) {
          throw new OpenAIRequestError("OPENAI_VECTOR_FILE_FAILED");
        }
        await wait(pollIntervalMs);
      }
      throw new OpenAIRequestError("OPENAI_VECTOR_FILE_TIMEOUT");
    },
  };
}
