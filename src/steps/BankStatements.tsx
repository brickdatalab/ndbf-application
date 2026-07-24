import { type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import { useAppStore } from "../store";
import { FileUpload } from "../components/FileUpload";
import { Button } from "../components/ui/Button";
import { analytics } from "../lib/analytics";

export function BankStatements() {
  const files = useAppStore((s) => s.formData.bankStatements);
  const add = useAppStore((s) => s.addBankStatements);
  const remove = useAppStore((s) => s.removeBankStatement);
  const next = useAppStore((s) => s.nextStep);
  const prev = useAppStore((s) => s.prevStep);

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    analytics.push("application_step_complete", {
      step_number: 4,
      step_name: "bank_statements",
    });
    next();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
      <header className="text-center space-y-2">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-brand-navy">
          Bank Statements
        </h2>
        <div className="inline-flex items-center gap-2 text-sm md:text-base text-ink-muted">
          <Info className="h-4 w-4 text-brand-blue" />
          Please upload your recent bank statements (last 3–6 months recommended).
        </div>
      </header>

      <FileUpload files={files} onAdd={add} onRemove={remove} maxFiles={10} />

      <div className="flex flex-col sm:flex-row-reverse sm:justify-between gap-3 pt-4 border-t border-divider-soft">
        <Button type="submit" size="lg">
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={prev}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
    </form>
  );
}
