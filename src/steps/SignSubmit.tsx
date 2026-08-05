import { useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { useAppStore } from "../store";
import { Button } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Input";
import { SignaturePad } from "../components/SignaturePad";
import { TERMS_PARAGRAPHS } from "../lib/terms";
import { generateApplicationPdf } from "../lib/pdf";
import { shortId } from "../lib/utils";
import {
  analytics,
  classifySubmissionError,
  processSubmissionResponse,
} from "../lib/analytics";

export function SignSubmit() {
  const f = useAppStore((s) => s.formData);
  const update = useAppStore((s) => s.updateFormData);
  const prev = useAppStore((s) => s.prevStep);
  const appParam = useAppStore((s) => s.appParam);
  const utm = useAppStore((s) => s.utm);
  const markSubmitted = useAppStore((s) => s.markSubmitted);

  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrMsg(null);

    if (!f.signature) {
      setErrMsg("Please provide your signature before submitting.");
      analytics.push("application_validation_error", {
        step_number: 5,
        step_name: "sign_and_submit",
        error_category: "missing_signature",
      });
      return;
    }
    if (!f.termsAccepted) {
      setErrMsg("Please accept the terms and conditions before submitting.");
      analytics.push("application_validation_error", {
        step_number: 5,
        step_name: "sign_and_submit",
        error_category: "terms_not_accepted",
      });
      return;
    }

    setSubmitting(true);

    // Client-side entry ID is a hint; the server assigns the real one.
    const clientEntryIdHint = `ndbf_${shortId(8)}`;
    const submittedAtClient = new Date().toISOString();

    // Build the payload the backend will write to BigQuery.
    const payload = {
      clientEntryIdHint,
      clientSubmittedAt: submittedAtClient,
      appParam,
      utm,
      formData: {
        ...f,
        // bank statement files are sent separately via FormData; strip from JSON.
        bankStatements: f.bankStatements.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
        })),
      },
    };

    try {
      // 1. Generate the PDF client-side (same document the backend will store).
      const pdfDataUrl = await generateApplicationPdf({
        entryId: clientEntryIdHint,
        submittedAtIso: submittedAtClient,
        appParam,
        formData: f,
      });

      // 2. Convert the PDF data URL to a Blob so it can ride in FormData.
      const pdfBlob = await (await fetch(pdfDataUrl)).blob();

      // 3. Build the multipart request.
      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      fd.append("pdf", pdfBlob, `${clientEntryIdHint}.pdf`);
      for (const file of f.bankStatements) {
        fd.append("banks", file, file.name);
      }

      // 4. POST to the NDBF backend (GCP VM, Caddy-fronted HTTPS).
      //    Set VITE_API_URL at build time to override (e.g. prod subdomain later).
      const apiBase =
        (import.meta as unknown as { env?: Record<string, string> }).env
          ?.VITE_API_URL || "https://136-119-104-124.nip.io";

      analytics.push("application_submit_attempt", {
        step_number: 5,
        step_name: "sign_and_submit",
      });
      const resp = await fetch(`${apiBase}/api/submit`, {
        method: "POST",
        body: fd,
      });

      const result = await processSubmissionResponse(resp);

      // 5. Transition directly to the confirmation page. The PDF remains stored
      // in GCS and available to the email worker; applicants do not receive a preview tab.
      markSubmitted(result.entryId);
    } catch (err) {
      console.error(err);
      analytics.push("application_submit_error", {
        step_number: 5,
        step_name: "sign_and_submit",
        error_category: classifySubmissionError(err),
      });
      setErrMsg("Submission failed. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
      <header className="text-center space-y-2">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-brand-navy">
          Signature
        </h2>
        <p className="text-sm md:text-base text-ink-muted max-w-2xl mx-auto">
          By signing below, you confirm that all the information provided is accurate and
          complete to the best of your knowledge.
        </p>
      </header>

      <div className="rounded-2xl border border-divider-soft bg-surface-offWhite/60 p-5 md:p-7 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-brand-navy mb-2">
            Please sign below <span className="text-red-500">*</span>
          </label>
          <SignaturePad
            value={f.signature}
            onChange={(v) => update({ signature: v })}
            onClear={() => update({ signature: "" })}
          />
        </div>

        <div className="pt-3 border-t border-divider-soft">
          <Checkbox
            id="termsAccepted"
            required
            checked={f.termsAccepted}
            onChange={(e) => update({ termsAccepted: e.target.checked })}
            label="I have read and agree to the Terms and Authorization Statement below."
          />
        </div>

        <div className="max-h-48 overflow-y-auto rounded-lg border border-divider-soft bg-white p-4 text-xs text-ink-muted space-y-2.5 leading-relaxed">
          {TERMS_PARAGRAPHS.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>

      {errMsg && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 animate-fadeIn">
          {errMsg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row-reverse sm:justify-between gap-3 pt-4 border-t border-divider-soft">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : (
            <>
              Submit Application <CheckCircle2 className="h-4 w-4" />
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={prev}
          disabled={submitting}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
    </form>
  );
}
