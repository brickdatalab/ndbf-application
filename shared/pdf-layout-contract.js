export const PDF_LAYOUT_VERSION = "underwriting-v1";

export const PDF_LAYOUT_CONTRACTS = Object.freeze({
  [PDF_LAYOUT_VERSION]: Object.freeze({
    version: PDF_LAYOUT_VERSION,
    page: Object.freeze({ widthMm: 210, heightMm: 297, tolerancePoints: 1 }),
    underwritingPage: Object.freeze({ position: "last" }),
    writableRect: Object.freeze({ xMm: 18, yMm: 38, widthMm: 174, heightMm: 236 }),
    anchor: "NDBF_PDF_LAYOUT|underwriting-v1|page=underwriting|rect=18,38,174,236",
    decodedLastPageContentSha256: "5d89f8df5d19e02b4bd7e9149606f7ce618fdcd950677c5c87e81e1c830de5b0",
    acceptedDecodedLastPageContentSha256: Object.freeze([
      "5d89f8df5d19e02b4bd7e9149606f7ce618fdcd950677c5c87e81e1c830de5b0",
      "7f6780285f894c62eeb1e8105ccebc51852834672ffaf69ca8b7dc547976b632",
    ]),
    rendering: Object.freeze({
      label: Object.freeze({
        text: "BANK STATEMENT UNDERWRITING",
        xMm: 18,
        yMm: 27,
        fontSizePt: 6.2,
      }),
      sectionTitleFontSizePt: 10.5,
      columnFontSizePt: 5.2,
      columnLineHeightFactor: 1.05,
      titleRuleOffsetMm: 2.5,
      titleRuleWidthMm: 0.35,
      columnYOffsetMm: 8,
      columnRuleOffsetMm: 13,
      columnRuleWidthMm: 0.16,
      anchorFontSizePt: 1,
      anchorRenderingMode: 3,
    }),
    metadata: Object.freeze({
      title: "NextDay Biz Funding Signed Application",
      subject: "NDBF signed source PDF layout underwriting-v1",
      keywords: "ndbf,signed-source,underwriting-v1",
      creator: "ndbf-application",
    }),
    sections: Object.freeze([
      Object.freeze({
        id: "statement-summary",
        title: "Statement Summary",
        titleYMm: 35,
        columns: Object.freeze([
          Object.freeze({ label: "Statement period", xMm: 18, align: "left" }),
          Object.freeze({ label: "Deposits", xMm: 68, align: "left" }),
          Object.freeze({ label: "Deposit\ncount", xMm: 82, align: "left" }),
          Object.freeze({ label: "True revenue", xMm: 98, align: "left" }),
          Object.freeze({ label: "Withdrawals", xMm: 122, align: "left" }),
          Object.freeze({ label: "Neg Ending\nDays", xMm: 146, align: "left" }),
          Object.freeze({ label: "Avg. daily\nbalance", xMm: 163, align: "left" }),
          Object.freeze({ label: "MCA\ndetected", xMm: 185, align: "left" }),
        ]),
      }),
    ]),
  }),
});

export function getPdfLayoutContract(version) {
  return PDF_LAYOUT_CONTRACTS[version] ?? null;
}

export function normalizePdfLayoutVersion(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return "__invalid__";
  return value.trim() || "__invalid__";
}
