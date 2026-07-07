import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { Providers } from "./providers";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `lang`/`dir` are corrected client-side by I18nProvider; defaults are LTR/en.
  // suppressHydrationWarning: next-themes sets the `class` before hydration.
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className={`${manrope.variable} ${agatho.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
