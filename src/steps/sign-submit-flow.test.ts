import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./SignSubmit.tsx", import.meta.url), "utf8");

describe("successful application submission flow", () => {
  it("transitions to confirmation without opening an applicant PDF preview", () => {
    expect(source).toContain("markSubmitted(result.entryId);");
    expect(source).not.toContain("window.open");
    expect(source).not.toContain("<iframe");
  });

  it("keeps the generated PDF in the multipart backend request", () => {
    // The payload deliberately carries no pdfLayoutVersion: the PDF no longer
    // contains the underwriting shell the layout contract fingerprints.
    expect(source).not.toMatch(/^\s*pdfLayoutVersion:/m);
    expect(source).toContain('fd.append("pdf", pdfBlob');
    expect(source).toContain('fd.append("banks", file, file.name)');
    expect(source).toContain('fetch(`${apiBase}/api/submit`');
  });

  it("does not generate or embed a browser-side entry ID", () => {
    expect(source).not.toContain("clientEntryIdHint");
    expect(source).not.toContain("shortId(");
    expect(source).toContain('fd.append("pdf", pdfBlob, "signed-application.pdf")');
  });
});
