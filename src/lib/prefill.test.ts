import { describe, expect, it } from "vitest";
import { getUrlPrefill, removeUrlPrefillParams } from "./prefill";

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

  it("removes PII prefill parameters while retaining attribution parameters", () => {
    const params = new URLSearchParams(
      "app=nicole&utm_source=mailgun&utm_campaign=july&first_name=Jim&last_name=Smith&full_name=James+Smith&email=jim%40example.com&phone=5555550100&business_legal_name=Jim%27s+Gym&prefill=secret&contact_id=1&recipient_id=2&message_id=3&application_id=4&entry_id=5"
    );

    expect(removeUrlPrefillParams(params).toString()).toBe(
      "app=nicole&utm_source=mailgun&utm_campaign=july"
    );
    expect(params.has("email")).toBe(true);
  });
});
