import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DOBPicker } from "./DOBPicker";
import { Checkbox } from "./ui/Input";

describe("application form controls", () => {
  it("limits the default DOB year list to 2010 or earlier", () => {
    const html = renderToStaticMarkup(<DOBPicker value="" onChange={() => undefined} />);

    expect(html).toContain('<option value="2010">2010</option>');
    expect(html).not.toContain('<option value="2011">2011</option>');
  });

  it("renders required agreement checkboxes with native validation and a marker", () => {
    const html = renderToStaticMarkup(
      <Checkbox id="termsAccepted" label="Agreement" required />
    );

    expect(html).toContain('required=""');
    expect(html).toContain('aria-hidden="true">*</span>');
  });
});
