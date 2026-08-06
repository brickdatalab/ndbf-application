import { describe, expect, it } from "vitest";
import type { FormData } from "../store";
import { PDF_LAYOUT_VERSION, getPdfLayoutContract } from "../../shared/pdf-layout-contract.js";
import { generateApplicationPdf } from "./pdf";
import { fingerprintDecodedUnderwritingPageContent } from "../../shared/pdf-layout-fingerprint.js";
import { validateDeclaredPdfLayout } from "../../shared/pdf-layout-validator.js";

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

function decodePdfBuffer(dataUri: string) {
  const encoded = dataUri.slice(dataUri.indexOf(",") + 1);
  return Buffer.from(encoded, "base64");
}

describe("underwriting-v1 signed source PDF", () => {
  it("adds an A4, transparent, blank underwriting shell with metadata and anchor", async () => {
    const contract = getPdfLayoutContract(PDF_LAYOUT_VERSION);
    expect(contract).not.toBeNull();
    const pdfBuffer = decodePdfBuffer(
      await generateApplicationPdf({
        submittedAtIso: "2026-08-05T12:00:00.000Z",
        appParam: "synthetic",
        formData,
      }),
    );
    const raw = pdfBuffer.toString("latin1");

    expect((raw.match(/\/Type \/Page\n/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(raw.match(/\/MediaBox \[0 0 595\.\d+ 841\.\d+\]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(raw).toContain(`(${contract?.metadata.subject})`);
    expect(raw).toContain(`(${contract?.anchor})`);
    expect(raw.split(contract?.anchor ?? "").length - 1).toBe(1);
    expect(raw).toContain("(nextdaybizfunding) Tj");
    expect(raw).toContain("(BANK STATEMENT UNDERWRITING) Tj");
    expect(raw).toContain("(Statement Summary) Tj");
    expect(raw).not.toContain("(Statement period) Tj");
    expect(raw).not.toContain("(Deposits) Tj");
    expect(raw).not.toContain("(True revenue) Tj");
    expect(raw).not.toContain("(MCA Deposits) Tj");
    expect(raw).not.toContain("(Debt Summary) Tj");
    expect(raw).not.toContain("Entry #");

    const pageStreams = [...raw.matchAll(/\nstream\n([\s\S]*?)\nendstream/g)];
    const lastPageStream = pageStreams.at(-1)?.[1] ?? "";
    expect(lastPageStream).toContain("(nextdaybizfunding) Tj");
    expect(lastPageStream).not.toMatch(/\$\d/);
    expect(fingerprintDecodedUnderwritingPageContent(lastPageStream, 2)).toBe(
      contract?.decodedLastPageContentSha256,
    );
    await expect(
      validateDeclaredPdfLayout({
        declaredVersion: PDF_LAYOUT_VERSION,
        pdfBuffer,
      }),
    ).resolves.toBe(PDF_LAYOUT_VERSION);
  });
});
