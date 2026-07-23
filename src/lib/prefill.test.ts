import { describe, expect, it } from "vitest";
import { getUrlPrefill } from "./prefill";

describe("getUrlPrefill", () => {
  it("maps direct URL parameters to the application fields", () => {
    const prefill = getUrlPrefill(
      new URLSearchParams(
        "full_name=Jane+Doe&email=jane%40example.com&phone=%28555%29+555-0100&business_legal_name=Acme+LLC"
      )
    );

    expect(prefill).toEqual({
      contactName: "Jane Doe",
      contactEmail: "jane@example.com",
      contactPhone: "(555) 555-0100",
      businessLegalName: "Acme LLC",
    });
  });

  it("does not overwrite fields for missing or blank parameters", () => {
    expect(getUrlPrefill(new URLSearchParams("full_name=%20%20&email="))).toEqual({});
  });

  it("builds a full name from first and last name when either value is present", () => {
    expect(
      getUrlPrefill(new URLSearchParams("first_name=%20Jim%20&last_name=%20%20"))
    ).toEqual({ contactName: "Jim" });

    expect(
      getUrlPrefill(new URLSearchParams("first_name=Jim&last_name=Smith"))
    ).toEqual({ contactName: "Jim Smith" });
  });

  it("prefers first and last name over full_name and formats phone digits", () => {
    expect(
      getUrlPrefill(
        new URLSearchParams("full_name=James+Smith&first_name=Jim&phone=5555550100")
      )
    ).toEqual({
      contactName: "Jim",
      contactPhone: "(555) 555-0100",
    });
  });
});
