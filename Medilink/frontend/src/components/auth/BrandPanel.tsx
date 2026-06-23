"use client";

import { usePathname } from "next/navigation";

const PAGE_CONTENT: Record<string, string> = {
  "/welcome": "Welcome to Medilink",
  "/sign-in": "Welcome back",
  "/sign-up": "Join MediLink",
  "/otp": "Verify it's you",
  "/forgot-password": "Reset your password",
  "/reset-password": "Secure your account",
  "/onboarding": "Find the right doctor",
  "/language": "Your language, your way",
};

const DESCRIPTION = "Connect with trusted healthcare simply, quickly, and confidently.";

export function BrandPanel() {
  const pathname = usePathname();
  const matched = Object.keys(PAGE_CONTENT).find((k) => pathname.endsWith(k));
  const heading = matched ? PAGE_CONTENT[matched] : "Better Care, Closer to You";

  return (
    <aside
      className="hidden sm:flex flex-col justify-between relative overflow-hidden"
      style={{
        background: "linear-gradient(150deg, #2E1A47, #46255f 70%)",
        color: "#fff",
        minHeight: "100dvh",
        padding: "48px",
      }}
    >
      {/* bfield — brand medical-node pattern */}
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 220 140"
        preserveAspectRatio="xMidYMid slice"
        style={{ color: "#DFC8E7", opacity: 0.13 }}
      >
        <g fill="currentColor">
          <circle cx="32" cy="40" r="15" />
          <circle cx="86" cy="30" r="9" />
          <rect x="32" y="33" width="54" height="14" rx="7" />
          <circle cx="150" cy="92" r="20" />
          <circle cx="200" cy="70" r="11" />
          <rect x="150" y="84" width="50" height="16" rx="8" />
          <circle cx="60" cy="108" r="8" />
        </g>
      </svg>

      {/* Top — wordmark */}
      <div className="relative" style={{ height: "24px" }}>
        <img
          src="/logo/wordmark-lavender.svg"
          alt="Medilink"
          style={{ height: "100%", width: "auto", display: "block" }}
        />
      </div>

      {/* Bottom — page heading + description + tagline */}
      <div className="relative">
        <h1
          style={{
            fontFamily: "var(--font-serif), Georgia, serif",
            fontSize: "54px",
            lineHeight: 1.02,
            fontWeight: 700,
            maxWidth: "9ch",
            margin: "0 0 16px",
          }}
        >
          {heading}
        </h1>
        <p
          style={{
            opacity: 0.82,
            maxWidth: "42ch",
            fontSize: "15px",
            lineHeight: 1.6,
            margin: "0 0 28px",
          }}
        >
          {DESCRIPTION}
        </p>
        <div style={{ opacity: 0.6, fontSize: "12px", position: "relative" }}>
          Your Link to Better Care · © 2026
        </div>
      </div>
    </aside>
  );
}
