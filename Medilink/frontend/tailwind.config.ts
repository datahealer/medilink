import type { Config } from "tailwindcss";

// MediLink design tokens. Colors reference CSS vars from globals.css so light/dark
// (and any future theming) flow through a single source of truth.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        accent: "var(--accent)",
        muted: "var(--muted)",
        border: "var(--border)",
        brand: {
          violet: "var(--brand-violet)",
          lavender: "var(--brand-lavender)",
          blue: "var(--brand-blue)",
          white: "var(--brand-white)",
        },
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 0.5rem)",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
