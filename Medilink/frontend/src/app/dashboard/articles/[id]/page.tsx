"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { ARTICLES, getArticle } from "@/lib/data/articles";

export default function ArticlePage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const params = useParams();
  const id = (params.id as string) ?? "";

  const article = getArticle(id);

  if (!article) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f4fa] dark:bg-[#0f0a1e]">
        <div className="text-center">
          <p className="text-5xl mb-4">🔍</p>
          <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-4 text-lg">
            {ar ? "المقال غير موجود" : "Article not found"}
          </p>
          <Link href="/dashboard/articles" className="text-sm font-bold text-[#46255f] dark:text-[#DFC8E7] hover:underline">
            {ar ? "→ العودة إلى المكتبة الصحية" : "← Back to Health Library"}
          </Link>
        </div>
      </div>
    );
  }

  const d = ar ? article.ar : article.en;
  const related = ARTICLES.filter(a => a.id !== article.id && a.en.tag === article.en.tag).slice(0, 2);
  const others = related.length > 0 ? related : ARTICLES.filter(a => a.id !== article.id).slice(0, 2);

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7] pb-16">

      {/* Back bar */}
      <div className="bg-white dark:bg-[#0d0820] border-b border-[#e7dcee] dark:border-[#2a1840] px-6 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto">
          <Link href="/dashboard/articles"
            className={`inline-flex items-center gap-1.5 text-sm font-semibold text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors no-underline ${ar ? "flex-row-reverse" : ""}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points={ar ? "9 18 15 12 9 6" : "15 18 9 12 15 6"}/>
            </svg>
            {ar ? "المكتبة الصحية" : "Health Library"}
          </Link>
        </div>
      </div>

      {/* Hero banner */}
      <section className="h-56 flex items-center justify-center text-7xl relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${article.from}, ${article.to})` }}>
        <div className="absolute top-[-20px] right-[-20px] w-40 h-40 rounded-full opacity-25 bg-white" />
        <div className="absolute bottom-[-30px] left-[-10px] w-32 h-32 rounded-full opacity-20 bg-white" />
        <span className="relative z-10 drop-shadow-sm">{article.emoji}</span>
      </section>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <p className="text-[10px] font-black  tracking-widest text-[#46255f] dark:text-[#DFC8E7]/70 mb-3">
          {d.tag}
        </p>
        <h1 className={`font-black font-serif text-[#2E1A47] dark:text-white leading-tight mb-4 ${ar ? "text-right" : ""}`}
          style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)" }}>
          {d.title}
        </h1>
        <div className={`flex items-center gap-2 text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 mb-8 pb-8 border-b border-[#e7dcee] dark:border-[#2a1840] ${ar ? "flex-row-reverse justify-end" : ""}`}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-[#2E1A47] flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
            DB
          </div>
          <span className="font-semibold text-[#2E1A47]/70 dark:text-[#DFC8E7]/70">{ar ? "د. ديانا بورجيو" : "Dr. Diana Borgio"}</span>
          <span className="opacity-40">·</span>
          <span>{ar ? `${article.readMins} دقائق قراءة` : `${article.readMins} min read`}</span>
        </div>

        {/* Body */}
        <div className={`space-y-4 ${ar ? "text-right" : ""}`}>
          {d.body.map((para, i) => (
            <p key={i} className="text-sm leading-relaxed text-[#2E1A47]/75 dark:text-[#DFC8E7]/75">
              {para}
            </p>
          ))}
        </div>

        <p className={`text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 leading-relaxed mt-8 pt-6 border-t border-[#e7dcee] dark:border-[#2a1840] ${ar ? "text-right" : ""}`}>
          {ar
            ? "هذا المقال لأغراض تثقيفية عامة ولا يغني عن استشارة طبيب مختص."
            : "This article is for general educational purposes and does not replace advice from a qualified doctor."}
        </p>

        {/* Related articles */}
        {others.length > 0 && (
          <div className="mt-10">
            <p className={`text-[11px] font-black  tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 mb-4 ${ar ? "text-right" : ""}`}>
              {ar ? "مقالات ذات صلة" : "Related articles"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {others.map(o => {
                const od = ar ? o.ar : o.en;
                return (
                  <Link key={o.id} href={`/dashboard/articles/${o.id}`}
                    className="rounded-2xl overflow-hidden border border-[#e7dcee] dark:border-[#3a2560] bg-white dark:bg-[#1a1030] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 no-underline block">
                    <div className="h-24" style={{ background: `linear-gradient(135deg, ${o.from}, ${o.to})` }} />
                    <div className={`p-4 ${ar ? "text-right" : ""}`}>
                      <p className="text-[9px] font-bold  tracking-widest text-[#46255f] dark:text-[#DFC8E7]/60 mb-1.5">{od.tag}</p>
                      <p className="text-[13px] font-semibold text-[#2E1A47] dark:text-[#DFC8E7] leading-snug">{od.title}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
