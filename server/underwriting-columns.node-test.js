import assert from "node:assert/strict";
import test from "node:test";

import { buildBqRow } from "./server.js";

const UNDERWRITING_COLUMNS = [
  "avg_monthly_deposits",
  "total_mca_debits",
  "avg_balance",
  "avg_negative_balance_days",
  "open_mca",
];

function row(payloadOverrides = {}) {
  return buildBqRow({
    entryId: "ndbf_test",
    submittedAt: "2026-09-02T00:00:00.000Z",
    payload: {
      appParam: "synthetic-rep",
      utm: {},
      formData: {
        businessLegalName: "Synthetic Business",
        businessStartedMonth: "1",
        businessStartedYear: "2020",
        grossAnnualSalesBucket: "lt_100k",
        owner: {},
        physicalAddress: {},
      },
      ...payloadOverrides,
    },
    pdfLayoutVersion: null,
    pdfSourceGeneration: null,
    pdfSourceSha256: null,
    gcsFolder: "synthetic_business_ndbf_test",
    bankKeys: [],
    pdfKey: null,
    ipAddress: null,
    userAgent: null,
  });
}

test("maps the five underwriting values to their own columns as strings", () => {
  const result = row({
    underwriting: {
      avg_monthly_deposits: "52340",
      total_mca_debits: " 8100 ",
      avg_balance: "1250.55",
      avg_negative_balance_days: "3",
      open_mca: "Yes - 2 positions",
    },
  });

  assert.equal(result.avg_monthly_deposits, "52340");
  assert.equal(result.total_mca_debits, "8100");
  assert.equal(result.avg_balance, "1250.55");
  assert.equal(result.avg_negative_balance_days, "3");
  assert.equal(result.open_mca, "Yes - 2 positions");
  assert.equal(JSON.parse(result.raw_payload_json).underwriting.open_mca, "Yes - 2 positions");
});

test("writes NULL for every underwriting column when the values are absent, blank, or the object is missing", () => {
  const missingObject = row();
  const blankValues = row({
    underwriting: {
      avg_monthly_deposits: "",
      total_mca_debits: "   ",
      avg_balance: null,
      avg_negative_balance_days: undefined,
      open_mca: "",
    },
  });
  for (const column of UNDERWRITING_COLUMNS) {
    assert.equal(missingObject[column], null, `${column} should be null when the object is missing`);
    assert.equal(blankValues[column], null, `${column} should be null when blank`);
  }
});

test("caps four columns at 100 characters and open_mca at 600", () => {
  const long = "x".repeat(700);
  const result = row({
    underwriting: Object.fromEntries(UNDERWRITING_COLUMNS.map((column) => [column, long])),
  });

  assert.equal(result.avg_monthly_deposits.length, 100);
  assert.equal(result.total_mca_debits.length, 100);
  assert.equal(result.avg_balance.length, 100);
  assert.equal(result.avg_negative_balance_days.length, 100);
  assert.equal(result.open_mca.length, 600);
});

test("existing columns are unchanged by the underwriting object", () => {
  const withValues = row({ underwriting: { avg_balance: "1" } });
  const without = row();
  for (const key of Object.keys(without)) {
    if (UNDERWRITING_COLUMNS.includes(key) || key === "raw_payload_json") continue;
    assert.deepEqual(withValues[key], without[key], `${key} changed`);
  }
});
