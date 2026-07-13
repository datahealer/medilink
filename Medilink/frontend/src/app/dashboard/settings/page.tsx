"use client";

/*
 * Settings hub — account, notification preferences, appearance, and privacy.
 * Integration only: uses existing shared APIs (api.profile, api.notifications) and
 * existing backend GDPR routes (/api/users/me/data-export, /api/users/me/account).
 * No new backend.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";
import { useMyProfile } from "@/hooks/useMyProfile";
import { ThemeToggle } from "@/components/auth/ThemeToggle";
import { env } from "@/lib/env";

/* ─── Channel prefs (profiles.notification_prefs JSONB) ─────────────────── */
type Channels = { push: boolean; email: boolean; sms: boolean };

type ExportRequest = {
  id: string;
  status: string;
  download_url: string | null;
  created_at?: string;
  expires_at?: string | null;
};

const CARD = "bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6";
const LABEL = "text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35";

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${on ? "bg-[#46255f] dark:bg-[#DFC8E7]" : "bg-[#e7dcee] dark:bg-[#3a2560]"}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white dark:bg-[#1a1030] shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export default function SettingsPage() {
  const { locale, setLocale } = useI18n();
  const ar = locale === "ar";
  const { fullName, email, phone } = useMyProfile();

  /* Account status (deletion state) */
  const [status, setStatus] = useState<string | null>(null);

  /* Notification channel prefs */
  const [channels, setChannels] = useState<Channels>({ push: true, email: true, sms: false });
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);

  /* Data export */
  const [latestExport, setLatestExport] = useState<ExportRequest | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  /* Delete account */
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [error, setError] = useState("");

  /* ── Load account status + prefs ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const prefs = (await api.notifications.getPreferences(supabase)) as Record<string, unknown> | null;
        if (!cancelled && prefs) {
          setChannels({
            push: prefs.push !== false,
            email: prefs.email !== false,
            sms: prefs.sms === true,
          });
        }
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setPrefsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadAccount = useCallback(async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { account } = await api.profile.getMyProfile(supabase);
      setStatus((account as { status?: string } | null)?.status ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  const loadExports = useCallback(async () => {
    try {
      const res = await fetch(`${env.BACKEND_URL}/api/users/me/data-export`, { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as { exports?: ExportRequest[] };
      setLatestExport(json.exports?.[0] ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => { void loadAccount(); void loadExports(); }, [loadAccount, loadExports]);

  /* ── Save notification prefs (preserve unknown JSONB keys) ── */
  async function saveChannels(next: Channels) {
    setChannels(next);
    setPrefsSaving(true);
    setError("");
    try {
      const supabase = createBrowserSupabaseClient();
      const current = ((await api.notifications.getPreferences(supabase)) ?? {}) as Record<string, unknown>;
      await api.notifications.updatePreferences(supabase, {
        ...current,
        push: next.push,
        email: next.email,
        sms: next.sms,
      });
    } catch {
      setError(ar ? "تعذّر حفظ التفضيلات." : "Could not save preferences.");
    } finally {
      setPrefsSaving(false);
    }
  }

  /* ── Data export ── */
  async function requestExport() {
    setExportBusy(true);
    setError("");
    try {
      const res = await fetch(`${env.BACKEND_URL}/api/users/me/data-export`, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "export failed");
      }
      await loadExports();
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذّر طلب التصدير." : "Could not request export."));
    } finally {
      setExportBusy(false);
    }
  }

  /* ── Delete / cancel deletion ── */
  async function deleteAccount() {
    if (deleteText !== "DELETE") return;
    setDeleteBusy(true);
    setError("");
    try {
      const res = await fetch(`${env.BACKEND_URL}/api/users/me/account`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "delete failed");
      }
      setConfirmDelete(false);
      setDeleteText("");
      await loadAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذّر حذف الحساب." : "Could not delete account."));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function cancelDeletion() {
    setDeleteBusy(true);
    setError("");
    try {
      const res = await fetch(`${env.BACKEND_URL}/api/users/me/account/cancel-deletion`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("cancel failed");
      await loadAccount();
    } catch {
      setError(ar ? "تعذّر إلغاء الحذف." : "Could not cancel deletion.");
    } finally {
      setDeleteBusy(false);
    }
  }

  const deletionPending = status === "deletion_pending";

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">
      <section className="py-12 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(223,200,231,0.45)" }}>{ar ? "الإعدادات" : "Settings"}</p>
          <h1 className="font-black font-serif text-white" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", lineHeight: 1.1 }}>{ar ? "إعداداتك" : "Your settings"}</h1>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
        )}

        {deletionPending && (
          <div className={`rounded-2xl border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-5 ${ar ? "text-right" : ""}`}>
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-1">{ar ? "الحساب مجدول للحذف" : "Account scheduled for deletion"}</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mb-3">{ar ? "سيتم حذف حسابك خلال ٣٠ يوماً. يمكنك التراجع الآن." : "Your account will be deleted within 30 days. You can undo this now."}</p>
            <button onClick={cancelDeletion} disabled={deleteBusy} className="px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white disabled:opacity-50">
              {ar ? "إلغاء الحذف" : "Cancel deletion"}
            </button>
          </div>
        )}

        {/* Account */}
        <section className={CARD}>
          <div className={`flex items-center justify-between mb-4 ${ar ? "flex-row-reverse" : ""}`}>
            <p className={LABEL}>{ar ? "الحساب" : "Account"}</p>
            <Link href="/dashboard/profile" className="text-xs font-bold text-[#46255f] dark:text-[#DFC8E7]/70 hover:underline">{ar ? "تعديل →" : "Edit →"}</Link>
          </div>
          <div className={`space-y-2 ${ar ? "text-right" : ""}`}>
            {[
              { l: ar ? "الاسم" : "Name", v: fullName || "—" },
              { l: ar ? "البريد الإلكتروني" : "Email", v: email || "—" },
              { l: ar ? "الهاتف" : "Phone", v: phone || "—" },
            ].map(row => (
              <div key={row.l} className={`flex justify-between gap-4 ${ar ? "flex-row-reverse" : ""}`}>
                <span className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">{row.l}</span>
                <span className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] break-all">{row.v}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Notification preferences */}
        <section className={CARD}>
          <p className={`${LABEL} mb-4 ${ar ? "text-right" : ""}`}>{ar ? "تفضيلات الإشعارات" : "Notification Preferences"}</p>
          <div className="space-y-4">
            {([
              { key: "push" as const, en: "Push notifications", arL: "الإشعارات الفورية" },
              { key: "email" as const, en: "Email", arL: "البريد الإلكتروني" },
              { key: "sms" as const, en: "SMS", arL: "الرسائل النصية" },
            ]).map(ch => (
              <div key={ch.key} className={`flex items-center justify-between ${ar ? "flex-row-reverse" : ""}`}>
                <span className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{ar ? ch.arL : ch.en}</span>
                <Toggle on={channels[ch.key]} disabled={prefsLoading || prefsSaving} onClick={() => saveChannels({ ...channels, [ch.key]: !channels[ch.key] })} />
              </div>
            ))}
          </div>
        </section>

        {/* Appearance */}
        <section className={CARD}>
          <p className={`${LABEL} mb-4 ${ar ? "text-right" : ""}`}>{ar ? "المظهر واللغة" : "Appearance & Language"}</p>
          <div className={`flex items-center justify-between mb-4 ${ar ? "flex-row-reverse" : ""}`}>
            <span className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{ar ? "السمة" : "Theme"}</span>
            <ThemeToggle />
          </div>
          <div className={`flex items-center justify-between ${ar ? "flex-row-reverse" : ""}`}>
            <span className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{ar ? "اللغة" : "Language"}</span>
            <div className={`flex gap-2 ${ar ? "flex-row-reverse" : ""}`}>
              {(["en", "ar"] as const).map(lc => (
                <button key={lc} onClick={() => setLocale(lc)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${locale === lc ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030] border-transparent" : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60"}`}>
                  {lc === "en" ? "English" : "العربية"}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy & data */}
        <section className={CARD}>
          <p className={`${LABEL} mb-4 ${ar ? "text-right" : ""}`}>{ar ? "الخصوصية والبيانات" : "Privacy & Data"}</p>

          {/* Data export */}
          <div className={`flex items-center justify-between gap-4 mb-4 ${ar ? "flex-row-reverse text-right" : ""}`}>
            <div>
              <p className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{ar ? "تصدير بياناتي" : "Export my data"}</p>
              <p className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">
                {latestExport
                  ? (latestExport.status === "ready" && latestExport.download_url
                      ? (ar ? "التصدير جاهز." : "Your export is ready.")
                      : (ar ? `الحالة: ${latestExport.status}` : `Status: ${latestExport.status}`))
                  : (ar ? "احصل على نسخة من بياناتك." : "Get a copy of your data.")}
              </p>
            </div>
            {latestExport?.status === "ready" && latestExport.download_url ? (
              <a href={latestExport.download_url} target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl text-sm font-bold text-[#2E1A47] flex-shrink-0" style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                {ar ? "تنزيل" : "Download"}
              </a>
            ) : (
              <button onClick={requestExport} disabled={exportBusy}
                className="px-4 py-2 rounded-xl text-sm font-bold border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 disabled:opacity-50 flex-shrink-0">
                {exportBusy ? (ar ? "…" : "…") : (ar ? "طلب التصدير" : "Request export")}
              </button>
            )}
          </div>

          {/* Delete account */}
          {!deletionPending && (
            <div className={`border-t border-[#e7dcee] dark:border-[#2a1840] pt-4 ${ar ? "text-right" : ""}`}>
              <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">{ar ? "حذف الحساب" : "Delete account"}</p>
              <p className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 mb-3">{ar ? "حذف نهائي بعد ٣٠ يوماً. تُلغى المواعيد النشطة." : "Permanent after a 30-day grace period. Active appointments are cancelled."}</p>
              <button onClick={() => setConfirmDelete(true)} className="px-4 py-2 rounded-xl text-sm font-bold border border-red-200 dark:border-red-800/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                {ar ? "حذف حسابي" : "Delete my account"}
              </button>
            </div>
          )}
        </section>

        {/* Security (informational — 2FA is managed for staff accounts only) */}
        <section className={CARD}>
          <p className={`${LABEL} mb-2 ${ar ? "text-right" : ""}`}>{ar ? "الأمان" : "Security"}</p>
          <p className={`text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 ${ar ? "text-right" : ""}`}>
            {ar ? "تُدار كلمة المرور من خلال «نسيت كلمة المرور» في صفحة تسجيل الدخول." : "Your password is managed via “Forgot password” on the sign-in page."}
          </p>
        </section>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white dark:bg-[#1a1030] rounded-2xl p-6 max-w-sm w-full border border-[#e7dcee] dark:border-[#3a2560] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-lg text-[#2E1A47] dark:text-[#DFC8E7] mb-2">{ar ? "تأكيد حذف الحساب" : "Confirm account deletion"}</h3>
            <p className="text-sm text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 mb-4">
              {ar ? 'اكتب "DELETE" للتأكيد. يمكنك التراجع خلال ٣٠ يوماً.' : 'Type "DELETE" to confirm. You can undo within 30 days.'}
            </p>
            <input value={deleteText} onChange={e => setDeleteText(e.target.value)} placeholder="DELETE"
              className="w-full text-sm text-[#2E1A47] dark:text-[#DFC8E7] bg-[#f9f4fa] dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-4 py-3 outline-none mb-4" />
            <div className="flex gap-2">
              <button onClick={() => { setConfirmDelete(false); setDeleteText(""); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/70 dark:text-[#DFC8E7]/70">
                {ar ? "إلغاء" : "Cancel"}
              </button>
              <button onClick={deleteAccount} disabled={deleteText !== "DELETE" || deleteBusy}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white disabled:opacity-40">
                {deleteBusy ? (ar ? "جارٍ الحذف…" : "Deleting…") : (ar ? "حذف" : "Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
