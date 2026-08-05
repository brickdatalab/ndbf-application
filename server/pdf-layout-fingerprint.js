import { createHash } from "node:crypto";

const NUMBER = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
const PAGE_FOOTER_PATTERN = new RegExp(
  `BT\\n/F1 7\\.5 Tf\\n8\\.625 TL\\n0\\.471 g\\n0 Tr\\n(${NUMBER}) (22\\.6771653543306684) Td\\n\\(Page ([1-9]\\d*) of ([1-9]\\d*)\\) Tj\\nET`,
  "g",
);

export function normalizeDecodedUnderwritingPageContent(
  content,
  expectedPageNumber,
) {
  const matches = [...content.matchAll(PAGE_FOOTER_PATTERN)];
  const match = matches[0];
  const pageNumber = Number(match?.[3]);
  const pageTotal = Number(match?.[4]);
  const digitCount = String(pageTotal).length;
  const expectedX = 506.1519685039370415 - 8.25 * (digitCount - 1);
  if (
    matches.length !== 1 ||
    pageNumber !== pageTotal ||
    (expectedPageNumber !== undefined && pageTotal !== expectedPageNumber) ||
    Math.abs(Number(match?.[1]) - expectedX) > 1e-9
  ) {
    throw new Error("Canonical underwriting page footer was not found");
  }
  return content.replace(
    PAGE_FOOTER_PATTERN,
    [
      "BT",
      "/F1 7.5 Tf",
      "8.625 TL",
      "0.471 g",
      "0 Tr",
      "__PAGE_FOOTER_X__ $2 Td",
      "(Page # of #) Tj",
      "ET",
    ].join("\n"),
  );
}

export function fingerprintDecodedUnderwritingPageContent(
  content,
  expectedPageNumber,
) {
  const normalized = normalizeDecodedUnderwritingPageContent(
    content,
    expectedPageNumber,
  );
  return createHash("sha256").update(normalized, "latin1").digest("hex");
}
