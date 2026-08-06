import assert from "node:assert/strict";
import test from "node:test";

import { createExtractionClient } from "./extraction-client.js";
import {
  enqueueLlamaDocuments,
  ingestAndEnqueue,
  resolveSubmissionProvider,
} from "./extraction-handoff.js";

test("posts exactly one file_id and requires a durable 202 response", async () => {
  const requests = [];
  const client = createExtractionClient({
    endpoint: "http://127.0.0.1:8787/extract",
    token: "synthetic-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(
        JSON.stringify({
          status: "accepted",
          provider: "openai",
          document_id: "doc_synthetic",
          file_id: "file_synthetic",
          message_id: "message_synthetic",
        }),
        { status: 202, headers: { "content-type": "application/json" } }
      );
    },
  });

  const accepted = await client.enqueue({
    provider: "openai",
    documentId: "doc_synthetic",
    fileId: "file_synthetic",
  });

  assert.equal(accepted.messageId, "message_synthetic");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://127.0.0.1:8787/extract");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.authorization, "Bearer synthetic-token");
  assert.equal(requests[0].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    provider: "openai",
    document_id: "doc_synthetic",
    file_id: "file_synthetic",
  });
});

test("fails closed when the extraction API does not confirm 202", async () => {
  const client = createExtractionClient({
    endpoint: "http://127.0.0.1:8787/extract",
    token: "synthetic-token",
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
  });

  await assert.rejects(
    () => client.enqueue({ provider: "openai", documentId: "doc_synthetic", fileId: "file_synthetic" }),
    (error) => error?.code === "EXTRACTION_HTTP_503"
  );
});

test("rejects a 202 response without a confirmed queue message", async () => {
  const client = createExtractionClient({
    endpoint: "http://127.0.0.1:8787/extract",
    token: "synthetic-token",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          status: "already_completed",
          file_id: "file_synthetic",
        }),
        { status: 202, headers: { "content-type": "application/json" } }
      ),
  });

  await assert.rejects(
    () => client.enqueue({ provider: "openai", documentId: "doc_synthetic", fileId: "file_synthetic" }),
    (error) => error?.code === "EXTRACTION_RESPONSE_INVALID"
  );
});

test("fails closed when the extraction API cannot be reached", async () => {
  const client = createExtractionClient({
    endpoint: "http://127.0.0.1:8787/extract",
    token: "synthetic-token",
    fetchImpl: async () => {
      throw new Error("synthetic network failure");
    },
  });

  await assert.rejects(
    () => client.enqueue({ provider: "openai", documentId: "doc_synthetic", fileId: "file_synthetic" }),
    (error) => error?.code === "EXTRACTION_NETWORK_ERROR"
  );
});

test("enqueues the returned file after indexing, including the retry skip path", async () => {
  const events = [];
  const result = await ingestAndEnqueue(
    { document_id: "doc_synthetic" },
    {
      ingest: async () => {
        events.push("indexed");
        return { status: "COMPLETED", skipped: true, fileId: "file_existing" };
      },
      extractionClient: {
        enqueue: async ({ fileId }) => {
          events.push(`enqueued:${fileId}`);
          return { status: "accepted", messageId: "message_synthetic" };
        },
      },
    }
  );

  assert.deepEqual(events, ["indexed", "enqueued:file_existing"]);
  assert.equal(result.fileId, "file_existing");
  assert.equal(result.extractionMessageId, "message_synthetic");
});

test("does not hide an enqueue failure after indexing completes", async () => {
  await assert.rejects(
    () =>
      ingestAndEnqueue(
        { document_id: "doc_synthetic" },
        {
          ingest: async () => ({
            status: "COMPLETED",
            skipped: false,
            fileId: "file_synthetic",
          }),
          extractionClient: {
            enqueue: async () => {
              const error = new Error("synthetic enqueue failure");
              error.code = "EXTRACTION_NETWORK_ERROR";
              throw error;
            },
          },
        }
      ),
    (error) => error?.code === "EXTRACTION_NETWORK_ERROR"
  );
});

test("builds a Llama request without an OpenAI file ID", async () => {
  const requests = [];
  const client = createExtractionClient({
    endpoint: "http://127.0.0.1:8787/extract",
    token: "synthetic-token",
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return new Response(
        JSON.stringify({
          status: "accepted",
          provider: "llama",
          document_id: "doc_llama",
          message_id: "message_llama",
        }),
        { status: 202, headers: { "content-type": "application/json" } }
      );
    },
  });

  await client.enqueue({ provider: "llama", documentId: "doc_llama" });

  assert.deepEqual(requests, [{ provider: "llama", document_id: "doc_llama" }]);
});

test("starts all Llama document handoffs before any one completes", async () => {
  const started = [];
  const resolvers = [];
  const documents = Array.from({ length: 4 }, (_, index) => ({
    document_id: `doc_${index + 1}`,
  }));
  const pending = enqueueLlamaDocuments(documents, {
    extractionClient: {
      enqueue: async ({ documentId }) => {
        started.push(documentId);
        await new Promise((resolve) => resolvers.push(resolve));
        return { status: "accepted", messageId: `message_${documentId}` };
      },
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["doc_1", "doc_2", "doc_3", "doc_4"]);
  resolvers.forEach((resolve) => resolve());
  const results = await pending;
  assert.equal(results.length, 4);
});

test("keeps the configured provider authoritative and fails closed on a mismatch", () => {
  assert.equal(resolveSubmissionProvider("openai", null), "openai");
  assert.equal(resolveSubmissionProvider("openai", "openai"), "openai");
  assert.throws(
    () => resolveSubmissionProvider("openai", "llama"),
    (error) => error?.code === "EXTRACTION_PROVIDER_RUNTIME_MISMATCH",
  );
});

test("preserves the legacy OpenAI file-only request contract", async () => {
  const requests = [];
  const client = createExtractionClient({
    endpoint: "http://127.0.0.1:8787/extract",
    token: "synthetic-token",
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return new Response(
        JSON.stringify({
          status: "accepted",
          file_id: "file_legacy",
          message_id: "message_legacy",
        }),
        { status: 202, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.enqueueFile("file_legacy");

  assert.equal(result.messageId, "message_legacy");
  assert.deepEqual(requests, [{ file_id: "file_legacy" }]);
});
