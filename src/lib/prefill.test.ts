import { describe, expect, it } from "vitest";
import {
  getUrlOwnerAddress,
  getUrlOwnerDob,
  getUrlPrefill,
  removeUrlPrefillParams,
} from "./prefill";

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

  it("reduces the requested amount to whole dollars", () => {
    expect(getUrlPrefill(new URLSearchParams("amount_requested=200000"))).toEqual({
      requestedFundingAmount: "200000",
    });
    // Cents are dropped, not concatenated — "200000.00" must not become 20,000,000.
    expect(getUrlPrefill(new URLSearchParams("amount_requested=200000.00"))).toEqual({
      requestedFundingAmount: "200000",
    });
    expect(getUrlPrefill(new URLSearchParams("amount_requested=%24200%2C000.50"))).toEqual({
      requestedFundingAmount: "200000",
    });
    expect(getUrlPrefill(new URLSearchParams("amount_requested=none"))).toEqual({});
    expect(getUrlPrefill(new URLSearchParams("amount_requested=0"))).toEqual({});
  });

  it("splits start_date into an unpadded month and a year", () => {
    // "07" is not one of the month <option> values — only "7" is.
    expect(getUrlPrefill(new URLSearchParams("start_date=2014-07-28"))).toEqual({
      businessStartedMonth: "7",
      businessStartedYear: "2014",
    });
    expect(getUrlPrefill(new URLSearchParams("start_date=2014-12"))).toEqual({
      businessStartedMonth: "12",
      businessStartedYear: "2014",
    });
  });

  it("ignores a start_date outside the year dropdown or otherwise malformed", () => {
    const nextYear = String(new Date().getFullYear() + 1);
    expect(getUrlPrefill(new URLSearchParams(`start_date=${nextYear}-01-01`))).toEqual({});
    expect(getUrlPrefill(new URLSearchParams("start_date=1919-01-01"))).toEqual({});
    expect(getUrlPrefill(new URLSearchParams("start_date=2014-13-01"))).toEqual({});
    expect(getUrlPrefill(new URLSearchParams("start_date=2014-00-01"))).toEqual({});
    expect(getUrlPrefill(new URLSearchParams("start_date=July+2014"))).toEqual({});
    expect(getUrlPrefill(new URLSearchParams("start_date=2014"))).toEqual({});
  });

  it("passes a valid dob through as ISO", () => {
    expect(getUrlPrefill(new URLSearchParams("dob=1949-08-18"))).toEqual({});
    expect(getUrlOwnerDob(new URLSearchParams("dob=1949-08-18"))).toBe("1949-08-18");
    expect(getUrlOwnerDob(new URLSearchParams("dob=2010-12-31"))).toBe("2010-12-31");
    expect(getUrlOwnerDob(new URLSearchParams("dob=1910-01-01"))).toBe("1910-01-01");
  });

  it("ignores a dob outside the picker range or not a real date", () => {
    expect(getUrlOwnerDob(new URLSearchParams("dob=2011-01-01"))).toBeNull();
    expect(getUrlOwnerDob(new URLSearchParams("dob=1909-12-31"))).toBeNull();
    expect(getUrlOwnerDob(new URLSearchParams("dob=1949-02-30"))).toBeNull();
    expect(getUrlOwnerDob(new URLSearchParams("dob=1949-8-18"))).toBeNull();
    expect(getUrlOwnerDob(new URLSearchParams("dob=08%2F18%2F1949"))).toBeNull();
    expect(getUrlOwnerDob(new URLSearchParams("business_city=Austin"))).toBeNull();
  });

  it("maps the owner address parameters", () => {
    expect(
      getUrlOwnerAddress(
        new URLSearchParams(
          "owner_street=1097+QUIET+RD&owner_city=MOUNT+PLEASANT&owner_state=sc&owner_zip=29464"
        )
      )
    ).toEqual({
      street: "1097 QUIET RD",
      city: "MOUNT PLEASANT",
      state: "SC",
      zip: "29464",
    });
  });

  it("returns null when the URL carries no owner address part", () => {
    expect(getUrlOwnerAddress(new URLSearchParams("business_city=Austin"))).toBeNull();
  });

  it("keeps owner address parts already in state when the URL carries only some", () => {
    expect(
      getUrlOwnerAddress(new URLSearchParams("owner_city=Austin"), {
        street: "1097 QUIET RD",
        city: "MOUNT PLEASANT",
        state: "SC",
        zip: "29464",
      })
    ).toEqual({
      street: "1097 QUIET RD",
      city: "Austin",
      state: "SC",
      zip: "29464",
    });
  });

  it("applies the same state and ZIP rules to the owner address", () => {
    expect(
      getUrlOwnerAddress(new URLSearchParams("owner_state=District+of+Columbia&owner_zip=29464-1234"))
    ).toEqual({ street: "", city: "", state: "", zip: "29464" });
    expect(getUrlOwnerAddress(new URLSearchParams("owner_state=DC"))).toEqual({
      street: "",
      city: "",
      state: "DC",
      zip: "",
    });
  });

  it("removes PII prefill parameters while retaining attribution parameters", () => {
    const params = new URLSearchParams(
      "app=nicole&utm_source=mailgun&utm_campaign=july&first_name=Jim&last_name=Smith&full_name=James+Smith&email=jim%40example.com&phone=5555550100&business_legal_name=Jim%27s+Gym&ein=12-3456789&business_street=12+Main+St&business_city=Brooklyn&business_state=NY&business_zip=11201&owner_street=9+Home+Ln&owner_city=Queens&owner_state=NY&owner_zip=11375&amount_requested=200000&start_date=2014-07-28&dob=1949-08-18&prefill=secret&contact_id=1&recipient_id=2&message_id=3&application_id=4&entry_id=5"
    );

    expect(removeUrlPrefillParams(params).toString()).toBe(
      "app=nicole&utm_source=mailgun&utm_campaign=july"
    );
    expect(params.has("email")).toBe(true);
  });
});
