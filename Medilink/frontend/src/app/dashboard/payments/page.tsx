"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { backendFetch, backendJson } from "@/lib/backendFetch";

type Status = "paid" | "pending" | "refunded" | "failed";

type Payment = {
  id: string;
  invoiceNumber: string;
  date: string;
  status: Status;
  category: string;
  emoji: string;
  grad: string;
  method: { en: string; ar: string };
  amount: number;
  currency: string;
  /** Backend-generated invoice URL, when available (else client PDF fallback). */
  invoiceUrl: string | null;
  en: { title: string; provider: string; description: string };
  ar: { title: string; provider: string; description: string };
};

// ── Backend mapping (replaces the mock PAYMENTS[]) ──────────────────────────
// Rows come from GET {BACKEND_URL}/api/payments (patient's own payments).
// The endpoint returns fewer fields than Vartika's mock; missing fields fall back
// to safe placeholders so the UI stays identical. Missing backend fields:
//   category, emoji, payment method, invoice title/provider/description.
type BackendPayment = {
  id: string;
  amount: number | string | null;
  currency: string | null;
  status: string;
  created_at: string;
  invoice_url: string | null;
  profiles?: { full_name?: string | null; email?: string | null } | null;
  appointment?: {
    for_family_member_id?: string | null;
    family_member?: { full_name?: string | null; relation?: string | null } | null;
  } | null;
};

const GRADS = [
  "from-[#e8d5f0] to-[#d5e8f5]", "from-[#d5e8f5] to-[#ede0f8]", "from-[#e8d5f0] to-[#fde68a]",
  "from-[#d1fae5] to-[#e8d5f0]", "from-[#d5e8f5] to-[#d1fae5]", "from-[#fde68a] to-[#d5e8f5]",
];

// Backend statuses (unpaid|pending|paid|failed|refunded|partial_refund) → UI buckets.
function mapStatus(s: string): Status {
  if (s === "paid") return "paid";
  if (s === "refunded" || s === "partial_refund") return "refunded";
  if (s === "failed") return "failed";
  return "pending";
}

function toPayment(row: BackendPayment, i: number): Payment {
  const amt = typeof row.amount === "string" ? parseFloat(row.amount) : row.amount ?? 0;
  const currency = row.currency ?? "OMR";
  const d = new Date(row.created_at);
  const date = Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const invoiceNumber = `INV-${(row.id ?? "").slice(0, 8).toUpperCase()}`;
  const fam = row.appointment?.family_member?.full_name ?? "";
  return {
    id: row.id,
    invoiceNumber,
    date,
    status: mapStatus(row.status),
    category: "Payment",
    emoji: "💳",
    grad: GRADS[i % GRADS.length]!,
    method: { en: "—", ar: "—" },
    amount: Number.isFinite(amt) ? amt : 0,
    currency,
    invoiceUrl: row.invoice_url ?? null,
    en: { title: fam ? `Medical Payment · ${fam}` : "Medical Payment", provider: "MediLink", description: `Invoice ${invoiceNumber}` },
    ar: { title: fam ? `دفعة طبية · ${fam}` : "دفعة طبية", provider: "ميدلينك", description: `فاتورة ${invoiceNumber}` },
  };
}

