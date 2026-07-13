"use client";

/*
 * Facility Messages — read-only inbox of clinic/facility announcements.
 * Integration only: api.notifications.listFacilityMessages +
 * markFacilityMessagesRead (announcements + announcement_reads). No new backend.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

type FacilityMessage = Awaited<ReturnType<typeof api.notifications.listFacilityMessages>>[number];

function relTime(iso: string, ar: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return ar ? "الآن" : "now";
  if (mins < 60) return ar ? `${mins} د` : `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return ar ? `${hrs} س` : `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return ar ? `${days} ي` : `${days}d`;
  return d.toLocaleDateString(ar ? "ar" : "en", { day: "numeric", month: "short" });
}

export default function FacilityMessagesPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [messages, setMessages] = useState<FacilityMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createBrowserSupabaseClient();
      const rows = await api.notifications.listFacilityMessages(supabase);
      setMessages(rows);
      // Mark any unread as read (idempotent) and reflect locally.
      const unreadIds = rows.filter(m => m.unread).map(m => m.id);
      if (unreadIds.length) {
        try {
          await api.notifications.markFacilityMessagesRead(supabase, unreadIds);
          setMessages(prev => prev.map(m => ({ ...m, unread: false })));
        } catch { /* non-fatal */ }
      }
    } catch {
      setError(ar ? "تعذّر تحميل الرسائل." : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [ar]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">
      <section className="py-12 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-3xl mx-auto">
          <div className={`flex items-center justify-between gap-3 ${ar ? "flex-row-reverse" : ""}`}>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(223,200,231,0.45)" }}>{ar ? "الرسائل" : "Messages"}</p>
              <h1 className="font-black font-serif text-white" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", lineHeight: 1.1 }}>{ar ? "رسائل العيادات" : "Facility messages"}</h1>
            </div>
            <Link href="/dashboard/notifications" className="text-sm font-bold text-white/70 hover:text-white no-underline flex-shrink-0">
              {ar ? "الإشعارات →" : "Notifications →"}
            </Link>
          </div>
        </div>
      </section>

      <section className="py-8 px-6">
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-[#46255f]/20 border-t-[#46255f] dark:border-[#DFC8E7]/20 dark:border-t-[#DFC8E7] animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
              <button onClick={() => void load()} className="px-5 py-2.5 rounded-xl font-bold text-sm border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/70 dark:text-[#DFC8E7]/70">
                {ar ? "إعادة المحاولة" : "Try again"}
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">📬</p>
              <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-2">{ar ? "لا توجد رسائل" : "No messages"}</p>
              <p className="text-sm text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">{ar ? "ستظهر إعلانات العيادات هنا." : "Announcements from your clinics will appear here."}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map(m => (
                <div key={m.id} className={`${m.unread ? "border-[#DFC8E7]/60 bg-[#faf5ff] dark:bg-[#2E1A47]/20" : "border-[#e7dcee] dark:border-[#3a2560] bg-white dark:bg-[#1a1030]"} rounded-2xl border p-5`}>
                  <div className={`flex items-start gap-3 ${ar ? "flex-row-reverse" : ""}`}>
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 bg-gradient-to-br from-[#d5e8f5] to-[#ede0f8]">🏥</div>
                    <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
                      <div className={`flex items-center gap-2 mb-1 ${ar ? "flex-row-reverse" : ""}`}>
                        <p className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7] truncate">{m.source || (ar ? "عيادة" : "Clinic")}</p>
                        <span className="text-[11px] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 flex-shrink-0">{relTime(m.time, ar)}</span>
                      </div>
                      <p className="text-sm text-[#2E1A47]/65 dark:text-[#DFC8E7]/65 leading-snug">{m.preview}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
