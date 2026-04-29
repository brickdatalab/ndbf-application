import { CheckCircle2, FileText, RotateCcw } from "lucide-react";
import { useAppStore } from "../store";
import { Button } from "../components/ui/Button";

export function Confirmation() {
  const entryId = useAppStore((s) => s.entryId);
  const submittedAt = useAppStore((s) => s.submittedAt);
  const pdfDataUrl = useAppStore((s) => s.pdfDataUrl);
  const appParam = useAppStore((s) => s.appParam);
  const contactName = useAppStore((s) => s.formData.contactName);
  const contactEmail = useAppStore((s) => s.formData.contactEmail);
  const businessLegalName = useAppStore((s) => s.formData.businessLegalName);
  const resetAll = useAppStore((s) => s.resetAll);

  const viewPdf = () => {
    if (!pdfDataUrl) return;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(
        `<title>NDBF Application #${entryId}</title>
         <iframe src="${pdfDataUrl}" style="border:0;width:100%;height:100vh;margin:0;padding:0"></iframe>
         <style>body{margin:0;padding:0}</style>`
      );
      w.document.close();
    }
  };

  return (
    <div className="space-y-7 md:space-y-9 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-green-600" strokeWidth={2.25} />
        </div>
        <h2 className="font-display text-3xl md:text-4xl font-bold text-brand-navy">
          Application Submitted
        </h2>
        <p className="text-sm md:text-base text-ink-muted max-w-lg">
          {contactName ? `Thank you, ${contactName.split(" ")[0]} — ` : "Thank you — "}
          we've received your application
          {businessLegalName ? ` for ${businessLegalName}` : ""}. Our underwriting team
          will review and reach out to you
          {contactEmail ? ` at ${contactEmail}` : ""} shortly.
        </p>
      </div>

      {/* Summary box */}
      <div className="max-w-lg mx-auto rounded-2xl border border-divider-soft bg-surface-offWhite/60 p-5 text-left">
        <dl className="grid grid-cols-[130px,1fr] gap-y-2 gap-x-4 text-sm">
          <dt className="font-semibold text-brand-navy">Entry ID</dt>
          <dd className="font-mono text-ink-body">{entryId}</dd>

          <dt className="font-semibold text-brand-navy">Submitted</dt>
          <dd className="text-ink-body">
            {submittedAt ? new Date(submittedAt).toLocaleString("en-US") : "—"}
          </dd>

          <dt className="font-semibold text-brand-navy">Rep (app param)</dt>
          <dd className="text-ink-body">
            {appParam ? (
              <code className="bg-white border border-divider-soft rounded px-1.5 py-0.5 text-xs">
                {appParam}
              </code>
            ) : (
              <span className="text-ink-muted italic">none / direct traffic</span>
            )}
          </dd>

          <dt className="font-semibold text-brand-navy">Status</dt>
          <dd className="text-ink-body">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-blue/10 text-brand-blueDark px-2.5 py-0.5 text-xs font-semibold">
              Under Review
            </span>
          </dd>
        </dl>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        {pdfDataUrl && (
          <Button type="button" variant="primary" size="lg" onClick={viewPdf}>
            <FileText className="h-4 w-4" /> View Your Application PDF
          </Button>
        )}
        <Button type="button" variant="outline" size="lg" onClick={() => { resetAll(); }}>
          <RotateCcw className="h-4 w-4" /> Start a New Application
        </Button>
      </div>

      {/* Backend status note */}
      <div className="mx-auto max-w-xl rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-xs text-green-900 text-left">
        <strong className="font-semibold">Application saved.</strong> Your bank
        statements and the generated PDF were uploaded to
        <code className="bg-white/70 border border-green-300 rounded px-1 mx-0.5">
          gs://app_banks/&lt;business&gt;_&lt;entry_id&gt;/
        </code>
        and a row was inserted into BigQuery
        (<code className="bg-white/70 border border-green-300 rounded px-1 mx-0.5">
          ndbf_applications.submissions
        </code>) for the underwriting team.
      </div>
    </div>
  );
}
