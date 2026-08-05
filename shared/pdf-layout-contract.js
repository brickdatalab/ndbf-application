export const PDF_LAYOUT_VERSION = "underwriting-v1";

export const PDF_LAYOUT_CONTRACTS = Object.freeze({
  [PDF_LAYOUT_VERSION]: Object.freeze({
    version: PDF_LAYOUT_VERSION,
    page: Object.freeze({ widthMm: 210, heightMm: 297, tolerancePoints: 1 }),
    underwritingPage: Object.freeze({ position: "last" }),
    writableRect: Object.freeze({ xMm: 18, yMm: 38, widthMm: 174, heightMm: 236 }),
    anchor: "NDBF_PDF_LAYOUT|underwriting-v1|page=underwriting|rect=18,38,174,236",
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
          Object.freeze({ label: "Deposits", xMm: 74, align: "right" }),
          Object.freeze({ label: "Deposit\ncount", xMm: 84, align: "center" }),
          Object.freeze({ label: "True revenue", xMm: 111, align: "right" }),
          Object.freeze({ label: "Withdrawals", xMm: 137, align: "right" }),
          Object.freeze({ label: "Neg Ending\nDays", xMm: 153, align: "center" }),
          Object.freeze({ label: "Avg. daily\nbalance", xMm: 177, align: "right" }),
          Object.freeze({ label: "MCA\ndetected", xMm: 191, align: "right" }),
        ]),
      }),
      Object.freeze({
        id: "mca-deposits",
        title: "MCA Deposits",
        titleYMm: 65,
        columns: Object.freeze([
          Object.freeze({ label: "Account last four", xMm: 18, align: "left" }),
          Object.freeze({ label: "Lender", xMm: 62, align: "left" }),
          Object.freeze({ label: "Deposit date", xMm: 112, align: "left" }),
          Object.freeze({ label: "Amount", xMm: 151, align: "right" }),
          Object.freeze({ label: "Statement period", xMm: 192, align: "right" }),
        ]),
      }),
      Object.freeze({
        id: "debt-summary",
        title: "Debt Summary",
        titleYMm: 95,
        columns: Object.freeze([
          Object.freeze({ label: "Lender", xMm: 18, align: "left" }),
          Object.freeze({ label: "Debt type", xMm: 58, align: "left" }),
          Object.freeze({ label: "First\npayment", xMm: 82, align: "center" }),
          Object.freeze({ label: "Last\npayment", xMm: 104, align: "center" }),
          Object.freeze({ label: "Status", xMm: 123, align: "center" }),
          Object.freeze({ label: "Payments", xMm: 139, align: "right" }),
          Object.freeze({ label: "Total paid", xMm: 157, align: "right" }),
          Object.freeze({ label: "Frequency", xMm: 174, align: "right" }),
          Object.freeze({ label: "Est.\nmonthly", xMm: 192, align: "right" }),
        ]),
      }),
    ]),
  }),
});

export function getPdfLayoutContract(version) {
  return PDF_LAYOUT_CONTRACTS[version] ?? null;
}

export function normalizePdfLayoutVersion(value) {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" ? value.trim() || null : "__invalid__";
}
