"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

type UIType = "reminder" | "confirmed" | "lab" | "rx" | "payment" | "message";

type Notif = {
  id: string;
  icon: string;
  type: UIType;
  unread: boolean;
  dotColor: string;
  bg: string;
  border: string;
  tagBg: string; tagColor: string; tagBorder: string;
  en: { tag: string; title: string; body: string; time: string };
  ar: { tag: string; title: string; body: string; time: string };
};

// Visual presets keyed by UI type (preserves the original palette exactly).
// Backend `in_app_notifications.type` is mapped onto these buckets; the backend
// stores a single title/body (no Arabic column) so `ar` mirrors `en`.
const STYLE: Record<UIType, {
  icon: string; dotColor: string; bg: string; border: string;
  tagBg: string; tagColor: string; tagBorder: string; tagEn: string; tagAr: string;
}> = {
  reminder:  { icon: "⏰", dotColor: "#f59e0b", bg: "linear-gradient(135deg,#fffbeb,#fefce8)", border: "#fde68a", tagBg: "#fef3c7", tagColor: "#b45309", tagBorder: "#fde68a", tagEn: "Reminder",    tagAr: "تذكير" },
  confirmed: { icon: "✅", dotColor: "#10b981", bg: "linear-gradient(135deg,#f0fdf4,#ecfdf5)", border: "#a7f3d0", tagBg: "#d1fae5", tagColor: "#065f46", tagBorder: "#6ee7b7", tagEn: "Confirmed",   tagAr: "مؤكد" },
  lab:       { icon: "🧪", dotColor: "#38bdf8", bg: "linear-gradient(135deg,#f0f9ff,#eff6ff)", border: "#bae6fd", tagBg: "#e0f2fe", tagColor: "#0369a1", tagBorder: "#7dd3fc", tagEn: "Lab Results", tagAr: "نتائج" },
  rx:        { icon: "💊", dotColor: "#a855f7", bg: "linear-gradient(135deg,#faf5ff,#f5f3ff)", border: "#d8b4fe", tagBg: "#ede9fe", tagColor: "#6d28d9", tagBorder: "#c4b5fd", tagEn: "Rx Renewal",  tagAr: "تجديد وصفة" },
  payment:   { icon: "💳", dotColor: "#8b5cf6", bg: "linear-gradient(135deg,#faf5ff,#ede9fe)", border: "#c4b5fd", tagBg: "#ede9fe", tagColor: "#5b21b6", tagBorder: "#a78bfa", tagEn: "Payment",     tagAr: "دفع" },
  message:   { icon: "💬", dotColor: "#3b82f6", bg: "linear-gradient(135deg,#eff6ff,#eef2ff)", border: "#bfdbfe", tagBg: "#dbeafe", tagColor: "#1d4ed8", tagBorder: "#93c5fd", tagEn: "Message",     tagAr: "رسالة" },
};

function uiTypeOf(backendType: string): UIType {
  const t = (backendType ?? "").toLowerCase();
  if (t.includes("lab")) return "lab";
  if (t.includes("pay") || t.includes("invoice") || t.includes("refund")) return "payment";
  if (t.includes("prescription") || t.includes("rx") || t.includes("medication")) return "rx";
  if (t.includes("message") || t.includes("chat")) return "message";
  if (t.includes("confirm") || t.includes("approv") || t.includes("book")) return "confirmed";
  return "reminder";
}

function relTime(iso: string | null, isAr: boolean): string {
  if (!iso) return "";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000), hr = Math.floor(min / 60), day = Math.floor(hr / 24);
  if (isAr) {
    if (day > 0) return `منذ ${day} ${day === 1 ? "يوم" : "أيام"}`;
    if (hr > 0)  return `منذ ${hr} ${hr === 1 ? "ساعة" : "ساعات"}`;
    if (min > 0) return `منذ ${min} دقيقة`;
    return "الآن";
  }
  if (day > 0) return `${day} day${day === 1 ? "" : "s"} ago`;
  if (hr > 0)  return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  if (min > 0) return `${min} min ago`;
  return "just now";
}

type NotifRow = Awaited<ReturnType<typeof api.notifications.listNotifications>>[number];

function toNotif(r: NotifRow): Notif {
  const ui = uiTypeOf(r.type ?? "");
  const s = STYLE[ui];
  const title = r.title ?? "";
  const body = r.body ?? "";
  return {
    id: r.id, icon: s.icon, type: ui, unread: !r.is_read,
    dotColor: s.dotColor, bg: s.bg, border: s.border,
    tagBg: s.tagBg, tagColor: s.tagColor, tagBorder: s.tagBorder,
    en: { tag: s.tagEn, title, body, time: relTime(r.created_at, false) },
    ar: { tag: s.tagAr, title, body, time: relTime(r.created_at, true) },
  };
}

const FILTER_TABS = [
  { key: "all",      en: "All",       ar: "الكل" },
  { key: "unread",   en: "Unread",    ar: "غير مقروء" },
  { key: "reminder", en: "Reminders", ar: "تذكيرات" },
  { key: "lab",      en: "Lab",       ar: "تحاليل" },
  { key: "payment",  en: "Payments",  ar: "مدفوعات" },
];

