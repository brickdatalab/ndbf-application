import type { AttributionResolution } from "./attribution";

export const GTM_CONTAINER_ID = "GTM-N9WZSDXR";
const GTM_SCRIPT_ID = "ndbf-gtm";

export type ApplicationEventName =
  | "application_landing"
  | "application_start"
  | "application_step_view"
  | "application_step_complete"
  | "application_validation_error"
  | "homepage_link_click"
  | "application_resume"
  | "application_submit_attempt"
  | "application_submit_error"
  | "generate_lead";

export type StepName =
  | "contact_information"
  | "business_information"
  | "ownership_details"
  | "bank_statements"
  | "sign_and_submit";

export type SubmissionErrorCategory = "network" | "http" | "backend" | "unknown";

export type DataLayerEvent = {
  event: ApplicationEventName;
  app_param?: string;
  attribution_utm_id?: string;
  attribution_utm_source?: string;
  attribution_utm_medium?: string;
  attribution_utm_campaign?: string;
  attribution_utm_content?: string;
  attribution_utm_term?: string;
  attribution_utm_source_platform?: string;
  attribution_origin?: AttributionResolution["origin"];
  step_number?: number;
  step_name?: StepName;
  error_category?: string;
};

export type GtmBootstrapEvent = {
  "gtm.start": number;
  event: "gtm.js";
};

type AnalyticsBrowser = {
  dataLayer?: Array<DataLayerEvent | GtmBootstrapEvent>;
  document: {
    getElementById: (id: string) => unknown;
    createElement: (tag: string) => {
      id: string;
      src: string;
      async: boolean;
    };
    head: {
      appendChild: (element: {
        id: string;
        src: string;
        async: boolean;
      }) => unknown;
    };
  };
};

type SubmissionResponse = {
  ok: boolean;
  status?: number;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
};

export type SuccessfulSubmission = {
  ok: true;
  entryId: string;
  submittedAt: string;
  gcsFolder: string;
};

export class SubmissionError extends Error {
  constructor(public readonly category: SubmissionErrorCategory) {
    super("Application submission failed");
  }
}

function attributionParameters(
  attribution: AttributionResolution
): Omit<DataLayerEvent, "event"> {
  const { values } = attribution;
  return {
    ...(values.app ? { app_param: values.app } : {}),
    ...(values.utm_id ? { attribution_utm_id: values.utm_id } : {}),
    ...(values.utm_source
      ? { attribution_utm_source: values.utm_source }
      : {}),
    ...(values.utm_medium
      ? { attribution_utm_medium: values.utm_medium }
      : {}),
    ...(values.utm_campaign
      ? { attribution_utm_campaign: values.utm_campaign }
      : {}),
    ...(values.utm_content
      ? { attribution_utm_content: values.utm_content }
      : {}),
    ...(values.utm_term ? { attribution_utm_term: values.utm_term } : {}),
    ...(values.utm_source_platform
      ? { attribution_utm_source_platform: values.utm_source_platform }
      : {}),
    attribution_origin: attribution.origin,
  };
}

export function createAnalytics(browser: AnalyticsBrowser) {
  let attribution: AttributionResolution = { origin: "none", values: {} };
  let initialized = false;
  let started = false;

  const push = (
    event: ApplicationEventName,
    parameters: Partial<DataLayerEvent> = {}
  ) => {
    browser.dataLayer ??= [];
    browser.dataLayer.push({
      event,
      ...attributionParameters(attribution),
      ...parameters,
    });
  };

  return {
    setAttribution(next: AttributionResolution) {
      attribution = next;
    },
    initialize() {
      if (initialized) return;
      initialized = true;
      browser.dataLayer ??= [];
      push("application_landing");

      if (!browser.document.getElementById(GTM_SCRIPT_ID)) {
        browser.dataLayer.push({
          "gtm.start": Date.now(),
          event: "gtm.js",
        });
        const script = browser.document.createElement("script");
        script.id = GTM_SCRIPT_ID;
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`;
        browser.document.head.appendChild(script);
      }
    },
    push,
    start() {
      if (started) return;
      started = true;
      push("application_start");
    },
  };
}

declare global {
  interface Window {
    dataLayer?: Array<DataLayerEvent | GtmBootstrapEvent>;
  }
}

const browserWindow: AnalyticsBrowser =
  typeof window === "undefined"
    ? {
        dataLayer: [],
        document: {
          getElementById: () => null,
          createElement: () => ({ id: "", src: "", async: false }),
          head: { appendChild: () => undefined },
        },
      }
    : (window as unknown as AnalyticsBrowser);

export const analytics = createAnalytics(browserWindow);

export async function processSubmissionResponse(
  response: SubmissionResponse,
  pushEvent: (event: ApplicationEventName) => void = analytics.push
): Promise<SuccessfulSubmission> {
  if (!response.ok) {
    await response.text?.().catch(() => "");
    throw new SubmissionError("http");
  }

  try {
    const result = (await response.json?.()) as
      | (SuccessfulSubmission & { error?: string })
      | { ok: false; error?: string }
      | undefined;
    if (!result?.ok) throw new SubmissionError("backend");
    pushEvent("generate_lead");
    return result;
  } catch (error) {
    if (error instanceof SubmissionError) throw error;
    throw new SubmissionError("unknown");
  }
}

export function classifySubmissionError(error: unknown): SubmissionErrorCategory {
  if (error instanceof SubmissionError) return error.category;
  if (error instanceof TypeError) return "network";
  return "unknown";
}
