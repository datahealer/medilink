"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { LangToggle } from "@/components/auth/LangToggle";
import { ThemeToggle } from "@/components/auth/ThemeToggle";
import { SiteSearch } from "@/components/dashboard/SiteSearch";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuth } from "@/context/AuthContext";
import { useMyProfile } from "@/hooks/useMyProfile";
import { toNotifPreview, type NotifPreview } from "@/lib/notifications";

function NotificationBell({ ar }: { ar: boolean }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifPreview[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.notifications.listNotifications(supabase, { limit: 5 }).catch(() => []),
      api.notifications.unreadCount(supabase).catch(() => 0),
    ]).then(([rows, count]) => {
      if (!active) return;
      setItems(rows.map(toNotifPreview));
      setUnread(count);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#2E1A47]/5 dark:hover:bg-[#DFC8E7]/8 transition-colors"
        aria-label="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center leading-none">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`fixed sm:absolute left-3 right-3 top-[64px] sm:top-full w-auto sm:w-80 sm:mt-1.5 bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#2a1840] shadow-xl shadow-[#2E1A47]/10 z-50 overflow-hidden ${ar ? "sm:left-0 sm:right-auto" : "sm:right-0 sm:left-auto"}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e7dcee] dark:border-[#2a1840]">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7]">{ar ? "الإشعارات" : "Notifications"}</p>
              {unread > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-rose-500 text-white">{unread} {ar ? "جديد" : "new"}</span>
              )}
            </div>
            <Link href="/dashboard/notifications" onClick={() => setOpen(false)}
              className="text-[11px] font-semibold text-[#46255f] dark:text-[#DFC8E7]/70 hover:underline no-underline">
              {ar ? "عرض الكل" : "View all"}
            </Link>
          </div>

          {/* Items */}
          <div className="divide-y divide-[#e7dcee] dark:divide-[#2a1840] max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {loading ? (
              <div className="px-4 py-6 text-center text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                {ar ? "جارٍ التحميل…" : "Loading…"}
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                {ar ? "لا توجد إشعارات." : "No notifications yet."}
              </div>
            ) : items.map((n) => {
              const nd = ar ? n.ar : n.en;
              return (
                <div key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-[#f9f4fa] dark:hover:bg-[#2E1A47]/20 transition-colors cursor-pointer ${!n.unread ? "opacity-60 hover:opacity-100" : ""}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${n.unread ? "bg-[#faf5ff] dark:bg-[#2E1A47]/40" : "bg-[#f5f5f5] dark:bg-[#1a1030]"} relative`}>
                    {n.icon}
                    {n.unread && n.dotColor && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white dark:border-[#1a1030]"
                        style={{ background: n.dotColor }} />
                    )}
                  </div>
                  <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
                    <p className="text-xs font-bold text-[#2E1A47] dark:text-[#DFC8E7] leading-tight">{nd.title}</p>
                    <p className="text-[11px] text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 leading-snug mt-0.5 truncate">{nd.body}</p>
                    <p className="text-[10px] text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mt-1">{nd.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const NAV_LINKS = [
  { href: "/dashboard/find-doctors",     en: "Find Doctors",       ar: "ابحث عن طبيب" },
  { href: "/dashboard/symptom-checker",  en: "Symptom Checker",    ar: "فاحص الأعراض" },
  { href: "/dashboard/lab-tests",        en: "Lab Tests",          ar: "تحاليل مختبرية" },
  { href: "/dashboard/surgeries",        en: "Surgeries",          ar: "العمليات الجراحية" },
  { href: "/dashboard/profile",          en: "My Profile",         ar: "ملفي الشخصي" },
];

function SettingsLink() {
  return (
    <Link href="/dashboard/settings" aria-label="Settings"
      className="p-2 rounded-xl text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#2E1A47]/5 dark:hover:bg-[#DFC8E7]/8 transition-colors">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </Link>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { locale } = useI18n();
  const ar = locale === "ar";
  const { signOut } = useAuth();
  const { fullName, shortName, initials, email, loading } = useMyProfile();

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setOpen(false);
    try {
      await signOut(); // clears the Supabase session + cached browser client
    } finally {
      router.push("/sign-in");
      router.refresh(); // drop server-component + middleware state for the old session
    }
  }

  const menuItems = [
    { en: "My Profile",      ar: "ملفي الشخصي", href: "/dashboard/profile" },
    { en: "My Appointments", ar: "مواعيدي",      href: "/dashboard/appointments" },
    { en: "My Records",      ar: "سجلاتي",       href: "/dashboard/records" },
    { en: "Payments",        ar: "المدفوعات",    href: "/dashboard/payments" },
  ];

  // Fallbacks keep the header stable during the first profile fetch — never a
  // hardcoded identity, always tied to the authenticated account.
  const displayInitials = initials || (loading ? "" : "?");
  const displayShort = shortName || (loading ? "" : (ar ? "حسابي" : "Account"));
  const displayFull = fullName || (loading ? "…" : (ar ? "حسابي" : "My Account"));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 py-1.5 px-2 rounded-xl hover:bg-[#2E1A47]/5 dark:hover:bg-[#DFC8E7]/8 transition-colors"
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-[#2E1A47] flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}
        >
          {displayInitials}
        </div>
        <span className="text-sm font-medium text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hidden sm:block max-w-[120px] truncate">
          {displayShort}
        </span>
        <svg className="w-3 h-3 text-[#2E1A47]/40 dark:text-[#DFC8E7]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className={`absolute top-full mt-1.5 w-48 bg-white dark:bg-[#1a1030] rounded-xl border border-[#e7dcee] dark:border-[#2a1840] shadow-lg shadow-[#2E1A47]/8 z-50 overflow-hidden ${ar ? "left-0" : "right-0"}`}>
          <div className={`px-4 py-2.5 border-b border-[#e7dcee] dark:border-[#2a1840] ${ar ? "text-right" : ""}`}>
            <p className="text-xs font-semibold text-[#2E1A47] dark:text-[#DFC8E7] truncate">
              {displayFull}
            </p>
            {email && (
              <p className="text-[11px] text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 truncate">{email}</p>
            )}
          </div>
          {menuItems.map(item => (
            <button key={item.href} onClick={() => { setOpen(false); router.push(item.href); }}
              className={`block w-full px-4 py-2.5 text-sm text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#f9f4fa] dark:hover:bg-[#2E1A47]/20 transition-colors ${ar ? "text-right" : "text-left"}`}>
              {ar ? item.ar : item.en}
            </button>
          ))}
          <div className="border-t border-[#e7dcee] dark:border-[#2a1840] mt-1">
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className={`block w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-60 ${ar ? "text-right" : "text-left"}`}
            >
              {signingOut ? (ar ? "جارٍ تسجيل الخروج…" : "Signing out…") : (ar ? "تسجيل الخروج" : "Sign out")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GuestActions({ ar }: { ar: boolean }) {
  const pathname = usePathname();
  const next = encodeURIComponent(pathname || "/dashboard");
  return (
    <div className="flex items-center gap-2">
      <Link href={`/sign-in?next=${next}`}
        className="px-3 py-1.5 rounded-xl text-sm font-semibold no-underline text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#2E1A47]/5 dark:hover:bg-[#DFC8E7]/8 transition-colors">
        {ar ? "تسجيل الدخول" : "Sign in"}
      </Link>
      <Link href={`/sign-up?next=${next}`}
        className="inline-flex items-center justify-center font-bold text-xs text-[#2E1A47] no-underline hover:opacity-90 active:scale-[0.97] transition-all tracking-widest px-5 py-2"
        style={{
          backgroundImage: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)",
          transform: "skewX(-12deg)",
          borderRadius: "8px",
          boxShadow: "0 6px 22px rgba(223,200,231,0.45)",
        }}>
        <span style={{ display: "inline-flex", alignItems: "center", transform: "skewX(12deg)" }}>
          {ar ? "ابدأ الآن" : "Get Started"}
        </span>
      </Link>
    </div>
  );
}

export function DashboardNav() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const { user, loading } = useAuth();
  const [activeLink, setActiveLink] = useState("");
  const [menuOpen, setMenuOpen]     = useState(false);

  return (
    <header
      dir={ar ? "rtl" : "ltr"}
      className="bg-white dark:bg-[#0a0518] border-b border-[#e7dcee] dark:border-[#2a1840] sticky top-0 z-50 shadow-sm shadow-[#2E1A47]/5"
    >
      {/* ── Row 1 ─────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 flex items-center gap-4 h-[56px]">

        {/* Logo */}
        <Link href="/dashboard" className="flex items-center no-underline flex-shrink-0 group transition-transform group-hover:scale-105">
          <img src="/logo/wordmark-violet.svg"  alt="MediLink" className="h-[18px] w-auto dark:hidden" />
          <img src="/logo/wordmark-lavender.svg" alt="MediLink" className="h-[18px] w-auto hidden dark:block" />
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-0.5 mx-2">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href}
              onClick={() => setActiveLink(link.href)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium no-underline transition-all ${
                activeLink === link.href
                  ? "text-[#2E1A47] dark:text-[#DFC8E7] bg-[#2E1A47]/7 dark:bg-[#DFC8E7]/10 font-semibold"
                  : "text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#2E1A47]/5 dark:hover:bg-[#DFC8E7]/8"
              }`}>
              {ar ? link.ar : link.en}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <LangToggle />
          <ThemeToggle />
          {loading ? null : user ? (
            <>
              <NotificationBell ar={ar} />
              <SettingsLink />
              <div className="w-px h-5 bg-[#e7dcee] dark:bg-[#2a1840] mx-1" />
              <UserMenu />
            </>
          ) : (
            <>
              <div className="w-px h-5 bg-[#e7dcee] dark:bg-[#2a1840] mx-1" />
              <GuestActions ar={ar} />
            </>
          )}
        </div>

        {/* Hamburger */}
        <button
          className="md:hidden p-2 rounded-xl text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#2E1A47]/5 dark:hover:bg-[#DFC8E7]/8 transition-colors"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {menuOpen
              ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
              : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
          </svg>
        </button>
      </div>

      {/* ── Row 2: Location + Search ──────────────────────────── */}
      <div className="border-t border-[#e7dcee]/60 dark:border-[#2a1840] bg-[#faf8fc] dark:bg-[#0d0820] hidden sm:block">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-center gap-3">
          <div className="flex-1 max-w-xl">
            <SiteSearch isAr={ar} placeholder={ar ? "ابحث عن أطباء، عيادات، مستشفيات..." : "Search doctors, clinics, hospitals, etc."} />
          </div>
        </div>
      </div>

      {/* ── Mobile menu ────────────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden border-t border-[#e7dcee] dark:border-[#2a1840] bg-white dark:bg-[#0a0518] px-4 py-3 flex flex-col gap-1">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#2E1A47]/5 dark:hover:bg-[#DFC8E7]/8 no-underline transition-colors ${ar ? "text-right" : ""}`}
              onClick={() => { setActiveLink(link.href); setMenuOpen(false); }}>
              {ar ? link.ar : link.en}
            </Link>
          ))}
          <div className="h-px bg-[#e7dcee] dark:bg-[#2a1840] my-1" />
          <SiteSearch isAr={ar} placeholder={ar ? "ابحث عن أطباء، عيادات..." : "Search doctors, clinics..."}
            onNavigate={() => setMenuOpen(false)} />
        </div>
      )}
    </header>
  );
}