const STATUS_META: Record<Status, { en: string; ar: string; text: string; bg: string }> = {
  paid:     { en: "Paid",     ar: "مدفوع",   text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" },
  pending:  { en: "Pending",  ar: "معلق",     text: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" },
  refunded: { en: "Refunded", ar: "مسترد",   text: "text-sky-600 dark:text-sky-400",         bg: "bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800" },
  failed:   { en: "Failed",   ar: "فشل",     text: "text-rose-600 dark:text-rose-400",       bg: "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800" },
};

const TABS = [
  { key: "all",     en: "All",     ar: "الكل" },
  { key: "current", en: "Current", ar: "الحالية" },
  { key: "past",    en: "Past",    ar: "السابقة" },
];

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(3)}`;
}

function IconEye() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function IconPrinter() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
  );
}

/**
 * The bespoke MediLink invoice template that used to live here has been REMOVED.
 *
 * It was a second invoice representation: Preview and Print rendered it, while Download
 * served the pdf-lib PDF built by supabase/functions/generate-invoice. The two disagreed on
 * the header, the invoice number (this template fabricated `INV-<id[0:8]>` instead of using
 * payments.invoice_number), the payment method (hardcoded "\u2014"), and on money \u2014 it showed no
 * subtotal or tax at all. It could not have matched: GET /api/payments does not return
 * invoice_number, appointment_id, facility, doctor or method, so the data was not there to
 * render.
 *
 * The generated PDF is now the single representation. Preview embeds that exact file, so
 * Preview, Download and Print are the same artefact by construction rather than by
 * agreement between two templates.
 */

function InvoiceModal({ payment, ar, pdfUrl, loading, error, onClose, onDownload, onPrint, downloading }: {
  payment: Payment; ar: boolean; pdfUrl: string | null; loading: boolean; error: string | null;
  onClose: () => void; onDownload: () => void; onPrint: () => void; downloading: boolean;
}) {
  const ready = !loading && !error && !!pdfUrl;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a1030] rounded-2xl max-w-2xl w-full border border-[#e7dcee] dark:border-[#3a2560] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-3.5 border-b border-[#e7dcee] dark:border-[#2a1840] flex-shrink-0 ${ar ? "flex-row-reverse" : ""}`}>
          <p className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7]">{ar ? "معاينة الفاتورة" : "Invoice Preview"}</p>
          <button onClick={onClose} className="text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/*
          The preview IS the generated PDF, loaded from the same short-lived signed URL that
          Download and Print use. Embedding the artefact rather than re-drawing it is what makes
          the three actions consistent by construction.
        */}
        <div className="overflow-auto flex items-center justify-center" style={{ background: "#f3edf7", minHeight: 420 }}>
          {loading && (
            <p className="text-sm text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 py-16">
              {ar ? "جارٍ تحميل الفاتورة..." : "Loading invoice..."}
            </p>
          )}
          {!loading && error && (
            <p className="text-sm text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 py-16 px-6 text-center">{error}</p>
          )}
          {ready && (
            <iframe
              src={pdfUrl!}
              title={ar ? "معاينة الفاتورة" : "Invoice preview"}
              className="w-full"
              style={{ height: "60vh", border: "none", background: "#ffffff" }}
            />
          )}
        </div>

        <div className={`flex gap-2 px-5 py-4 border-t border-[#e7dcee] dark:border-[#2a1840] flex-shrink-0 ${ar ? "flex-row-reverse" : ""}`}>
          <button onClick={onDownload}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:border-[#2E1A47]/30 hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
            disabled={downloading || !ready}>
            {downloading ? <IconCheck /> : <IconDownload />}
            {downloading ? (ar ? "تم التحميل!" : "Downloaded!") : (ar ? "تحميل PDF" : "Download PDF")}
          </button>
          <button onClick={onPrint} disabled={!ready}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:border-[#2E1A47]/30 hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60">
            <IconPrinter />
            {ar ? "طباعة" : "Print"}
          </button>
        </div>
      </div>
    </div>
  );
}


