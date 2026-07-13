"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { ARTICLES } from "@/lib/data/articles";

export default function ArticlesPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  const categories = ["all", ...Array.from(new Set(ARTICLES.map(a => a.en.tag)))];
  const [activeCat, setActiveCat] = useState("all");

  const filtered = activeCat === "all" ? ARTICLES : ARTICLES.filter(a => a.en.tag === activeCat);

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">

      {/* Hero */}
      <section className="py-12 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-5xl mx-auto">
          <Link href="/dashboard"
            className={`inline-flex items-center gap-1.5 text-xs font-semibold no-underline mb-5 transition-colors hover:opacity-80 ${ar ? "flex-row-reverse" : ""}`}
            style={{ color: "rgba(223,200,231,0.55)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points={ar ? "9 18 15 12 9 6" : "15 18 9 12 15 6"}/>
            </svg>
            {ar ? "لوحة التحكم" : "Dashboard"}
          </Link>
          <p className="text-xs font-bold  tracking-widest mb-3" style={{ color: "rgba(223,200,231,0.45)" }}>
            {ar ? "المكتبة الصحية" : "Health Library"}
          </p>
          <h1 className="font-black font-serif text-white" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
            {ar
              ? <>اقرأ أفضل المقالات<br /><em className="italic text-[#DFC8E7]">من خبراء الصحة.</em></>
              : <>Read top articles<br /><em className="italic text-[#DFC8E7]">from health experts.</em></>}
          </h1>
        </div>
      </section>

      {/* Category filters */}
      <section className="bg-white dark:bg-[#0d0820] border-b border-[#e7dcee] dark:border-[#2a1840] px-6 py-4 overflow-x-auto sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex gap-2 flex-nowrap">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCat(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 border transition-all ${
                activeCat === cat
                  ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030] border-transparent"
                  : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:border-[#2E1A47]/30 dark:hover:border-[#DFC8E7]/30"
              }`}>
              {cat === "all" ? (ar ? "الكل" : "All") : (ar ? ARTICLES.find(a => a.en.tag === cat)?.ar.tag : cat)}
            </button>
          ))}
        </div>
      </section>

      {/* Articles grid */}
      <section className="py-10 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold  tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-6">
            {ar ? `${filtered.length} مقال` : `${filtered.length} article${filtered.length !== 1 ? "s" : ""}`}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(article => {
              const d = ar ? article.ar : article.en;
              return (
                <Link key={article.id} href={`/dashboard/articles/${article.id}`}
                  className="rounded-2xl overflow-hidden border border-[#e7dcee] dark:border-[#3a2560] bg-white dark:bg-[#1a1030] hover:shadow-xl hover:-translate-y-1 transition-all duration-200 no-underline group">
                  <div className="h-36 flex items-center justify-center text-5xl relative overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${article.from}, ${article.to})` }}>
                    <span className="relative z-10 drop-shadow-sm transition-transform duration-300 group-hover:scale-110">
                      {article.emoji}
                    </span>
                  </div>
                  <div className={`p-5 ${ar ? "text-right" : ""}`}>
                    <p className="text-[9px] font-bold  tracking-widest text-[#46255f] dark:text-[#DFC8E7]/60 mb-2">
                      {d.tag}
                    </p>
                    <p className="text-[15px] font-semibold text-[#2E1A47] dark:text-[#DFC8E7] leading-snug mb-2">
                      {d.title}
                    </p>
                    <p className="text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 leading-relaxed mb-4">
                      {d.excerpt}
                    </p>
                    <div className={`flex items-center gap-2 text-[11px] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 ${ar ? "flex-row-reverse" : ""}`}>
                      <span>{ar ? "د. ديانا بورجيو" : "Dr. Diana Borgio"}</span>
                      <span className="opacity-40">·</span>
                      <span>{ar ? `${article.readMins} دقائق قراءة` : `${article.readMins} min read`}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
