function stableErrorCode(error) {
  const value = String(error?.code || "UNEXPECTED_ERROR");
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(value) ? value : "UNEXPECTED_ERROR";
}

export async function ingestDocument(
  document,
  { repo, loadSource, prepareUpload, openai }
) {
  const state = await repo.ensure(document);
  if (state?.ingestion_status === "COMPLETED") {
    return {
      status: "COMPLETED",
      skipped: true,
      fileId: state.openai_file_id,
    };
  }

  try {
    let openaiFileId = state?.openai_file_id || null;
    let vectorStoreFileId = state?.vector_store_file_id || null;

    if (!openaiFileId) {
      const source = await loadSource(document.gcs_uri);
      const upload = await prepareUpload(source, document);
      const uploaded = await openai.uploadFile(upload);
      openaiFileId = uploaded.id;
      await repo.markUploaded(document, {
        openaiFileId,
        generation: source.generation,
        contentType: source.contentType,
        sizeBytes: source.sizeBytes,
        sha256: source.sha256,
      });
    }

    if (!vectorStoreFileId) {
      const attached = await openai.attachFile({
        fileId: openaiFileId,
        attributes: {
          submission_id: document.entry_id,
          document_id: document.document_id,
          document_type: document.document_type,
          document_index: document.document_index,
        },
      });
      vectorStoreFileId = attached.id;
      await repo.markAttached(document, {
        vectorStoreFileId,
        openaiStatus: attached.status,
      });
    }

    const completed = await openai.pollFile(vectorStoreFileId || openaiFileId);
    await repo.markCompleted(document, {
      vectorStoreFileId: completed.id,
      openaiStatus: completed.status,
    });
    return { status: "COMPLETED", skipped: false, fileId: openaiFileId };
  } catch (error) {
    if (repo.markFailed) {
      try {
        await repo.markFailed(document, { errorCode: stableErrorCode(error) });
      } catch {
        // Preserve the original failure so Pub/Sub can retry it.
      }
    }
    throw error;
  }
}
