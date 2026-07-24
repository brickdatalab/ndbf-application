import { describe, expect, it, vi } from "vitest";
import {
  createAnalytics,
  processSubmissionResponse,
  type DataLayerEvent,
} from "./analytics";

function analyticsHarness() {
  const dataLayer: DataLayerEvent[] = [];
  const scripts: Array<{ id: string; src: string; async: boolean }> = [];
  const browser = {
    dataLayer,
    document: {
      getElementById: (id: string) => scripts.find((script) => script.id === id) ?? null,
      createElement: () => ({ id: "", src: "", async: false }),
      head: { appendChild: (script: (typeof scripts)[number]) => scripts.push(script) },
    },
  };
  return { browser, dataLayer, scripts };
}

describe("analytics", () => {
  it("loads GTM once and sends only defined safe attribution fields", () => {
    const { browser, dataLayer, scripts } = analyticsHarness();
    const analytics = createAnalytics(browser);
    analytics.setAttribution({
      origin: "url",
      values: { app: "nicole", utm_source: "mailgun" },
    });

    analytics.initialize();
    analytics.initialize();

    expect(scripts).toHaveLength(1);
    expect(dataLayer).toEqual([
      {
        event: "application_landing",
        app_param: "nicole",
        attribution_utm_source: "mailgun",
        attribution_origin: "url",
      },
    ]);
    expect(dataLayer[0]).not.toHaveProperty("attribution_utm_medium");
  });

  it("fires application_start only for the first meaningful interaction", () => {
    const { browser, dataLayer } = analyticsHarness();
    const analytics = createAnalytics(browser);
    analytics.setAttribution({ origin: "none", values: {} });

    analytics.start();
    analytics.start();

    expect(dataLayer.map(({ event }) => event)).toEqual(["application_start"]);
  });

  it("emits generate_lead only after a successful backend result", async () => {
    const push = vi.fn();
    const success = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        entryId: "server-only-id",
        submittedAt: "2026-07-23T00:00:00.000Z",
        gcsFolder: "server-only-folder",
      }),
    };

    const pending = processSubmissionResponse(success, push);
    expect(push).not.toHaveBeenCalled();
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(push).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith("generate_lead");
    expect(push).not.toHaveBeenCalledWith(
      "generate_lead",
      expect.objectContaining({ entryId: expect.anything() })
    );
  });

  it.each([
    [{ ok: false, status: 500, text: vi.fn().mockResolvedValue("private") }, "http"],
    [{ ok: true, json: vi.fn().mockResolvedValue({ ok: false, error: "private" }) }, "backend"],
  ])("classifies submission failures without exposing response data", async (response, category) => {
    const push = vi.fn();
    await expect(processSubmissionResponse(response, push)).rejects.toMatchObject({
      category,
    });
    expect(push).not.toHaveBeenCalled();
  });
});
