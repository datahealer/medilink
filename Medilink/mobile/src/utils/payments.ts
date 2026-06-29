import type { useI18n } from "@/i18n";
import type { ThemeColors } from "@/theme/light";

type T = ReturnType<typeof useI18n>["t"];

export type PayCategory = "success" | "warning" | "danger" | "muted";

/** Map a backend payment status to a semantic tone category. */
export function payCategory(status: string | null | undefined): PayCategory {
  switch (status) {
    case "paid":
      return "success";
    case "pending":
    case "unpaid":
      return "warning";
    case "failed":
      return "danger";
    case "refunded":
    case "partial_refund":
    default:
      return "muted";
  }
}

const PAY_KEYS: Record<string, Parameters<T>[0]> = {
  paid: "payments.statusPaid",
  pending: "payments.statusPending",
  unpaid: "payments.statusPending",
  failed: "payments.statusFailed",
  refunded: "payments.statusRefunded",
  partial_refund: "payments.statusPartialRefund",
};

/** Localized payment status label; humanizes any unmapped status defensively. */
export function payStatusLabel(status: string | null | undefined, t: T): string {
  if (!status) return "";
  const key = PAY_KEYS[status];
  return key ? t(key) : status.replace(/_/g, " ");
}

export interface PayTone {
  bg: string;
  fg: string;
}

/** Resolve a payment category to concrete theme colors (pill bg + text). */
export function payTone(colors: ThemeColors, cat: PayCategory): PayTone {
  switch (cat) {
    case "success":
      return { bg: colors.successSurface, fg: colors.success };
    case "warning":
      return { bg: colors.surfaceAlt, fg: colors.warning };
    case "danger":
      return { bg: colors.errorSurface, fg: colors.error };
    default:
      return { bg: colors.surfaceAlt, fg: colors.textMuted };
  }
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
