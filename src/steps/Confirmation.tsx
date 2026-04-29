import { CheckCircle2 } from "lucide-react";
import { useAppStore } from "../store";

export function Confirmation() {
  const submittedAt = useAppStore((s) => s.submittedAt);
  const contactEmail = useAppStore((s) => s.formData.contactEmail);
  const contactPhone = useAppStore((s) => s.formData.contactPhone);
  const businessLegalName = useAppStore((s) => s.formData.businessLegalName);

  const reachOutAt = (() => {
    if (contactEmail && contactPhone) return ` at ${contactEmail} or ${contactPhone}`;
    if (contactEmail) return ` at ${contactEmail}`;
    if (contactPhone) return ` at ${contactPhone}`;
    return "";
  })();

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
          We've received your application
          {businessLegalName ? ` for ${businessLegalName}` : ""}. Our underwriting team
          will review and reach out to you
          {reachOutAt} shortly if we have any questions.
        </p>
      </div>

      {/* Summary box — Submitted + Status only */}
      <div className="max-w-lg mx-auto rounded-2xl border border-divider-soft bg-surface-offWhite/60 p-5 text-left">
        <dl className="grid grid-cols-[130px,1fr] gap-y-2 gap-x-4 text-sm">
          <dt className="font-semibold text-brand-navy">Submitted</dt>
          <dd className="text-ink-body">
            {submittedAt ? new Date(submittedAt).toLocaleString("en-US") : "—"}
          </dd>

          <dt className="font-semibold text-brand-navy">Status</dt>
          <dd className="text-ink-body">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-blue/10 text-brand-blueDark px-2.5 py-0.5 text-xs font-semibold">
              Underwriting
            </span>
          </dd>
        </dl>
      </div>
    </div>
  );
}
