import { describe, expect, it } from "vitest";
import type { FormData } from "../store";
import { generateApplicationPdf } from "./pdf";

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

describe("generated application PDF", () => {
  it("is A4 throughout, ends on the authorization page, and is fully rebranded", async () => {
    const pdfBuffer = decodePdfBuffer(
      await generateApplicationPdf({
        submittedAtIso: "2026-08-05T12:00:00.000Z",
        appParam: "synthetic",
        formData,
      }),
    );
    const raw = pdfBuffer.toString("latin1");

    const pageCount = (raw.match(/\/Type \/Page\n/g) ?? []).length;
    expect(pageCount).toBeGreaterThanOrEqual(1);
    expect(raw.match(/\/MediaBox \[0 0 595\.\d+ 841\.\d+\]/g)?.length ?? 0).toBe(pageCount);

    // The underwriting shell that used to be appended after the signature is
    // gone: no Statement Summary page, no label, no layout anchor.
    expect(raw).not.toContain("(Statement Summary) Tj");
    expect(raw).not.toContain("(BANK STATEMENT UNDERWRITING) Tj");
    expect(raw).not.toContain("NDBF_PDF_LAYOUT");

    // Brand. The watermark is drawn by src/lib/pdf.ts on every page; asserting
    // once per page is what stops a second draw path drifting away from it.
    expect(raw).toContain("(theapprovaldepartment) Tj");
    expect((raw.match(/\(theapprovaldepartment\) Tj/g) ?? []).length).toBe(pageCount);

    // The old trading name must not survive anywhere that is drawn on a page.
    // The Info dictionary /Title still reads "NextDay Biz Funding Signed
    // Application", which is why this is scoped to the stream objects.
    const drawn = [...raw.matchAll(/\nstream\n([\s\S]*?)\nendstream/g)]
      .map((match) => match[1])
      .join("\n");
    expect(drawn).not.toContain("NextDay Biz Funding");
    expect(drawn).not.toContain("nextdaybizfunding");
  });
});
