import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MediLink",
  description: "MediLink — patient healthcare app",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F9F4FA" },
    { media: "(prefers-color-scheme: dark)", color: "#2E1A47" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `lang`/`dir` are corrected client-side by I18nProvider; defaults are LTR/en.
  // suppressHydrationWarning: next-themes sets the `class` before hydration.
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className={`${manrope.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
