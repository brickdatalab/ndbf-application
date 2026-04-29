import { Check } from "lucide-react";
import { useAppStore } from "../store";
import { cn } from "../lib/utils";

const STEP_LABELS = [
  "Contact Information",
  "Business Information",
  "Ownership Details",
  "Bank Statements",
  "Sign & Submit",
];

export function Stepper() {
  const currentStep = useAppStore((s) => s.currentStep);
  const goToStep = useAppStore((s) => s.goToStep);
  const totalSteps = useAppStore((s) => s.totalSteps);

  return (
    <div className="w-full mb-8">
      <div className="grid grid-cols-5 gap-2 md:gap-4 mb-3">
        {STEP_LABELS.map((label, i) => {
          const isComplete = i < currentStep;
          const isCurrent = i === currentStep;
          const isFuture = i > currentStep;
          const canNav = isComplete || isCurrent;
          return (
            <button
              key={label}
              type="button"
              disabled={!canNav}
              onClick={() => canNav && goToStep(i)}
              className={cn(
                "group flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 rounded-lg p-1",
                !canNav && "cursor-not-allowed"
              )}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={`Step ${i + 1}: ${label}${isComplete ? " (completed)" : ""}`}
            >
              <div
                className={cn(
                  "flex items-center justify-center h-9 w-9 md:h-10 md:w-10 rounded-full font-display font-semibold text-sm transition-all",
                  isComplete &&
                    "bg-brand-blue text-white border-2 border-brand-blue",
                  isCurrent &&
                    "bg-brand-navy text-white border-2 border-brand-navy ring-4 ring-brand-blue/20",
                  isFuture &&
                    "bg-surface-offWhite text-ink-muted border-2 border-divider-muted"
                )}
              >
                {isComplete ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] md:text-xs font-medium text-center leading-tight",
                  isCurrent && "text-brand-navy",
                  isComplete && "text-brand-blueDark",
                  isFuture && "text-ink-muted"
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full bg-divider-soft overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-blue to-brand-navy transition-all duration-500"
          style={{ width: `${(currentStep / (totalSteps - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}
