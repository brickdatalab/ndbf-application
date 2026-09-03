const PAGE_WIDTH_MM = 210;
const MARGIN_X_MM = 18;
const RIGHT_MM = PAGE_WIDTH_MM - MARGIN_X_MM;
const NAVY = [0, 33, 64];
const BLUE = [0, 117, 223];
const MUTED = [120, 120, 120];
const RULE = [220, 220, 220];
// Watermark size, pinned literally rather than measured at runtime: it feeds the
// layout fingerprint, so a jsPDF metrics change must never move it silently.
// 72 x (223.520 / 280.924) — the widths of "nextdaybizfunding" and
// "theapprovaldepartment" at 72pt, so the longer word keeps the old footprint.
const WATERMARK_FONT_SIZE_PT = 57.2875226039783;

export function addUnderwritingSourcePage(document, layout) {
  // jsPDF serializes the active stroke state at page creation. Set it here so
  // the canonical page stream is independent of the preceding form content.
  document.setDrawColor(...RULE);
  document.setLineWidth(0.2);
  document.addPage("a4", "portrait");
  drawUnderwritingSourcePage(document, layout);
}

export function drawUnderwritingSourcePage(document, layout) {
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();

  document.saveGraphicsState();
  const GState = document.GState;
  if (GState) document.setGState(new GState({ opacity: 0.07 }));
  document.setFont("helvetica", "bold");
  document.setFontSize(WATERMARK_FONT_SIZE_PT);
  document.setTextColor(...NAVY);
  document.text("theapprovaldepartment", pageWidth / 2, pageHeight / 2, {
    align: "center",
    angle: 30,
    baseline: "middle",
  });
  document.restoreGraphicsState();

  document.setFillColor(...NAVY);
  document.rect(0, 0, PAGE_WIDTH_MM, 14, "F");
  document.setTextColor(255, 255, 255);
  document.setFont("helvetica", "bold");
  document.setFontSize(13);
  document.text("The Approval Department — Application", MARGIN_X_MM, 9.5);

  document.setFont("helvetica", "bold");
  document.setFontSize(layout.rendering.label.fontSizePt);
  document.setTextColor(...BLUE);
  document.text(
    layout.rendering.label.text,
    layout.rendering.label.xMm,
    layout.rendering.label.yMm,
  );

  for (const section of layout.sections) {
    document.setFont("helvetica", "bold");
    document.setFontSize(layout.rendering.sectionTitleFontSizePt);
    document.setTextColor(...NAVY);
    document.text(section.title, layout.writableRect.xMm, section.titleYMm);
    document.setDrawColor(...BLUE);
    document.setLineWidth(layout.rendering.titleRuleWidthMm);
    document.line(
      layout.writableRect.xMm,
      section.titleYMm + layout.rendering.titleRuleOffsetMm,
      layout.writableRect.xMm + layout.writableRect.widthMm,
      section.titleYMm + layout.rendering.titleRuleOffsetMm,
    );

    if (section.columns.length > 0) {
      document.setFontSize(layout.rendering.columnFontSizePt);
      document.setTextColor(...MUTED);
      for (const column of section.columns) {
        document.text(
          column.label.split("\n"),
          column.xMm,
          section.titleYMm + layout.rendering.columnYOffsetMm,
          {
            align: column.align ?? "left",
            lineHeightFactor: layout.rendering.columnLineHeightFactor,
          },
        );
      }
      document.setDrawColor(...RULE);
      document.setLineWidth(layout.rendering.columnRuleWidthMm);
      document.line(
        layout.writableRect.xMm,
        section.titleYMm + layout.rendering.columnRuleOffsetMm,
        layout.writableRect.xMm + layout.writableRect.widthMm,
        section.titleYMm + layout.rendering.columnRuleOffsetMm,
      );
    }
  }

  document.setFont("helvetica", "normal");
  document.setFontSize(layout.rendering.anchorFontSizePt);
  document.text(layout.anchor, layout.writableRect.xMm, layout.writableRect.yMm, {
    renderingMode: "invisible",
  });
}

export function drawSourcePdfFooter(document, pageNumber, pageTotal) {
  const pageHeight = document.internal.pageSize.getHeight();
  document.setDrawColor(...RULE);
  document.setLineWidth(0.2);
  document.line(MARGIN_X_MM, pageHeight - 14, RIGHT_MM, pageHeight - 14);
  document.setTextColor(...MUTED);
  document.setFont("helvetica", "normal");
  document.setFontSize(7.5);
  document.text(
    "The Approval Department  |  Confidential Application",
    MARGIN_X_MM,
    pageHeight - 8,
  );
  document.text(`Page ${pageNumber} of ${pageTotal}`, RIGHT_MM, pageHeight - 8, {
    align: "right",
  });
}
