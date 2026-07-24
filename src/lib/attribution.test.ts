import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_STORAGE_KEY,
  resolveAttribution,
  type AttributionStorage,
} from "./attribution";

function memoryStorage(initial?: string): AttributionStorage {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
  };
}

describe("resolveAttribution", () => {
  it("captures trimmed safe URL values for 30 days without PII", () => {
    const storage = memoryStorage();
    const now = Date.UTC(2026, 6, 23);
    const result = resolveAttribution(
      new URLSearchParams(
        "app=%20nicole%20&utm_id=mg_1&utm_source=mailgun&utm_medium=email" +
          "&utm_campaign=july&utm_content=cta_a&utm_term=working_capital" +
          "&utm_source_platform=mailgun&email=private%40example.com&contact_id=123"
      ),
      storage,
      now
    );

    expect(result.origin).toBe("url");
    expect(result.values).toEqual({
      app: "nicole",
      utm_id: "mg_1",
      utm_source: "mailgun",
      utm_medium: "email",
      utm_campaign: "july",
      utm_content: "cta_a",
      utm_term: "working_capital",
      utm_source_platform: "mailgun",
    });

    const stored = JSON.parse(storage.getItem(ATTRIBUTION_STORAGE_KEY) ?? "{}");
    expect(stored.expiresAt).toBe(now + 30 * 24 * 60 * 60 * 1000);
    expect(stored).not.toHaveProperty("email");
    expect(stored).not.toHaveProperty("contact_id");
  });

  it("merges explicit non-empty fields without clearing stored values", () => {
    const now = Date.UTC(2026, 6, 23);
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        capturedAt: now - 1_000,
        expiresAt: now + 10_000,
        app: "nicole",
        utm_source: "mailgun",
        utm_campaign: "old",
      })
    );

    const result = resolveAttribution(
      new URLSearchParams("utm_campaign=%20new%20&utm_source="),
      storage,
      now
    );

    expect(result.origin).toBe("url");
    expect(result.values).toMatchObject({
      app: "nicole",
      utm_source: "mailgun",
      utm_campaign: "new",
    });
  });

  it("restores non-expired attribution for a bare URL", () => {
    const now = Date.UTC(2026, 6, 23);
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        capturedAt: now - 1_000,
        expiresAt: now + 10_000,
        app: "nicole",
        utm_medium: "email",
      })
    );

    expect(resolveAttribution(new URLSearchParams(), storage, now)).toEqual({
      origin: "stored",
      values: { app: "nicole", utm_medium: "email" },
    });
  });

  it.each([
    ["malformed", "not-json"],
    [
      "expired",
      JSON.stringify({
        version: 1,
        capturedAt: 1,
        expiresAt: 2,
        app: "expired",
      }),
    ],
  ])("discards %s storage safely", (_label, initial) => {
    const storage = memoryStorage(initial);
    expect(resolveAttribution(new URLSearchParams(), storage, 3)).toEqual({
      origin: "none",
      values: {},
    });
    expect(storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });
});
