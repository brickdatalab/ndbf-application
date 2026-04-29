import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
};

const variantClasses: Record<Variant, string> = {
  // Orange CTA with blue hover, per NDBF brand
  primary:
    "bg-cta-orange text-white hover:bg-cta-orangeHover active:bg-brand-blueDark " +
    "focus-visible:ring-cta-orange/40 shadow-[0_4px_14px_rgba(255,102,0,0.25)]",
  // Navy fill, white text
  secondary:
    "bg-brand-navy text-white hover:bg-brand-blueDark active:bg-brand-navyDeep " +
    "focus-visible:ring-brand-navy/40",
  // White with navy border
  outline:
    "bg-white text-brand-navy border border-brand-navy/60 hover:bg-brand-navy hover:text-white " +
    "focus-visible:ring-brand-navy/30",
  ghost:
    "bg-transparent text-brand-navy hover:bg-brand-navy/5 focus-visible:ring-brand-navy/20",
};

const sizeClasses = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-12 px-7 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-btn font-body font-medium",
        "transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-4",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-inherit",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
