export const PDF_LAYOUT_VERSION: "underwriting-v1";

export type PdfLayoutContract = Readonly<{
  version: typeof PDF_LAYOUT_VERSION;
  page: Readonly<{ widthMm: number; heightMm: number; tolerancePoints: number }>;
  underwritingPage: Readonly<{ position: "last" }>;
  writableRect: Readonly<{
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
  }>;
  anchor: string;
  decodedLastPageContentSha256: string;
  rendering: Readonly<{
    label: Readonly<{
      text: string;
      xMm: number;
      yMm: number;
      fontSizePt: number;
    }>;
    sectionTitleFontSizePt: number;
    columnFontSizePt: number;
    columnLineHeightFactor: number;
    titleRuleOffsetMm: number;
    titleRuleWidthMm: number;
    columnYOffsetMm: number;
    columnRuleOffsetMm: number;
    columnRuleWidthMm: number;
    anchorFontSizePt: number;
    anchorRenderingMode: 3;
  }>;
  metadata: Readonly<{
    title: string;
    subject: string;
    keywords: string;
    creator: string;
  }>;
  sections: ReadonlyArray<
    Readonly<{
      id: "statement-summary" | "mca-deposits" | "debt-summary";
      title: string;
      titleYMm: number;
      columns: ReadonlyArray<
        Readonly<{
          label: string;
          xMm: number;
          align: "left" | "center" | "right";
        }>
      >;
    }>
  >;
}>;

export const PDF_LAYOUT_CONTRACTS: Readonly<
  Record<typeof PDF_LAYOUT_VERSION, PdfLayoutContract>
>;
export function getPdfLayoutContract(version: string): PdfLayoutContract | null;
export function normalizePdfLayoutVersion(value: unknown): string | null;
