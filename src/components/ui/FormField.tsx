import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "../../lib/utils";

type FieldProps = {
  label: string;
  required?: boolean;
  htmlFor?: string;
  tooltip?: string;
  error?: string | null;
  help?: string;
  className?: string;
  children: ReactNode;
};

export function FormField({
  label,
  required,
  htmlFor,
  tooltip,
  error,
  help,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1.5 text-sm font-medium text-brand-navy"
      >
        <span>
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        {tooltip && (
          <span
            role="tooltip"
            title={tooltip}
            aria-label={tooltip}
            className="inline-flex items-center text-brand-blue cursor-help"
          >
            <Info className="h-3.5 w-3.5" />
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-500 animate-fadeIn">{error}</p>
      ) : help ? (
        <p className="text-xs text-ink-muted">{help}</p>
      ) : null}
    </div>
  );
}
