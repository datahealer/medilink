"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { HomeNav } from "@/components/home/HomeNav";
import { HomeFooter } from "@/components/home/HomeFooter";
import {
  buildMailtoUrl,
  canComposeMessage,
  supportChannels,
  type SupportChannel,
} from "@/lib/supportContact";

/**
 * Labels only. This replaced a `CONTACT_OPTIONS` array that carried the ADDRESSES themselves —
 * `hello@medilink.om` and `+968 9000 0000` (used for both the phone and the WhatsApp link) —
 * none of which reach anyone. Contact details now come from configuration via
 * `supportChannels()`, and an unconfigured channel simply does not render. See
 * lib/supportContact.ts for why absence is the safe default here.
 */
const CHANNEL_META: Record<SupportChannel["kind"], { icon: string; en: string; ar: string }> = {
  email:    { icon: "✉️", en: "Email us",  ar: "راسلنا"   },
  phone:    { icon: "📞", en: "Call us",   ar: "اتصل بنا" },
  whatsapp: { icon: "💬", en: "WhatsApp",  ar: "واتساب"   },
};

const TOPICS = {
  en: ["General question", "I'm a patient", "I'm a clinic", "Partnership", "Press", "Other"],
  ar: ["سؤال عام", "أنا مريض", "أنا عيادة", "شراكة", "إعلام", "أخرى"],
};

