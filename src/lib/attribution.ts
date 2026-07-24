export const ATTRIBUTION_STORAGE_KEY = "ndbf-attribution-v1";
export const ATTRIBUTION_VERSION = 1;
export const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const ATTRIBUTION_PARAMS = [
  "app",
  "utm_id",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_source_platform",
] as const;

export type AttributionParam = (typeof ATTRIBUTION_PARAMS)[number];
export type AttributionValues = Partial<Record<AttributionParam, string>>;
export type AttributionOrigin = "url" | "stored" | "none";

export type AttributionResolution = {
  origin: AttributionOrigin;
  values: AttributionValues;
};

export type AttributionStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

type StoredAttribution = AttributionValues & {
  version: number;
  capturedAt: number;
  expiresAt: number;
};

function readStoredAttribution(
  storage: AttributionStorage,
  now: number
): StoredAttribution | null {
  const raw = storage.getItem(ATTRIBUTION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      parsed.version !== ATTRIBUTION_VERSION ||
      typeof parsed.capturedAt !== "number" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now
    ) {
      storage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return null;
    }

    const safe: StoredAttribution = {
      version: ATTRIBUTION_VERSION,
      capturedAt: parsed.capturedAt,
      expiresAt: parsed.expiresAt,
    };
    for (const param of ATTRIBUTION_PARAMS) {
      if (typeof parsed[param] === "string" && parsed[param].trim()) {
        safe[param] = parsed[param].trim();
      }
    }
    return safe;
  } catch {
    storage.removeItem(ATTRIBUTION_STORAGE_KEY);
    return null;
  }
}

function readExplicitAttribution(searchParams: URLSearchParams): AttributionValues {
  const values: AttributionValues = {};
  for (const param of ATTRIBUTION_PARAMS) {
    const value = searchParams.get(param)?.trim();
    if (value) values[param] = value;
  }
  return values;
}

export function resolveAttribution(
  searchParams: URLSearchParams,
  storage: AttributionStorage,
  now = Date.now()
): AttributionResolution {
  const stored = readStoredAttribution(storage, now);
  const explicit = readExplicitAttribution(searchParams);
  const hasExplicit = Object.keys(explicit).length > 0;

  if (hasExplicit) {
    const values: AttributionValues = {};
    for (const param of ATTRIBUTION_PARAMS) {
      const value = explicit[param] ?? stored?.[param];
      if (value) values[param] = value;
    }

    const record: StoredAttribution = {
      version: ATTRIBUTION_VERSION,
      capturedAt: now,
      expiresAt: now + ATTRIBUTION_TTL_MS,
      ...values,
    };
    storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(record));
    return { origin: "url", values };
  }

  if (stored) {
    const values: AttributionValues = {};
    for (const param of ATTRIBUTION_PARAMS) {
      if (stored[param]) values[param] = stored[param];
    }
    return { origin: "stored", values };
  }

  return { origin: "none", values: {} };
}
