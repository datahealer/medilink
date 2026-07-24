"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuth } from "@/context/AuthContext";
import { useMyProfile } from "@/hooks/useMyProfile";

/* ─── Notification preferences — mirrors the mobile Settings screen's categories,
 * backed by the same `notification_preferences` table (push/email/sms + categories). ── */
const CATEGORIES = [
  { key: "appointmentReminders", en: "Appointment Reminders", ar: "تذكيرات المواعيد" },
  { key: "paymentsInvoices",     en: "Payments & Invoices",   ar: "المدفوعات والفواتير" },
  { key: "labResults",           en: "Lab Results",           ar: "نتائج التحاليل" },
  { key: "prescriptions",        en: "Prescriptions",         ar: "الوصفات الطبية" },
  { key: "facilityUpdates",      en: "Facility Updates",      ar: "تحديثات المنشأة" },
  { key: "promotions",           en: "Promotions",             ar: "العروض" },
] as const;

type CategoryFlags = Record<(typeof CATEGORIES)[number]["key"], boolean>;

function Toggle({ on, onClick, ar }: { on: boolean; onClick: () => void; ar: boolean }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${on ? "bg-[#46255f]" : "bg-[#e7dcee] dark:bg-[#3a2560]"}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          ar
            ? (on ? "-translate-x-[calc(100%+2px)] right-0.5" : "right-0.5")
            : (on ? "translate-x-[calc(100%+2px)] left-0.5" : "left-0.5")
        }`}
      />
    </button>
  );
}

function Row({
  label, value, onClick, ar, danger,
}: { label: string; value?: string | null; onClick: () => void; ar: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-[#e7dcee] dark:border-[#3a2560] hover:border-[#2E1A47]/30 dark:hover:border-[#DFC8E7]/30 hover:bg-[#faf5ff] dark:hover:bg-[#2E1A47]/10 transition-all ${ar ? "flex-row-reverse text-right" : "text-left"}`}
    >
      <span className={`text-sm font-semibold ${danger ? "text-rose-500" : "text-[#2E1A47] dark:text-[#DFC8E7]"}`}>{label}</span>
      <span className={`flex items-center gap-1.5 flex-shrink-0 ${ar ? "flex-row-reverse" : ""}`}>
        {value && <span className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">{value}</span>}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#2E1A47]/30 dark:text-[#DFC8E7]/30" style={ar ? { transform: "scaleX(-1)" } : undefined}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const { locale, toggleLocale } = useI18n();
  const ar = locale === "ar";
  const router = useRouter();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { fullName, initials, email, loading: profileLoading } = useMyProfile();

  const [signingOut, setSigningOut] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [channels, setChannels] = useState({ push: true, email: true, sms: false });
  const [categories, setCategories] = useState<CategoryFlags>({
    appointmentReminders: true, paymentsInvoices: true, labResults: true,
    prescriptions: true, facilityUpdates: true, promotions: false,
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.notifications.getPreferences(supabase)
      .then((prefs) => {
        if (!active || !prefs) return;
        setChannels({ push: prefs.push, email: prefs.email, sms: prefs.sms });
        const cats = (prefs.categories && typeof prefs.categories === "object" && !Array.isArray(prefs.categories)
          ? prefs.categories
          : {}) as Partial<CategoryFlags>;
        setCategories((prev) => ({ ...prev, ...cats }));
      })
      .catch(() => {})
      .finally(() => { if (active) setPrefsLoading(false); });
    return () => { active = false; };
  }, [supabase]);

  async function toggleChannel(key: "push" | "email" | "sms") {
    const next = { ...channels, [key]: !channels[key] };
    setChannels(next);
    setSavingKey(key);
    try {
      await api.notifications.updatePreferences(supabase, next);
    } catch {
      setChannels(channels); // revert on failure
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleCategory(key: (typeof CATEGORIES)[number]["key"]) {
    const next = { ...categories, [key]: !categories[key] };
    setCategories(next);
    setSavingKey(key);
    try {
      await api.notifications.updatePreferences(supabase, { categories: next });
    } catch {
      setCategories(categories); // revert on failure
    } finally {
      setSavingKey(null);
    }
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      router.push("/sign-in");
      router.refresh();
    }
  }

  const THEMES = [
    { value: "light",  en: "Light",  ar: "فاتح",  icon: "☀️" },
    { value: "dark",   en: "Dark",   ar: "داكن",  icon: "🌙" },
    { value: "system", en: "System", ar: "النظام", icon: "🖥️" },
  ] as const;

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7] pb-16">

      {/* Hero */}
      <section className="py-10 px-4" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-xs font-bold  tracking-widest mb-2" style={{ color: "rgba(223,200,231,0.45)" }}>
            {ar ? "الإعدادات" : "Settings"}
          </p>
          <h1 className="font-black font-serif text-white" style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", lineHeight: 1.1 }}>
            {ar ? "إعدادات الحساب" : "Account settings"}
          </h1>
        </div>
      </section>

      <div className="px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Account card */}
        <section className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-5">
          <div className={`flex items-center gap-3 ${ar ? "flex-row-reverse" : ""}`}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-[#2E1A47] flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              {profileLoading ? "" : (initials || "?")}
            </div>
            <div className={`min-w-0 ${ar ? "text-right" : ""}`}>
              <p className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7] truncate">
                {profileLoading ? "…" : (fullName || (ar ? "حسابي" : "My Account"))}
              </p>
              <p className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 truncate">{email}</p>
            </div>
          </div>
        </section>

        {/* Preferences */}
        <section>
          <p className={`text-[10px] font-black tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-3 ${ar ? "text-right" : ""}`}>
            {ar ? "التفضيلات" : "Preferences"}
          </p>
          <div className="space-y-2">
            <Row label={ar ? "اللغة" : "Language"} value={ar ? "العربية" : "English"} onClick={toggleLocale} ar={ar} />
            <Row label={ar ? "السجل الطبي" : "Medical History"} onClick={() => router.push("/dashboard/profile#health")} ar={ar} />
          </div>

          {/* Appearance — inline tiles instead of a sub-page */}
          <div className="mt-3 bg-white dark:bg-[#1a1030] rounded-xl border border-[#e7dcee] dark:border-[#3a2560] p-4">
            <p className={`text-xs font-bold text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 mb-3 ${ar ? "text-right" : ""}`}>
              {ar ? "المظهر" : "Appearance"}
            </p>
            <div className={`grid grid-cols-3 gap-2`}>
              {THEMES.map(t => (
                <button key={t.value} onClick={() => setTheme(t.value)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${
                    theme === t.value
                      ? "border-[#46255f] bg-[#faf5ff] dark:bg-[#2E1A47]/20"
                      : "border-[#e7dcee] dark:border-[#3a2560] hover:border-[#2E1A47]/30 dark:hover:border-[#DFC8E7]/30"
                  }`}>
                  <span className="text-lg">{t.icon}</span>
                  <span className="text-xs font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{ar ? t.ar : t.en}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <p className={`text-[10px] font-black tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-3 ${ar ? "text-right" : ""}`}>
            {ar ? "الإشعارات" : "Notifications"}
          </p>

          <div className="bg-white dark:bg-[#1a1030] rounded-xl border border-[#e7dcee] dark:border-[#3a2560] divide-y divide-[#e7dcee] dark:divide-[#3a2560]">
            {CATEGORIES.map(c => (
              <div key={c.key} className={`flex items-center justify-between gap-3 px-4 py-3.5 ${ar ? "flex-row-reverse" : ""}`}>
                <span className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{ar ? c.ar : c.en}</span>
                <Toggle on={categories[c.key]} onClick={() => toggleCategory(c.key)} ar={ar} />
              </div>
            ))}
          </div>

          <div className={`flex items-center gap-2 mt-3 flex-wrap ${ar ? "flex-row-reverse" : ""}`}>
            {(["push", "email", "sms"] as const).map(ch => (
              <button key={ch} onClick={() => toggleChannel(ch)} disabled={prefsLoading || savingKey === ch}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all disabled:opacity-50 ${
                  channels[ch]
                    ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400"
                    : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/55 dark:text-[#DFC8E7]/55"
                }`}>
                {ch === "push" ? (ar ? "إشعارات فورية" : "Push") : ch === "email" ? (ar ? "بريد إلكتروني" : "Email") : (ar ? "رسائل نصية" : "SMS")}
              </button>
            ))}
          </div>
        </section>

        {/* Account & data */}
        <section>
          <p className={`text-[10px] font-black tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-3 ${ar ? "text-right" : ""}`}>
            {ar ? "الحساب والبيانات" : "Account & data"}
          </p>
          <div className="space-y-2">
            <div className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-[#e7dcee] dark:border-[#3a2560] opacity-60 ${ar ? "flex-row-reverse text-right" : ""}`}>
              <span className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{ar ? "الخصوصية" : "Privacy"}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f9f4fa] dark:bg-[#241540] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                {ar ? "قريباً" : "Soon"}
              </span>
            </div>
            <div className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-[#e7dcee] dark:border-[#3a2560] opacity-60 ${ar ? "flex-row-reverse text-right" : ""}`}>
              <span className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{ar ? "تصدير البيانات" : "Export Data"}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f9f4fa] dark:bg-[#241540] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                {ar ? "قريباً" : "Soon"}
              </span>
            </div>
          </div>
        </section>

        {/* Sign out */}
        <section className="grid grid-cols-1 gap-2">
          <button onClick={handleSignOut} disabled={signingOut}
            className="w-full py-3 rounded-xl font-bold text-sm border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:border-[#2E1A47]/30 hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20 transition-all disabled:opacity-60">
            {signingOut ? (ar ? "جارٍ تسجيل الخروج…" : "Signing out…") : (ar ? "تسجيل الخروج" : "Sign out")}
          </button>
          <div className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-[#e7dcee] dark:border-[#3a2560] opacity-60 ${ar ? "flex-row-reverse text-right" : ""}`}>
            <span className="text-sm font-semibold text-rose-500">{ar ? "حذف الحساب" : "Delete Account"}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f9f4fa] dark:bg-[#241540] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
              {ar ? "قريباً" : "Soon"}
            </span>
          </div>
        </section>

        <p className={`text-center ${ar ? "" : ""}`}>
          <Link href="/dashboard/profile" className="text-xs font-semibold text-[#46255f] dark:text-[#DFC8E7]/70 hover:underline">
            {ar ? "← العودة إلى ملفي الشخصي" : "← Back to My Profile"}
          </Link>
        </p>
      </div>
      </div>
    </div>
  );
}