export default function ContactPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  const [form, setForm] = useState({ name: "", email: "", topic: "", message: "" });
  const [opened, setOpened] = useState(false);

  const channels = supportChannels();
  const canCompose = canComposeMessage();

  /**
   * Hand the message to the visitor's own mail client.
   *
   * This used to be `setSent(true)` and nothing else — the form claimed "Message sent!" and
   * promised a reply within one business day while sending nothing anywhere. There is no contact
   * backend in this project (no route, no table, no support-inbox variable), so rather than
   * invent one, the draft opens in the visitor's mail client. They press send, so delivery is
   * their action and their sent-items record; this app never asserts it.
   */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = buildMailtoUrl(form);
    if (!url) return; // No support address configured — the form is not rendered at all.
    window.location.href = url;
    setOpened(true);
  }

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">
      <HomeNav />

      {/* ── Hero ── */}
      <section className="pt-36 pb-16 bg-[#faf8fc] dark:bg-[#0a0518]" dir={ar ? "rtl" : "ltr"}>
        <div className="max-w-6xl mx-auto px-6">
          <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold  tracking-widest mb-6"
            style={{ background: "#DFC8E7", color: "#2E1A47" }}>
            {ar ? "اتصل بنا" : "Contact"}
          </span>
          <h1 className="font-black font-serif text-[#2E1A47] dark:text-white mb-4"
            style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", lineHeight: 1.06 }}>
            {ar
              ? <>نحن هنا<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">للمساعدة.</em></>
              : <>We're here<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">to help.</em></>}
          </h1>
          <p className="text-base text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 max-w-md leading-relaxed">
            {ar
              ? "سواء كنت مريضاً أو عيادة أو شريكاً محتملاً — نسعد بسماعك."
              : "Whether you're a patient, a clinic, or a potential partner — we'd love to hear from you."}
          </p>
        </div>
      </section>

      {/* ── Contact options + form ── */}
      <section className="py-16 bg-white dark:bg-[#0d0820]" dir={ar ? "rtl" : "ltr"}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">

            {/* Left — contact options */}
            <div className="lg:col-span-2 flex flex-col gap-5">
              <h2 className="font-bold font-serif text-[#2E1A47] dark:text-white mb-2"
                style={{ fontSize: "clamp(1.2rem, 2vw, 1.5rem)" }}>
                {ar ? "تواصل معنا مباشرة" : "Reach us directly"}
              </h2>
              {channels.length === 0 && (
                <div className="p-5 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#1a1030]">
                  <p className="text-sm text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 leading-relaxed">
                    {ar
                      ? "لم يتم نشر قنوات الاتصال بعد. يمكنك التواصل مع عيادتك مباشرةً في الوقت الحالي."
                      : "Our contact channels aren't published yet. For anything urgent, please contact your clinic directly."}
                  </p>
                </div>
              )}
              {channels.map((c) => {
                const meta = CHANNEL_META[c.kind];
                return (
                  <a key={c.kind} href={c.href}
                    className="flex items-center gap-4 p-5 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#1a1030] hover:-translate-y-0.5 hover:shadow-md transition-all no-underline group">
                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#241540] border border-[#e7dcee] dark:border-[#3a2560] flex items-center justify-center text-lg flex-shrink-0 shadow-sm">
                      {meta.icon}
                    </div>
                    <div>
                      <p className="text-xs font-bold  tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-0.5">
                        {ar ? meta.ar : meta.en}
                      </p>
                      {/* The value comes from configuration, never from a hardcoded literal. */}
                      <p className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] group-hover:text-[#46255f] dark:group-hover:text-white transition-colors">
                        {c.detail}
                      </p>
                    </div>
                  </a>
                );
              })}

              {/* Office */}
              <div className="p-5 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#1a1030]">
                <p className="text-xs font-bold  tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-2">
                  {ar ? "المكتب" : "Office"}
                </p>
                <p className="text-sm text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 leading-relaxed">
                  {ar
                    ? "مسقط، سلطنة عُمان\nالساعات: الأحد – الخميس 8 ص – 5 م"
                    : "Muscat, Sultanate of Oman\nSun – Thu, 8 am – 5 pm"}
                </p>
              </div>
            </div>

            {/* Right — contact form */}
            <div className="lg:col-span-3">
              {!canCompose ? (
                /* No support address configured. Deliberately does NOT render a form: a form
                   that cannot do anything is exactly what produced the fake "Message sent!".
                   Say plainly that the channel is not open, and point somewhere real. */
                <div className="flex flex-col items-center justify-center h-full min-h-[360px] gap-5 text-center p-10 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#1a1030]">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                    style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7)" }}>✉️</div>
                  <h3 className="font-bold font-serif text-xl text-[#2E1A47] dark:text-white">
                    {ar ? "المراسلة غير متاحة بعد" : "Messaging isn't available yet"}
                  </h3>
                  <p className="text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 max-w-xs">
                    {ar
                      ? "لم نفتح قناة المراسلة بعد. لأي أمر عاجل يتعلق برعايتك، تواصل مع عيادتك مباشرةً."
                      : "We haven't opened a messaging channel yet. For anything urgent about your care, please contact your clinic directly."}
                  </p>
                </div>
              ) : opened ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[360px] gap-5 text-center p-10 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#1a1030]">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                    style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7)" }}>✉️</div>
                  <h3 className="font-bold font-serif text-xl text-[#2E1A47] dark:text-white">
                    {ar ? "تم فتح تطبيق البريد" : "Your email app is opening"}
                  </h3>
                  <p className="text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 max-w-xs">
                    {/* Truthful: the draft is prepared, the visitor sends it. No delivery claim
                        and no response-time promise this product cannot keep. */}
                    {ar
                      ? "أعدّنا رسالتك في تطبيق البريد لديك — اضغط إرسال هناك لإتمامها. إن لم يفتح تلقائياً، استخدم عنوان البريد المذكور بالأعلى."
                      : "We've prepared your message in your email app — press send there to complete it. If nothing opened, use the email address listed above."}
                  </p>
                  <button
                    onClick={() => setOpened(false)}
                    className="text-sm font-semibold text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors">
                    {ar ? "الرجوع إلى الرسالة" : "Back to the message"}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}
                  className="p-8 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#1a1030] flex flex-col gap-5">
                  <h2 className="font-bold font-serif text-[#2E1A47] dark:text-white text-xl mb-1">
                    {ar ? "أرسل لنا رسالة" : "Send us a message"}
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-[#2E1A47]/50 dark:text-[#DFC8E7]/50  tracking-widest">
                        {ar ? "الاسم" : "Name"}
                      </label>
                      <input
                        type="text" required
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder={ar ? "اسمك" : "Your name"}
                        className="px-4 py-3 rounded-xl border border-[#e7dcee] dark:border-[#3a2560] bg-white dark:bg-[#0d0820] text-sm text-[#2E1A47] dark:text-[#DFC8E7] placeholder:text-[#2E1A47]/25 dark:placeholder:text-[#DFC8E7]/25 focus:outline-none focus:ring-2 focus:ring-[#DFC8E7]/50 transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-[#2E1A47]/50 dark:text-[#DFC8E7]/50  tracking-widest">
                        {ar ? "البريد الإلكتروني" : "Email"}
                      </label>
                      <input
                        type="email" required
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder={ar ? "بريدك الإلكتروني" : "you@example.com"}
                        className="px-4 py-3 rounded-xl border border-[#e7dcee] dark:border-[#3a2560] bg-white dark:bg-[#0d0820] text-sm text-[#2E1A47] dark:text-[#DFC8E7] placeholder:text-[#2E1A47]/25 dark:placeholder:text-[#DFC8E7]/25 focus:outline-none focus:ring-2 focus:ring-[#DFC8E7]/50 transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[#2E1A47]/50 dark:text-[#DFC8E7]/50  tracking-widest">
                      {ar ? "الموضوع" : "Topic"}
                    </label>
                    <select
                      required
                      value={form.topic}
                      onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                      className="px-4 py-3 rounded-xl border border-[#e7dcee] dark:border-[#3a2560] bg-white dark:bg-[#0d0820] text-sm text-[#2E1A47] dark:text-[#DFC8E7] focus:outline-none focus:ring-2 focus:ring-[#DFC8E7]/50 transition-all appearance-none">
                      <option value="" disabled>{ar ? "اختر موضوعاً" : "Choose a topic"}</option>
                      {(ar ? TOPICS.ar : TOPICS.en).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[#2E1A47]/50 dark:text-[#DFC8E7]/50  tracking-widest">
                      {ar ? "الرسالة" : "Message"}
                    </label>
                    <textarea
                      required rows={5}
                      value={form.message}
                      onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                      placeholder={ar ? "اكتب رسالتك هنا…" : "Tell us what's on your mind…"}
                      className="px-4 py-3 rounded-xl border border-[#e7dcee] dark:border-[#3a2560] bg-white dark:bg-[#0d0820] text-sm text-[#2E1A47] dark:text-[#DFC8E7] placeholder:text-[#2E1A47]/25 dark:placeholder:text-[#DFC8E7]/25 focus:outline-none focus:ring-2 focus:ring-[#DFC8E7]/50 resize-none transition-all"
                    />
                  </div>

                  <button type="submit"
                    className="self-start inline-flex items-center justify-center font-bold text-sm text-[#2E1A47] hover:opacity-90 active:scale-[0.97] transition-all tracking-widest  px-10 py-4 cursor-pointer border-0"
                    style={{ backgroundImage: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)", transform: "skewX(-12deg)", borderRadius: "10px", boxShadow: "0 10px 32px rgba(223,200,231,0.45)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", transform: "skewX(12deg)" }}>
                      {ar ? "الفتح في تطبيق البريد ←" : "Open in email app →"}
                    </span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <HomeFooter />
    </div>
  );
}
