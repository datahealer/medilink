"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "outline" | "ghost" | "google" | "cta";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  loading?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-[#2E1A47] text-[#F9F4FA] hover:bg-[#46255f] active:scale-[0.98] focus-visible:ring-[#2E1A47] shadow-md dark:bg-[#DFC8E7] dark:text-[#2E1A47] dark:hover:bg-[#c9b0d5]",
  outline:
    "border border-[#2E1A47] text-[#2E1A47] hover:bg-[#2E1A47]/5 active:scale-[0.98] focus-visible:ring-[#2E1A47] dark:border-[#DFC8E7] dark:text-[#DFC8E7] dark:hover:bg-[#DFC8E7]/10",
  ghost:
    "text-[#2E1A47] hover:bg-[#2E1A47]/8 active:scale-[0.98] focus-visible:ring-[#2E1A47] dark:text-[#DFC8E7] dark:hover:bg-[#DFC8E7]/10",
  google:
    "border border-[#e7dcee] bg-white text-[#2E1A47] hover:bg-[#f9f4fa] active:scale-[0.98] focus-visible:ring-[#2E1A47] shadow-sm dark:border-[#3a2560] dark:bg-[#1c1030] dark:text-[#DFC8E7]",
  cta:
    "bg-[#DFC8E7] text-[#2E1A47] hover:bg-[#d0b8da] active:scale-[0.98] focus-visible:ring-[#2E1A47] shadow-md font-bold tracking-widest uppercase text-xs",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", fullWidth = false, loading = false, children, className = "", ...rest },
    ref
  ) => {
    const isCta = variant === "cta";

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""} px-5 py-3 ${className}`}
        style={isCta ? { transform: "skewX(-12deg)", borderRadius: "10px", paddingLeft: "2rem", paddingRight: "2rem" } : undefined}
        disabled={loading || rest.disabled}
        {...rest}
      >
        <span style={isCta ? { display: "inline-flex", alignItems: "center", gap: "8px", transform: "skewX(12deg)" } : undefined}>
          {loading ? (
            <span
              className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
              aria-hidden
            />
          ) : null}
          {children}
        </span>
      </button>
    );
  }
);
Button.displayName = "Button";
