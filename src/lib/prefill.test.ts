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

  it("maps the business address parameters into physicalAddress", () => {
    expect(
      getUrlPrefill(
        new URLSearchParams(
          "business_street=12+Main+St+Ste+4&business_city=Brooklyn&business_state=ny&business_zip=11201"
        )
      )
    ).toEqual({
      physicalAddress: {
        street: "12 Main St Ste 4",
        city: "Brooklyn",
        state: "NY",
        zip: "11201",
      },
    });
  });

  it("fills only the address parts the URL carries and leaves the rest blank", () => {
    expect(getUrlPrefill(new URLSearchParams("business_city=Austin"))).toEqual({
      physicalAddress: { street: "", city: "Austin", state: "", zip: "" },
    });
  });

  it("omits physicalAddress entirely when no address parameter is present", () => {
    expect(getUrlPrefill(new URLSearchParams("email=a%40b.co"))).toEqual({
      contactEmail: "a@b.co",
    });
  });

  it("keeps address parts already in state when the URL carries only some", () => {
    expect(
      getUrlPrefill(new URLSearchParams("business_city=Austin"), {
        street: "12 Main St",
        city: "Brooklyn",
        state: "NY",
        zip: "11201",
      })
    ).toEqual({
      physicalAddress: {
        street: "12 Main St",
        city: "Austin",
        state: "NY",
        zip: "11201",
      },
    });
  });

  it("ignores a state that is not a US state code", () => {
    expect(getUrlPrefill(new URLSearchParams("business_state=New+York"))).toEqual({});
    expect(getUrlPrefill(new URLSearchParams("business_state=XX"))).toEqual({});
  });

  it("keeps only the first five digits of the ZIP", () => {
    expect(getUrlPrefill(new URLSearchParams("business_zip=11201-3410"))).toEqual({
      physicalAddress: { street: "", city: "", state: "", zip: "11201" },
    });
    expect(getUrlPrefill(new URLSearchParams("business_zip=abc"))).toEqual({});
  });

  it("formats the EIN the same way the form field does", () => {
    expect(getUrlPrefill(new URLSearchParams("ein=123456789"))).toEqual({
      federalTaxId: "12-3456789",
    });
    expect(getUrlPrefill(new URLSearchParams("ein=12-3456789"))).toEqual({
      federalTaxId: "12-3456789",
    });
    expect(getUrlPrefill(new URLSearchParams("ein=12+3456789"))).toEqual({
      federalTaxId: "12-3456789",
    });
    // Digits beyond nine are dropped, matching formatEIN's cap.
    expect(getUrlPrefill(new URLSearchParams("ein=1234567890000"))).toEqual({
      federalTaxId: "12-3456789",
    });
    expect(getUrlPrefill(new URLSearchParams("ein=not-an-ein"))).toEqual({});
  });

  it("removes PII prefill parameters while retaining attribution parameters", () => {
    const params = new URLSearchParams(
      "app=nicole&utm_source=mailgun&utm_campaign=july&first_name=Jim&last_name=Smith&full_name=James+Smith&email=jim%40example.com&phone=5555550100&business_legal_name=Jim%27s+Gym&ein=12-3456789&business_street=12+Main+St&business_city=Brooklyn&business_state=NY&business_zip=11201&prefill=secret&contact_id=1&recipient_id=2&message_id=3&application_id=4&entry_id=5"
    );

    expect(removeUrlPrefillParams(params).toString()).toBe(
      "app=nicole&utm_source=mailgun&utm_campaign=july"
    );
    expect(params.has("email")).toBe(true);
  });
});
