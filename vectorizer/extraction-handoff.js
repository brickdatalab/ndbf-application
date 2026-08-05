export async function ingestAndEnqueue(
  document,
  { ingest, ingestOptions, extractionClient }
) {
  const result = await ingest(document, ingestOptions);
  const accepted = await extractionClient.enqueueFile(result.fileId);
  return {
    ...result,
    extractionStatus: accepted.status,
    extractionMessageId: accepted.messageId,
  };
}
