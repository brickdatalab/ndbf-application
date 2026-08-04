import assert from "node:assert/strict";
import test from "node:test";

import { createOpenAIClient } from "./openai.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("uploads, attaches with lookup attributes, and polls to completion", async () => {
  const calls = [];
  let polls = 0;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/vector_stores/vs_synthetic/files") && options.method === "POST") {
      const body = JSON.parse(options.body);
      assert.equal(body.file_id, "file_synthetic");
      assert.deepEqual(body.attributes, {
        submission_id: "ndbf_synthetic",
        document_id: "doc_abc",
        document_type: "bank_statement",
        document_index: 1,
      });
      assert.deepEqual(body.chunking_strategy, {
        type: "static",
        static: {
          max_chunk_size_tokens: 800,
          chunk_overlap_tokens: 400,
        },
      });
      return jsonResponse({ id: "file_synthetic", status: "in_progress" });
    }
    if (url.endsWith("/files") && options.method === "POST") {
      assert.equal(options.body.get("purpose"), "assistants");
      assert.equal(options.body.get("file").name, "doc_abc.pdf");
      return jsonResponse({ id: "file_synthetic" });
    }
    if (url.endsWith("/vector_stores/vs_synthetic/files/file_synthetic")) {
      polls += 1;
      return jsonResponse({
        id: "file_synthetic",
        status: polls === 1 ? "in_progress" : "completed",
      });
    }
    throw new Error("unexpected request");
  };
  const client = createOpenAIClient({
    apiKey: "test-key",
    vectorStoreId: "vs_synthetic",
    fetchImpl,
    pollIntervalMs: 0,
  });

  const uploaded = await client.uploadFile({
    bytes: Buffer.from("synthetic"),
    filename: "doc_abc.pdf",
    contentType: "application/pdf",
  });
  const attached = await client.attachFile({
    fileId: uploaded.id,
    attributes: {
      submission_id: "ndbf_synthetic",
      document_id: "doc_abc",
      document_type: "bank_statement",
      document_index: 1,
    },
  });
  const completed = await client.pollFile(attached.id);

  assert.equal(completed.status, "completed");
  assert.equal(calls.length, 4);
});

test("provider errors expose only a stable status code", async () => {
  const client = createOpenAIClient({
    apiKey: "test-key",
    vectorStoreId: "vs_synthetic",
    fetchImpl: async () => jsonResponse({ error: { message: "sensitive body" } }, 400),
  });

  await assert.rejects(
    client.uploadFile({
      bytes: Buffer.from("synthetic"),
      filename: "doc_abc.pdf",
      contentType: "application/pdf",
    }),
    (error) => error.code === "OPENAI_HTTP_400" && !error.message.includes("sensitive body")
  );
});