export default function PaymentsPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [activeTab, setActiveTab] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modalPayment, setModalPayment] = useState<Payment | null>(null);
  const [pendingAction, setPendingAction] = useState<"download" | "print" | null>(null);
  const [downloadedId, setDownloadedId] = useState<string | null>(null);
  // The signed URL of the generated PDF for the open invoice. One fetch feeds the preview,
  // the download and the print, so all three necessarily show the same document.
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  // Load the patient's real payments from the backend (replaces the mock array).
  const [payments, setPayments] = useState<Payment[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Session attached — cookies alone 401 against the separate backend origin, which
        // silently rendered an empty payment history. See lib/backendFetch.ts.
        const res = await backendFetch("/api/payments");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = (await res.json()) as BackendPayment[];
        if (active) setPayments((Array.isArray(rows) ? rows : []).map(toPayment));
      } catch {
        if (active) setPayments([]);
      }
    })();
    return () => { active = false; };
  }, []);

  /**
   * Ask the backend for a short-lived signed URL to this payment's stored invoice PDF.
   *
   * The URL cannot be used directly from an <iframe src> without this hop: the object lives in
   * the private `invoices` bucket, and window/iframe requests cannot carry an Authorization
   * header, so hitting the route itself would 401 across the separate backend origin.
   * ?format=json returns the signed URL with the session attached; the signed URL then needs no
   * credentials of its own.
   *
   * If no invoice exists yet, the existing authenticated regenerate route is asked to produce
   * one. That replaces the old client-side html2canvas+jsPDF fallback, which was a second PDF
   * generator producing a different document from the authoritative one.
   */
  async function loadInvoiceUrl(payment: Payment): Promise<string | null> {
    setInvoiceLoading(true);
    setInvoiceError(null);
    setInvoiceUrl(null);
    try {
      const ask = async () => {
        const { res, data } = await backendJson<{ url?: string }>(
          `/api/payments/${payment.id}/invoice?format=json`
        );
        return res.ok && typeof data?.url === "string" ? data.url : null;
      };

      let url = await ask();

      if (!url) {
        // No stored invoice yet — have the backend generate it, then ask once more.
        const gen = await backendFetch(`/api/payments/${payment.id}/invoice/regenerate`, { method: "POST" });
        if (gen.ok) url = await ask();
      }

      if (!url) {
        setInvoiceError(ar ? "الفاتورة غير متاحة بعد. يرجى المحاولة لاحقًا." : "This invoice is not available yet. Please try again shortly.");
        return null;
      }
      setInvoiceUrl(url);
      return url;
    } catch {
      setInvoiceError(ar ? "تعذر تحميل الفاتورة." : "Could not load the invoice.");
      return null;
    } finally {
      setInvoiceLoading(false);
    }
  }

  function openInvoice(payment: Payment, action?: "download" | "print") {
    setModalPayment(payment);
    setPendingAction(action ?? null);
    void loadInvoiceUrl(payment);
  }

  function closeInvoice() {
    setModalPayment(null);
    setInvoiceUrl(null);
    setInvoiceError(null);
  }

  function handleDownload() {
    if (!modalPayment || !invoiceUrl) return;
    // Same signed URL the preview is showing, so the file that arrives is the file that was
    // previewed. No client-side generation.
    window.open(invoiceUrl, "_blank", "noopener,noreferrer");
    setDownloadedId(modalPayment.id);
    setTimeout(() => setDownloadedId(null), 2000);
  }

  function handlePrint() {
    if (!invoiceUrl) return;
    /**
     * Print the PDF itself, not an HTML lookalike.
     *
     * window.print() is deliberately NOT used any more: it printed a hidden DOM node rendered
     * from the removed MediLink template, which is exactly why Print matched Preview but not the
     * downloaded file.
     *
     * The signed URL is on Supabase's origin, so iframe.contentWindow.print() is blocked by the
     * same-origin policy. Opening the PDF in a tab hands it to the browser's own PDF viewer,
     * whose print control prints this exact document. Attempted programmatically first for the
     * same-origin case, with the tab as the fallback.
     */
    const w = window.open(invoiceUrl, "_blank", "noopener,noreferrer");
    if (!w) return;
    try {
      w.addEventListener("load", () => { try { w.print(); } catch { /* cross-origin: user prints from the viewer */ } });
    } catch {
      /* nothing further to do — the document is open and printable */
    }
  }

  useEffect(() => {
    if (!modalPayment || !pendingAction) return;
    // Wait for the signed URL before acting, otherwise a deep-linked download/print would fire
    // against a null URL.
    if (invoiceLoading) return;
    const action = pendingAction;
    if (action === "download") handleDownload();
    else if (action === "print") handlePrint();
    setPendingAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalPayment, pendingAction, invoiceLoading, invoiceUrl]);


  const filtered = payments.filter(p => {
    if (activeTab === "current") return p.status === "pending";
    if (activeTab === "past") return p.status !== "pending";
    return true;
  });

  const totalPaid = payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const totalPending = payments.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">
      {/*
        The @media print block and the hidden #invoice-print-root mirror that used to sit here
        are gone. They printed a DOM copy of the removed MediLink template, which is precisely
        why Print matched Preview but not the downloaded PDF. Printing now goes through the
        generated PDF itself \u2014 see handlePrint.
      */}

      {/* Hero */}
      <section className="py-10 px-4" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-xs font-bold  tracking-widest mb-2" style={{ color: "rgba(223,200,231,0.45)" }}>
            {ar ? "المدفوعات" : "My Payments"}
          </p>
          <h1 className="font-black font-serif text-white mb-6" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", lineHeight: 1.1 }}>
            {ar
              ? <><span className="block">مدفوعاتك</span><span className="block italic text-[#DFC8E7]">الحالية والسابقة.</span></>
              : <><span className="block">Your current and past</span><span className="block italic text-[#DFC8E7]">payments.</span></>}
          </h1>
          <div className={`flex flex-wrap gap-3 ${ar ? "flex-row-reverse" : ""}`}>
            <div className="bg-white/10 border border-white/10 rounded-2xl px-5 py-3 min-w-[140px]">
              <p className="text-[11px] font-bold  tracking-wide text-[#DFC8E7]/60">{ar ? "إجمالي المدفوع" : "Total Paid"}</p>
              <p className="text-lg font-black text-white mt-1">{fmt(totalPaid, "OMR")}</p>
            </div>
            <div className="bg-white/10 border border-white/10 rounded-2xl px-5 py-3 min-w-[140px]">
              <p className="text-[11px] font-bold  tracking-wide text-[#DFC8E7]/60">{ar ? "معلق" : "Pending"}</p>
              <p className="text-lg font-black text-amber-300 mt-1">{fmt(totalPending, "OMR")}</p>
            </div>
            <div className="bg-white/10 border border-white/10 rounded-2xl px-5 py-3 min-w-[140px]">
              <p className="text-[11px] font-bold  tracking-wide text-[#DFC8E7]/60">{ar ? "المعاملات" : "Transactions"}</p>
              <p className="text-lg font-black text-white mt-1">{payments.length}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="bg-white dark:bg-[#0d0820] border-b border-[#e7dcee] dark:border-[#2a1840] px-4 py-3">
        <div className="max-w-6xl mx-auto flex gap-2">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap border transition-all ${activeTab === t.key ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030] border-transparent" : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:border-[#2E1A47]/30"}`}>
              {ar ? t.ar : t.en}
            </button>
          ))}
        </div>
      </section>

      {/* List */}
      <section className="py-8 px-4">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-xs font-bold  tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-5">
            {ar ? `${filtered.length} معاملة` : `${filtered.length} transaction${filtered.length !== 1 ? "s" : ""}`}
          </p>

          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">💳</p>
              <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-2">{ar ? "لا توجد مدفوعات" : "No payments found"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(p => {
                const info = ar ? p.ar : p.en;
                const meta = STATUS_META[p.status];
                const isOpen = expanded === p.id;
                return (
                  <div key={p.id} className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] overflow-hidden hover:shadow-md transition-all">
                    <button className={`w-full flex items-center gap-4 p-5 ${ar ? "flex-row-reverse" : ""}`} onClick={() => setExpanded(isOpen ? null : p.id)}>
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 bg-gradient-to-br ${p.grad}`}>{p.emoji}</div>
                      <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
                        <p className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7] truncate">{info.title}</p>
                        <p className="text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 mt-0.5">{info.provider} · {p.invoiceNumber}</p>
                      </div>
                      <div className={`hidden sm:flex flex-col flex-shrink-0 ${ar ? "items-start" : "items-end"}`}>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${meta.bg} ${meta.text}`}>{ar ? meta.ar : meta.en}</span>
                        <p className="text-xs font-bold text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 mt-1.5">{fmt(p.amount, p.currency)}</p>
                      </div>
                      <svg className={`w-4 h-4 text-[#2E1A47]/25 dark:text-[#DFC8E7]/25 flex-shrink-0 transition-transform ${isOpen ? "rotate-90" : ""} ${ar ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    {isOpen && (
                      <div className={`border-t border-[#e7dcee] dark:border-[#2a1840] px-5 pb-5 pt-4 ${ar ? "text-right" : ""}`}>
                        <div className={`flex items-center justify-between mb-3 sm:hidden ${ar ? "flex-row-reverse" : ""}`}>
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${meta.bg} ${meta.text}`}>{ar ? meta.ar : meta.en}</span>
                          <p className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7]">{fmt(p.amount, p.currency)}</p>
                        </div>
                        <p className="text-sm text-[#2E1A47]/65 dark:text-[#DFC8E7]/65 leading-relaxed mb-1">{info.description}</p>
                        <p className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 mb-4">{p.date} · {ar ? p.method.ar : p.method.en}</p>
                        <div className={`flex flex-wrap gap-2 ${ar ? "flex-row-reverse" : ""}`}>
                          <button onClick={() => openInvoice(p)}
                            className="px-4 py-2 rounded-xl text-sm font-bold border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:border-[#2E1A47]/30 hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20 transition-all flex items-center gap-1.5">
                            <IconEye />{ar ? "معاينة" : "Preview"}
                          </button>
                          <button onClick={() => openInvoice(p, "download")}
                            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all flex items-center gap-1.5 ${downloadedId === p.id ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400" : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:border-[#2E1A47]/30 hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20"}`}>
                            {downloadedId === p.id ? <IconCheck /> : <IconDownload />}
                            {downloadedId === p.id ? (ar ? "تم التحميل!" : "Downloaded!") : (ar ? "تحميل" : "Download")}
                          </button>
                          <button onClick={() => openInvoice(p, "print")}
                            className="px-4 py-2 rounded-xl text-sm font-bold border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:border-[#2E1A47]/30 hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20 transition-all flex items-center gap-1.5">
                            <IconPrinter />{ar ? "طباعة" : "Print"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {modalPayment && (
        <InvoiceModal
          payment={modalPayment}
          ar={ar}
          pdfUrl={invoiceUrl}
          loading={invoiceLoading}
          error={invoiceError}
          onClose={closeInvoice}
          onDownload={handleDownload}
          onPrint={handlePrint}
          downloading={downloadedId === modalPayment.id}
        />
      )}
    </div>
  );
}
