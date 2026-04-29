import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full h-11 px-3.5 rounded-lg border border-divider-muted bg-white text-ink-body",
          "placeholder:text-ink-muted/50",
          "focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15",
          "transition-all duration-150 shadow-input",
          "disabled:bg-surface-offWhite disabled:cursor-not-allowed",
          className
        )}
        {...rest}
      />
    );
  }
);

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  placeholder?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, placeholder, children, value, ...rest }, ref) {
    return (
      <select
        ref={ref}
        value={value ?? ""}
        className={cn(
          "w-full h-11 px-3.5 rounded-lg border border-divider-muted bg-white text-ink-body",
          "focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15",
          "transition-all duration-150 shadow-input cursor-pointer",
          "disabled:bg-surface-offWhite disabled:cursor-not-allowed",
          !value && "text-ink-muted/60",
          className
        )}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
    );
  }
);

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full min-h-[88px] px-3.5 py-2.5 rounded-lg border border-divider-muted bg-white text-ink-body",
          "placeholder:text-ink-muted/50",
          "focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15",
          "transition-all duration-150 shadow-input",
          className
        )}
        {...rest}
      />
    );
  }
);

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ className, label, id, ...rest }, ref) {
    return (
      <label
        htmlFor={id}
        className="inline-flex items-start gap-2.5 cursor-pointer select-none"
      >
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className={cn(
            "mt-0.5 h-5 w-5 rounded border-2 border-divider-muted text-brand-blue",
            "focus:outline-none focus:ring-4 focus:ring-brand-blue/15 cursor-pointer",
            "checked:border-brand-blue checked:bg-brand-blue",
            className
          )}
          {...rest}
        />
        <span className="text-sm text-ink-body leading-tight">{label}</span>
      </label>
    );
  }
);
