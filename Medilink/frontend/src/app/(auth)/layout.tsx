import { type ReactNode } from "react";
import { BrandPanel } from "@/components/auth/BrandPanel";
import { ThemeToggle } from "@/components/auth/ThemeToggle";
import { LangToggle } from "@/components/auth/LangToggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh grid grid-cols-1 sm:grid-cols-[1.1fr_1fr]">
      {/* Left: brand panel — hidden on mobile */}
      <BrandPanel />

      {/* Right: form panel */}
      <div className="flex flex-col min-h-dvh bg-[#f9f4fa] dark:bg-[#1c1030]">
        {/* Toolbar */}
        <div className="flex items-center justify-end gap-1 px-4 pt-4 pb-2">
          <LangToggle />
          <ThemeToggle />
        </div>

        {/* Form area */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 sm:px-12 pb-12">
          {children}
        </div>
      </div>
    </div>
  );
}
