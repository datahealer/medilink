"use client";

import Link from "next/link";
import { type AnchorHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "ghost" | "cta";

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: Variant;
  fullWidth?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 select-none cursor-pointer px-5 py-3 no-underline";

const variants: Record<Variant, string> = {
  primary:
    "bg-[#2E1A47] text-[#F9F4FA] hover:bg-[#46255f] active:scale-[0.98] shadow-md dark:bg-[#DFC8E7] dark:text-[#2E1A47] dark:hover:bg-[#c9b0d5]",
  outline:
    "border border-[#2E1A47] text-[#2E1A47] hover:bg-[#2E1A47]/5 active:scale-[0.98] dark:border-[#DFC8E7] dark:text-[#DFC8E7] dark:hover:bg-[#DFC8E7]/10",
  ghost:
    "text-[#2E1A47] hover:bg-[#2E1A47]/8 active:scale-[0.98] dark:text-[#DFC8E7] dark:hover:bg-[#DFC8E7]/10",
  cta:
    "bg-[#DFC8E7] text-[#2E1A47] hover:opacity-90 active:scale-[0.97] shadow-md font-bold tracking-widest uppercase text-xs",
};

export function LinkButton({ href, variant = "primary", fullWidth = false, children, className = "", ...rest }: LinkButtonProps) {
  const isCta = variant === "cta";
  return (
    <Link
      href={href}
      className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      style={isCta ? { transform: "skewX(-12deg)", borderRadius: "10px", paddingLeft: "2rem", paddingRight: "2rem" } : undefined}
      {...rest}
    >
      {isCta ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", transform: "skewX(12deg)" }}>
          {children}
        </span>
      ) : children}
    </Link>
  );
}
