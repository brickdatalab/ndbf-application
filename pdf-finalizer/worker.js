import { PubSub } from "@google-cloud/pubsub";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createProductionAdapters } from "./adapters.js";
import { createFinalizer, createMessageHandler } from "./finalizer.js";
import { renderFinalizedPdf, verifyFinalizedPdf } from "./renderer.js";
import { validateDeclaredPdfLayout } from "@ndbf/pdf-layout/pdf-layout-validator.js";

const PROJECT_ID = process.env.PROJECT_ID || "lithe-hallway-493420-r4";
const BQ_DATASET = process.env.BQ_DATASET || "ndbf_applications";
const BUCKET_NAME = process.env.BUCKET_NAME || "app_banks";
const SUBSCRIPTION =
  process.env.PDF_FINALIZER_SUBSCRIPTION ||
  "bank-statement-underwriting-pdf-finalizer";
const READY_TOPIC = process.env.PDF_READY_TOPIC || "application-pdf-ready";

export function buildWorker({ adapters, logger = console } = {}) {
  const productionAdapters =
    adapters ??
    createProductionAdapters({
      projectId: PROJECT_ID,
      datasetId: BQ_DATASET,
      bucketName: BUCKET_NAME,
      readyTopicName: READY_TOPIC,
    });
  const processEvent = createFinalizer({
    ...productionAdapters,
    validateSourcePdf: validateDeclaredPdfLayout,
    renderFinalizedPdf,
    verifyFinalizedPdf,
  });
  return createMessageHandler({ processEvent, logger });
}

export function startWorker({
  pubsub = new PubSub({ projectId: PROJECT_ID }),
  logger = console,
  handleMessage = buildWorker({ logger }),
} = {}) {
  const subscription = pubsub.subscription(SUBSCRIPTION, {
    flowControl: { maxMessages: 2, allowExcessMessages: false },
  });
  subscription.on("message", handleMessage);
  subscription.on("error", () => {
    logger.error("pdf_finalizer_subscription_error");
  });
  logger.info("pdf_finalizer_started");
  return subscription;
}

const isMain =
  process.env.pm_id !== undefined ||
  (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]));
if (isMain) {
  startWorker();
}
