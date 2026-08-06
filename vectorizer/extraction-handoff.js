export async function ingestAndEnqueue(
  document,
  { ingest, ingestOptions, extractionClient }
) {
  const result = await ingest(document, ingestOptions);
  const accepted = await extractionClient.enqueue({
    provider: "openai",
    documentId: document.document_id,
    fileId: result.fileId,
  });
  return {
    ...result,
    extractionStatus: accepted.status,
    extractionMessageId: accepted.messageId,
  };
}

export function resolveSubmissionProvider(configuredProvider, storedProvider) {
  if (configuredProvider !== "openai" && configuredProvider !== "llama") {
    const error = new Error("EXTRACTION_PROVIDER_INVALID");
    error.code = "EXTRACTION_PROVIDER_INVALID";
    throw error;
  }
  const lockedProvider = String(storedProvider || "").trim();
  if (lockedProvider && lockedProvider !== configuredProvider) {
    const error = new Error("EXTRACTION_PROVIDER_RUNTIME_MISMATCH");
    error.code = "EXTRACTION_PROVIDER_RUNTIME_MISMATCH";
    throw error;
  }
  return configuredProvider;
}

export async function enqueueLlamaDocument(document, { extractionClient }) {
  const accepted = await extractionClient.enqueue({
    provider: "llama",
    documentId: document.document_id,
  });
  return {
    status: "QUEUED",
    extractionStatus: accepted.status,
    extractionMessageId: accepted.messageId,
  };
}

export async function enqueueLlamaDocuments(documents, dependencies) {
  return Promise.all(
    documents.map(async (document) => ({
      document,
      result: await enqueueLlamaDocument(document, dependencies),
    }))
  );
}
