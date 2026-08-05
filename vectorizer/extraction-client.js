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

  return {
    async enqueueFile(fileId) {
      if (typeof fileId !== "string" || !fileId || fileId !== fileId.trim()) {
        throw new ExtractionRequestError("EXTRACTION_FILE_ID_INVALID");
      }

      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ file_id: fileId }),
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

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new ExtractionRequestError("EXTRACTION_RESPONSE_INVALID");
      }
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
