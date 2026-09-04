import { describe, expect, it } from "vitest";
import type { FormData } from "../store";
import { generateApplicationPdf } from "./pdf";
import { EMPTY_UNDERWRITING, UNDERWRITING_LABELS } from "./underwriting";

/**
 * The drawn form of a field label: uppercased by pdf.ts, then PDF-string
 * escaped by jsPDF, which backslash-escapes parentheses.
 */
const drawnLabel = (key: keyof typeof UNDERWRITING_LABELS) =>
  `(${UNDERWRITING_LABELS[key].toUpperCase().replace(/[()]/g, (c) => `\\${c}`)}) Tj`;

const formData: FormData = {
  contactName: "Synthetic Applicant",
  contactEmail: "synthetic@example.invalid",
  contactPhone: "5555550100",
  businessLegalName: "Synthetic Business",
  dba: "",
  physicalAddress: { street: "1 Test Way", city: "Test", state: "NY", zip: "10001" },
  industry: "Other",
  industryOther: "Synthetic",
  stateOfIncorporation: "NY",
  businessStartedMonth: "1",
  businessStartedYear: "2020",
  federalTaxId: "00-0000000",
  businessEntityType: "LLC",
  grossAnnualSalesBucket: "lt_100k",
  requestedFundingAmount: "10000",
  owner: {
    fullName: "Synthetic Owner",
    ownershipPercentage: 100,
    ssn: "000-00-0000",
    dateOfBirth: "1980-01-01",
    address: { street: "1 Test Way", city: "Test", state: "NY", zip: "10001" },
  },
  bankStatements: [],
  signature: "",
  termsAccepted: true,
};

async function renderRaw(underwriting: Parameters<typeof generateApplicationPdf>[0]["underwriting"]) {
  const dataUri = await generateApplicationPdf({
    submittedAtIso: "2026-09-02T00:00:00.000Z",
    appParam: "synthetic",
    formData,
    underwriting,
  });
  const buffer = Buffer.from(dataUri.slice(dataUri.indexOf(",") + 1), "base64");
  return { buffer, raw: buffer.toString("latin1") };
}

describe("Underwriting section on the application PDF", () => {
  it("draws only the populated values, in order, under an Underwriting title", async () => {
    const { raw } = await renderRaw({
      ...EMPTY_UNDERWRITING,
      avg_monthly_deposits: "$52,340.00",
      avg_balance: "1250.55",
      open_mca: "Yes - 2 positions",
    });

    expect(raw).toContain("(UNDERWRITING) Tj");
    expect(raw).toContain(drawnLabel("avg_monthly_deposits"));
    expect(raw).toContain("($52,340.00) Tj");
    expect(raw).toContain(drawnLabel("avg_balance"));
    expect(raw).toContain("(1250.55) Tj");
    expect(raw).toContain(drawnLabel("open_mca"));
    expect(raw).toContain("(Yes - 2 positions) Tj");
    expect(raw).not.toContain("(TOTAL MCA DEBITS) Tj");
    expect(raw).not.toContain("(AVG NEGATIVE BALANCE DAYS) Tj");

    const order = ["(BANK STATEMENTS) Tj", "(UNDERWRITING) Tj", "(AUTHORIZATION AND AGREEMENT) Tj"].map((s) =>
      raw.indexOf(s),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));

    // The document now ends on the authorization page, so the Underwriting
    // section is the last thing drawn before the signature block.
    expect(raw).not.toContain("(Statement Summary) Tj");
    expect(raw).not.toContain("NDBF_PDF_LAYOUT");
  });

  it("wraps a long open_mca value instead of truncating it", async () => {
    const long = Array.from({ length: 40 }, (_, i) => `Lender${i + 1}`).join(" ");
    const { raw } = await renderRaw({ ...EMPTY_UNDERWRITING, open_mca: long });

    expect(raw).toContain(drawnLabel("open_mca"));
    expect(raw).toContain("Lender1 ");
    expect(raw).toContain("Lender40");
  });

  it("draws no Underwriting section when every value is null or the object is absent", async () => {
    for (const underwriting of [EMPTY_UNDERWRITING, null, undefined]) {
      const { raw } = await renderRaw(underwriting);
      expect(raw).not.toContain("(UNDERWRITING) Tj");
      expect(raw).not.toContain(drawnLabel("avg_monthly_deposits"));
      expect(raw).not.toContain(drawnLabel("open_mca"));
    }
  });
});
