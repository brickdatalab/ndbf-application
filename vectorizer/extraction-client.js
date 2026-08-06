class ExtractionRequestError extends Error {
  constructor(code) {
    super(code);
    this.name = "ExtractionRequestError";
    this.code = code;
  }
}

export function createExtractionClient({
  endpoint,
  token,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
}) {
  if (!endpoint) throw new ExtractionRequestError("EXTRACTION_URL_MISSING");
  if (!token) throw new ExtractionRequestError("EXTRACTION_TOKEN_MISSING");
  if (typeof fetchImpl !== "function") {
    throw new ExtractionRequestError("EXTRACTION_FETCH_UNAVAILABLE");
  }

  async function post(body) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ExtractionRequestError("EXTRACTION_NETWORK_ERROR");
    }

    if (response.status !== 202) {
      try {
        await response.arrayBuffer();
      } catch {
        // Never surface or log the response body.
      }
      throw new ExtractionRequestError(`EXTRACTION_HTTP_${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw new ExtractionRequestError("EXTRACTION_RESPONSE_INVALID");
    }
  }

  return {
    async enqueue(request) {
      const provider = request?.provider;
      const documentId = request?.documentId;
      const fileId = request?.fileId;
      if (provider !== "openai" && provider !== "llama") {
        throw new ExtractionRequestError("EXTRACTION_PROVIDER_INVALID");
      }
      if (
        typeof documentId !== "string" ||
        !documentId ||
        documentId !== documentId.trim()
      ) {
        throw new ExtractionRequestError("EXTRACTION_DOCUMENT_ID_INVALID");
      }
      if (
        provider === "openai" &&
        (typeof fileId !== "string" || !fileId || fileId !== fileId.trim())
      ) {
        throw new ExtractionRequestError("EXTRACTION_FILE_ID_INVALID");
      }

      const body = { provider, document_id: documentId };
      if (provider === "openai") body.file_id = fileId;
      const payload = await post(body);
      if (
        payload?.provider !== provider ||
        payload?.document_id !== documentId ||
        payload?.status !== "accepted" ||
        typeof payload?.message_id !== "string" ||
        !payload.message_id
      ) {
        throw new ExtractionRequestError("EXTRACTION_RESPONSE_INVALID");
      }

      return {
        status: payload.status,
        messageId: payload.message_id,
      };
    },

    async enqueueFile(fileId) {
      if (typeof fileId !== "string" || !fileId || fileId !== fileId.trim()) {
        throw new ExtractionRequestError("EXTRACTION_FILE_ID_INVALID");
      }
      const payload = await post({ file_id: fileId });
      if (
        payload?.file_id !== fileId ||
        payload?.status !== "accepted" ||
        typeof payload?.message_id !== "string" ||
        !payload.message_id
      ) {
        throw new ExtractionRequestError("EXTRACTION_RESPONSE_INVALID");
      }
      return {
        status: payload.status,
        messageId: payload.message_id,
      };
    },
  };
}
