import { describe, expect, it } from "vitest";
import {
  EMPTY_UNDERWRITING,
  UNDERWRITING_PARAMS,
  getUrlUnderwriting,
  hasUnderwritingValues,
  removeUrlUnderwritingParams,
} from "./underwriting";

describe("getUrlUnderwriting", () => {
  it("maps all five URL parameters to trimmed string values", () => {
    const values = getUrlUnderwriting(
      new URLSearchParams(
        "avg_monthly_deposits=%2452%2C340.00&total_mca_debits=+8100+&avg_balance=1250.55&avg_negative_balance_days=3&open_mca=Yes+-+2+positions"
      )
    );

    expect(values).toEqual({
      avg_monthly_deposits: "$52,340.00",
      total_mca_debits: "8100",
      avg_balance: "1250.55",
      avg_negative_balance_days: "3",
      open_mca: "Yes - 2 positions",
    });
    expect(hasUnderwritingValues(values)).toBe(true);
  });

  it("returns null for missing or blank parameters and keeps the rest", () => {
    const values = getUrlUnderwriting(
      new URLSearchParams("avg_balance=900&open_mca=%20%20&total_mca_debits=")
    );

    expect(values).toEqual({
      ...EMPTY_UNDERWRITING,
      avg_balance: "900",
    });
  });

  it("returns all nulls when none are present", () => {
    const values = getUrlUnderwriting(new URLSearchParams("app=nicole&email=a%40b.c"));
    expect(values).toEqual(EMPTY_UNDERWRITING);
    expect(hasUnderwritingValues(values)).toBe(false);
    expect(hasUnderwritingValues(null)).toBe(false);
  });

  it("caps four values at 100 characters and open_mca at 400", () => {
    const long = "x".repeat(500);
    const params = new URLSearchParams();
    for (const param of UNDERWRITING_PARAMS) params.set(param, long);

    const values = getUrlUnderwriting(params);

    expect(values.avg_monthly_deposits).toHaveLength(100);
    expect(values.total_mca_debits).toHaveLength(100);
    expect(values.avg_balance).toHaveLength(100);
    expect(values.avg_negative_balance_days).toHaveLength(100);
    expect(values.open_mca).toHaveLength(400);
  });

  it("does not validate or reformat numbers", () => {
    const values = getUrlUnderwriting(new URLSearchParams("avg_balance=not-a-number"));
    expect(values.avg_balance).toBe("not-a-number");
  });
});

describe("removeUrlUnderwritingParams", () => {
  it("removes only the five underwriting parameters", () => {
    const sanitized = removeUrlUnderwritingParams(
      new URLSearchParams(
        "app=nicole&email=a%40b.c&avg_monthly_deposits=1&total_mca_debits=2&avg_balance=3&avg_negative_balance_days=4&open_mca=5&utm_source=x"
      )
    );

    expect(sanitized.toString()).toBe("app=nicole&email=a%40b.c&utm_source=x");
  });
});
