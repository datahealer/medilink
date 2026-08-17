import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";

import { Providers } from "./providers";
import { LOCALE_COOKIE, dirFor, normalizeLocale } from "@/i18n/locale";
import "./globals.css";

const manrope = localFont({
  src: [
    { path: "../../public/fonts/manrope/manrope-regular.otf", weight: "400", style: "normal" },
    { path: "../../public/fonts/manrope/manrope-medium.otf", weight: "500", style: "normal" },
    { path: "../../public/fonts/manrope/manrope-semibold.otf", weight: "600", style: "normal" },
  ],
  variable: "--font-manrope",
  display: "swap",
});

const agatho = localFont({
  src: [
    { path: "../../public/fonts/agatho/Agatho_Light.otf", weight: "300", style: "normal" },
    { path: "../../public/fonts/agatho/Agatho_Regular.otf", weight: "400", style: "normal" },
    { path: "../../public/fonts/agatho/Agatho_Medium.otf", weight: "500", style: "normal" },
    { path: "../../public/fonts/agatho/Agatho_Bold.otf", weight: "700", style: "normal" },
  ],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MediLink",
  description: "MediLink — patient healthcare app",
  icons: {
    icon: "/logo/submark-light.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F9F4FA" },
    { media: "(prefers-color-scheme: dark)", color: "#2E1A47" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /**
   * Resolve the locale on the SERVER so `<html lang dir>` is correct in the first byte.
   *
   * Previously this was hardcoded `lang="en" dir="ltr"` with a comment saying
   * `I18nProvider` corrects it client-side. It did — but only after hydration, so an Arabic
   * patient got a full English left-to-right paint and then a layout jump, on every
   * server-rendered navigation. See `@/i18n/locale` for the full rationale.
   *
   * ── COST, STATED PLAINLY ──
   *
   * `cookies()` is a dynamic API: reading it here opts the whole route tree out of static
   * prerendering. Measured on this app, that moves 30 routes from ○ (Static) to ƒ
   * (Dynamic) — including the marketing pages.
   *
   * That is the correct trade for this product. Every page under `/dashboard` is a client
   * component fetching per-patient data, so its "static" prerender was only ever an empty
   * shell; and there is no way to emit a per-request `dir` while still prerendering one
   * shared HTML file — the two requirements are fundamentally in tension. Serving Arabic
   * patients a left-to-right document is a correctness and accessibility defect, and a
   * cached empty shell is not worth it.
   *
   * If the marketing pages' TTFB later proves to matter more, the revert is this function
   * plus the `initialLocale` prop below — nothing else depends on the server read.
   *
   * suppressHydrationWarning: next-themes sets `class` on <html> before hydration.
   */
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  return (
    <html lang={locale} dir={dirFor(locale)} suppressHydrationWarning>
      <body className={`${manrope.variable} ${agatho.variable} font-sans antialiased`}>
        {/*
          The same locale seeds the client provider, so the client's FIRST render matches
          what the server sent. Without this the two disagree and React reports a hydration
          mismatch on every Arabic page — the text content differs, which
          suppressHydrationWarning does not and should not silence.
        */}
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