export default function NotificationsPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [filter, setFilter]       = useState("all");
  const [items, setItems]         = useState<Notif[]>([]);
  const [markedAll, setMarkedAll] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  useEffect(() => {
    let active = true;
    // `silent` refetches (triggered by the cross-view sync event) skip the skeleton so
    // returning from the details page updates read state without a visible reload.
    const load = (silent = false) => {
      if (!silent) setLoading(true);
      api.notifications
        .listNotifications(supabase, { limit: 50 })
        .then((rows) => { if (active) { setItems(rows.map(toNotif)); setError(""); } })
        .catch(() => { if (active) setError(ar ? "تعذر تحميل الإشعارات." : "Could not load notifications."); })
        .finally(() => { if (active && !silent) setLoading(false); });
    };
    load();
    const onChange = () => load(true);
    window.addEventListener("medilink:notifications-changed", onChange);
    return () => { active = false; window.removeEventListener("medilink:notifications-changed", onChange); };
  }, [supabase, ar]);

  function emitNotifChange() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("medilink:notifications-changed"));
  }

  async function markAllRead() {
    const snapshot = items;
    setItems(prev => prev.map(n => ({ ...n, unread: false })));
    setMarkedAll(true);
    try { await api.notifications.markAllRead(supabase); emitNotifChange(); }
    catch { setItems(snapshot); setMarkedAll(false); }
  }
  async function dismissItem(id: string) {
    const snapshot = items;
    setItems(prev => prev.filter(n => n.id !== id));
    try { await api.notifications.deleteNotification(supabase, id); emitNotifChange(); }
    catch { setItems(snapshot); }
  }
  async function markOneRead(id: string) {
    const snapshot = items;
    setItems(prev => prev.map(n => n.id === id ? { ...n, unread: false } : n));
    try { await api.notifications.markRead(supabase, id); emitNotifChange(); }
    catch { setItems(snapshot); }
  }

  const unreadCount = items.filter(n => n.unread).length;

  const filtered = items.filter(n => {
    if (filter === "all")      return true;
    if (filter === "unread")   return n.unread;
    if (filter === "lab")      return n.type === "lab";
    if (filter === "payment")  return n.type === "payment";
    if (filter === "reminder") return n.type === "reminder" || n.type === "confirmed";
    return true;
  });

  const showGrouped = filter === "all";
  const newItems    = showGrouped ? filtered.filter(n => n.unread)  : [];
  const earlierItems = showGrouped ? filtered.filter(n => !n.unread) : filtered;

  function tabCount(key: string) {
    if (key === "all")     return items.length;
    if (key === "unread")  return unreadCount;
    if (key === "lab")     return items.filter(n => n.type === "lab").length;
    if (key === "payment") return items.filter(n => n.type === "payment").length;
    if (key === "reminder")return items.filter(n => n.type === "reminder" || n.type === "confirmed").length;
    return 0;
  }

  function NotifCard({ n }: { n: Notif }) {
    const nd = ar ? n.ar : n.en;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/dashboard/notifications/${n.id}`)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/dashboard/notifications/${n.id}`); } }}
        className={`group relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer ${n.unread ? "shadow-sm" : "opacity-75 hover:opacity-100"}`}
        style={{ background: n.bg, borderColor: n.border }}>
        {n.unread && (
          <div className={`absolute top-0 bottom-0 w-1 ${ar ? "right-0" : "left-0"}`} style={{ background: n.dotColor }} />
        )}
        <div className={`flex items-start gap-3 ${ar ? "flex-row-reverse" : ""}`}>
          {/* Icon */}
          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 rounded-2xl bg-white/70 dark:bg-black/25 shadow-sm flex items-center justify-center text-xl">
              {n.icon}
            </div>
            {n.unread && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#0f0a1e] animate-pulse"
                style={{ background: n.dotColor }} />
            )}
          </div>

          {/* Content */}
          <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
            <div className={`flex items-center gap-2 mb-1 flex-wrap ${ar ? "flex-row-reverse" : ""}`}>
              <span className="text-[10px] font-black  tracking-widest px-2 py-0.5 rounded-full border"
                style={{ background: n.tagBg, color: n.tagColor, borderColor: n.tagBorder }}>
                {nd.tag}
              </span>
              <span className="text-[10px] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">{nd.time}</span>
            </div>
            <p className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7] leading-tight mb-0.5">{nd.title}</p>
            <p className="text-xs text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 leading-snug">{nd.body}</p>
          </div>

          {/* Actions */}
          <div className={`flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${ar ? "flex-row-reverse" : ""}`}>
            {n.unread && (
              <button onClick={(e) => { e.stopPropagation(); markOneRead(n.id); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                title={ar ? "تعليم كمقروء" : "Mark as read"}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); dismissItem(n.id); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
              title={ar ? "حذف" : "Dismiss"}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7] pb-16">

      {/* Hero */}
      <section className="relative overflow-hidden py-12 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-15%] right-[-8%] w-72 h-72 rounded-full opacity-25"
            style={{ background: "radial-gradient(circle, #e8d5f0, transparent 70%)", filter: "blur(70px)" }} />
          <div className="absolute bottom-[-20%] left-[-8%] w-60 h-60 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, #d5e8f5, transparent 70%)", filter: "blur(60px)" }} />
        </div>

        <div className="relative max-w-2xl mx-auto">
          <Link href="/dashboard"
            className={`inline-flex items-center gap-1.5 text-xs font-semibold no-underline mb-5 transition-colors hover:opacity-80 ${ar ? "flex-row-reverse" : ""}`}
            style={{ color: "rgba(223,200,231,0.55)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points={ar ? "9 18 15 12 9 6" : "15 18 9 12 15 6"}/>
            </svg>
            {ar ? "لوحة التحكم" : "Dashboard"}
          </Link>

          <div className={`flex items-start justify-between gap-4 ${ar ? "flex-row-reverse" : ""}`}>
            <div className={`flex items-center gap-4 ${ar ? "flex-row-reverse text-right" : ""}`}>
              <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                🔔
                {unreadCount > 0 && !markedAll && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center leading-none border-2 border-[#2E1A47]">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div>
                <h1 className="font-black font-serif text-white text-2xl leading-tight">
                  {ar ? "الإشعارات" : "Notifications"}
                </h1>
                {unreadCount > 0 && !markedAll ? (
                  <p className="text-sm mt-1" style={{ color: "rgba(223,200,231,0.55)" }}>
                    {ar ? `${unreadCount} إشعار غير مقروء` : `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`}
                  </p>
                ) : (
                  <p className="text-sm mt-1 inline-flex items-center gap-1.5" style={{ color: "rgba(223,200,231,0.4)" }}>
                    ✨ {ar ? "جميعها مقروءة" : "All caught up"}
                  </p>
                )}
              </div>
            </div>
            <div className={`flex items-center gap-2 flex-shrink-0 ${ar ? "flex-row-reverse" : ""}`}>
              <Link href="/dashboard/messages"
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all hover:scale-[1.03] no-underline"
                style={{ background: "rgba(223,200,231,0.12)", color: "rgba(223,200,231,0.75)", border: "1px solid rgba(223,200,231,0.2)" }}>
                {ar ? "رسائل العيادات" : "Facility messages"}
              </Link>
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-all hover:scale-[1.03]"
                  style={{ background: "rgba(223,200,231,0.12)", color: "rgba(223,200,231,0.75)", border: "1px solid rgba(223,200,231,0.2)" }}>
                  {ar ? "تعليم الكل كمقروء" : "Mark all read"}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Filter tabs */}
      <div className="bg-white dark:bg-[#0d0820] border-b border-[#e7dcee] dark:border-[#2a1840] sticky top-0 z-10 shadow-sm shadow-[#2E1A47]/5">
        <div className="max-w-2xl mx-auto px-4">
          <div className={`flex gap-1.5 overflow-x-auto py-2.5 ${ar ? "flex-row-reverse" : ""}`} style={{ scrollbarWidth: "none" }}>
            {FILTER_TABS.map(tab => {
              const count = tabCount(tab.key);
              const active = filter === tab.key;
              return (
                <button key={tab.key} onClick={() => setFilter(tab.key)}
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? "text-[#2E1A47] dark:text-[#1a1030] shadow-sm"
                      : "text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20"
                  }`}
                  style={active ? { background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" } : {}}>
                  {ar ? tab.ar : tab.en}
                  {count > 0 && (
                    <span className={`text-[10px] font-black px-1.5 rounded-full ${
                      active ? "bg-white/50 text-[#2E1A47]" : "bg-[#2E1A47]/8 dark:bg-[#DFC8E7]/10 text-[#2E1A47]/50 dark:text-[#DFC8E7]/50"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-white/60 dark:bg-[#1a1030]/60 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">⚠️</p>
            <p className="text-sm font-semibold text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">🔔</p>
            <p className="text-sm font-semibold text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">
              {ar ? "لا توجد إشعارات" : "No notifications here"}
            </p>
          </div>
        ) : showGrouped ? (
          <>
            {newItems.length > 0 && (
              <div className="space-y-3">
                <p className={`text-[11px] font-black  tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 px-1 ${ar ? "text-right" : ""}`}>
                  {ar ? "جديد" : "New"}
                </p>
                {newItems.map(n => <NotifCard key={n.id} n={n} />)}
              </div>
            )}
            {earlierItems.length > 0 && (
              <div className="space-y-3">
                <p className={`text-[11px] font-black  tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 px-1 ${ar ? "text-right" : ""}`}>
                  {ar ? "سابقاً" : "Earlier"}
                </p>
                {earlierItems.map(n => <NotifCard key={n.id} n={n} />)}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {filtered.map(n => <NotifCard key={n.id} n={n} />)}
          </div>
        )}

        {/* Footer count */}
        {filtered.length > 0 && (
          <p className={`text-center text-xs text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 pt-2 ${ar ? "text-right" : ""}`}>
            {ar ? `عرض ${filtered.length} من ${items.length} إشعار` : `Showing ${filtered.length} of ${items.length} notifications`}
          </p>
        )}
      </div>
    </div>
  );
}
