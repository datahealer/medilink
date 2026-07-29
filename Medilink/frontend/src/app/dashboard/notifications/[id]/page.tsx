"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

/* ── Loose shapes for embedded relations (cast to avoid deep generic friction) ── */
type ApptLite = {
  reference_number?: string | null;
  status?: string | null;
  slot_date?: string | null;
  slot_start?: string | null;
  created_at?: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  previous_slot_date?: string | null;
  previous_slot_start?: string | null;
  doctor?: { full_name?: string | null; specialty?: string | null } | null;
  facility?: { name?: string | null } | null;
};
type PaymentLite = {
  id?: string;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  payment_method?: string | null;
  gateway?: string | null;
  gateway_ref?: string | null;
  invoice_url?: string | null;
  created_at?: string | null;
};
type LabLite = {
  test_name?: string | null;
  facility_name?: string | null;
  result_date?: string | null;
  uploaded_at?: string | null;
  status?: string | null;
};

type Kind = "appointment" | "lab" | "waitlist" | "general";

function fmtDate(iso: string | null | undefined, ar: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(ar ? "ar" : "en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":");
  let hr = parseInt(h ?? "0", 10);
  const ap = hr >= 12 ? "PM" : "AM";
  hr = hr % 12; if (hr === 0) hr = 12;
  return `${hr}:${m ?? "00"} ${ap}`;
}
function fmtDateTime(iso: string | null | undefined, ar: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(ar ? "ar" : "en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NotificationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { locale } = useI18n();
  const ar = locale === "ar";
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("general");
  const [appt, setAppt] = useState<ApptLite | null>(null);
  const [payment, setPayment] = useState<PaymentLite | null>(null);
  const [lab, setLab] = useState<LabLite | null>(null);
  const [offeredSlot, setOfferedSlot] = useState<string | null>(null);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [rebooking, setRebooking] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const notif = await api.notifications.getNotification(supabase, id);
        if (!active) return;
        if (!notif) { setNotFound(true); return; }

        // Auto mark-as-read on open (non-fatal). Notify other views (bell + list) so
        // their unread state stays in sync across client-side navigation.
        if (!notif.is_read) {
          api.notifications
            .markRead(supabase, id)
            .then(() => {
              if (typeof window !== "undefined") window.dispatchEvent(new Event("medilink:notifications-changed"));
            })
            .catch(() => {});
        }

        setTitle(notif.title ?? "");
        setBody(notif.body ?? "");
        setCreatedAt(notif.created_at ?? null);

        const d = (notif.data ?? {}) as Record<string, unknown>;
        const aId = typeof d.appointment_id === "string" ? d.appointment_id : null;
        const labId = typeof d.lab_result_id === "string" ? d.lab_result_id : null;
        const wId = typeof d.waitlist_id === "string" ? d.waitlist_id : null;
        const slot = typeof d.offered_slot === "string" ? d.offered_slot : null;

        if (aId) {
          setKind("appointment");
          setAppointmentId(aId);
          const [a, p, u] = await Promise.all([
            api.appointments.getAppointment(supabase, aId).catch(() => null),
            api.payments.getPaymentByAppointment(supabase, aId).catch(() => null),
            supabase.auth.getUser().then((r) => r.data.user?.id ?? null).catch(() => null),
          ]);
          if (!active) return;
          setAppt((a as unknown as ApptLite) ?? null);
          setPayment((p as unknown as PaymentLite) ?? null);
          setMyUid(u);
        } else if (labId) {
          setKind("lab");
          const l = await api.labs.getLabResult(supabase, labId).catch(() => null);
          if (!active) return;
          setLab((l as unknown as LabLite) ?? null);
        } else if (wId) {
          setKind("waitlist");
          setOfferedSlot(slot);
        } else {
          setKind("general");
        }
        setError("");
      } catch {
        if (active) setError(ar ? "تعذر تحميل الإشعار." : "Could not load this notification.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id, supabase, ar]);

  const isCancelled = (appt?.status ?? "").toLowerCase() === "cancelled";
  const isRescheduled = Boolean(appt?.previous_slot_date);
  const invoiceUrl = payment?.invoice_url ?? null;

  async function bookAgain() {
    if (!appointmentId || rebooking) return;
    setRebooking(true);
    try {
      await api.appointments.rebookAppointment(supabase, appointmentId);
      router.push("/dashboard/appointments");
    } catch {
      setError(ar ? "تعذر إعادة الحجز. حاول مرة أخرى." : "Could not rebook. Please try again.");
      setRebooking(false);
    }
  }

  /* ── Presentational helpers (match the notifications page palette) ── */
  function Row({ label, value }: { label: string; value: React.ReactNode }) {
    if (value === null || value === undefined || value === "" || value === "—") return null;
    return (
      <div className={`flex items-start justify-between gap-4 py-2.5 border-b border-[#e7dcee] dark:border-[#2a1840] last:border-0 ${ar ? "flex-row-reverse" : ""}`}>
        <span className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">{label}</span>
        <span className={`text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] ${ar ? "text-left" : "text-right"}`}>{value}</span>
      </div>
    );
  }
  function Card({ children }: { children: React.ReactNode }) {
    return (
      <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-5 sm:p-6 shadow-sm">
        {children}
      </div>
    );
  }
  const btnPrimary = "px-5 py-2.5 rounded-xl font-bold text-sm text-[#2E1A47] transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50";
  const btnPrimaryStyle = { background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" };
  const btnGhost = "px-5 py-2.5 rounded-xl font-bold text-sm border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:border-[#2E1A47]/30 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-all";

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7] pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden py-10 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="relative max-w-2xl mx-auto">
          <Link href="/dashboard/notifications"
            className={`inline-flex items-center gap-1.5 text-xs font-semibold no-underline mb-5 transition-colors hover:opacity-80 ${ar ? "flex-row-reverse" : ""}`}
            style={{ color: "rgba(223,200,231,0.55)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points={ar ? "9 18 15 12 9 6" : "15 18 9 12 15 6"} />
            </svg>
            {ar ? "الإشعارات" : "Notifications"}
          </Link>
          <h1 className="font-black font-serif text-white text-2xl leading-tight">
            {title || (ar ? "تفاصيل الإشعار" : "Notification details")}
          </h1>
          {createdAt && (
            <p className="text-sm mt-1" style={{ color: "rgba(223,200,231,0.5)" }}>{fmtDateTime(createdAt, ar)}</p>
          )}
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-white/60 dark:bg-[#1a1030]/60 animate-pulse" />
            ))}
          </div>
        ) : notFound ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">🔔</p>
            <p className="text-sm font-semibold text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">{ar ? "الإشعار غير موجود." : "Notification not found."}</p>
          </div>
        ) : (
          <>
            {error && (
              <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Message */}
            {body && (
              <Card>
                <p className={`text-sm text-[#2E1A47]/75 dark:text-[#DFC8E7]/75 leading-relaxed ${ar ? "text-right" : ""}`}>{body}</p>
              </Card>
            )}

            {/* Appointment */}
            {kind === "appointment" && appt && (
              <Card>
                <h2 className={`font-black font-serif text-lg mb-3 ${ar ? "text-right" : ""}`}>
                  {isCancelled ? (ar ? "تفاصيل الإلغاء" : "Cancellation details")
                    : isRescheduled ? (ar ? "تفاصيل إعادة الجدولة" : "Reschedule details")
                    : (ar ? "تفاصيل الموعد" : "Appointment details")}
                </h2>
                <Row label={ar ? "رقم الموعد" : "Appointment #"} value={appt.reference_number} />
                <Row label={ar ? "الطبيب" : "Doctor"} value={appt.doctor?.full_name} />
                <Row label={ar ? "العيادة" : "Clinic"} value={appt.facility?.name} />
                <Row label={ar ? "التخصص" : "Speciality"} value={appt.doctor?.specialty} />
                <Row label={ar ? "تاريخ الحجز" : "Booked on"} value={fmtDate(appt.created_at, ar)} />
                {isRescheduled && (
                  <Row label={ar ? "الموعد السابق" : "Previous slot"} value={`${fmtDate(appt.previous_slot_date, ar)} · ${fmtTime(appt.previous_slot_start)}`} />
                )}
                <Row label={isRescheduled ? (ar ? "الموعد الجديد" : "New slot") : (ar ? "موعد الزيارة" : "Appointment")} value={`${fmtDate(appt.slot_date, ar)} · ${fmtTime(appt.slot_start)}`} />
                <Row label={ar ? "الحالة" : "Status"} value={appt.status} />
                {isCancelled && (
                  <>
                    <Row label={ar ? "سبب الإلغاء" : "Cancellation reason"} value={appt.cancellation_reason} />
                    <Row label={ar ? "أُلغي بواسطة" : "Cancelled by"} value={appt.cancelled_by ? (appt.cancelled_by === myUid ? (ar ? "أنت" : "You") : (ar ? "العيادة / الطاقم" : "Clinic / staff")) : null} />
                    <Row label={ar ? "وقت الإلغاء" : "Cancelled at"} value={fmtDateTime(appt.cancelled_at, ar)} />
                    <Row label={ar ? "استرداد المبلغ" : "Refund status"} value={payment?.status === "refunded" ? (ar ? "تم الاسترداد" : "Refunded") : (payment ? (ar ? "لا يوجد استرداد" : "No refund") : null)} />
                  </>
                )}
              </Card>
            )}

            {/* Payment */}
            {kind === "appointment" && payment && (
              <Card>
                <h2 className={`font-black font-serif text-lg mb-3 ${ar ? "text-right" : ""}`}>{ar ? "تفاصيل الدفع" : "Payment details"}</h2>
                <Row label={ar ? "المبلغ" : "Amount"} value={payment.amount != null ? `${payment.amount} ${payment.currency ?? "OMR"}` : null} />
                <Row label={ar ? "طريقة الدفع" : "Payment method"} value={payment.payment_method ?? payment.gateway} />
                <Row label={ar ? "المرجع" : "Transaction reference"} value={payment.gateway_ref} />
                <Row label={ar ? "وقت الدفع" : "Payment time"} value={fmtDateTime(payment.created_at, ar)} />
                <Row label={ar ? "حالة الدفع" : "Payment status"} value={payment.status} />
                <Row label={ar ? "الفاتورة" : "Invoice"} value={invoiceUrl ? (ar ? "متاحة" : "Available") : (ar ? "قيد الإنشاء" : "Pending")} />
              </Card>
            )}

            {/* Lab */}
            {kind === "lab" && lab && (
              <Card>
                <h2 className={`font-black font-serif text-lg mb-3 ${ar ? "text-right" : ""}`}>{ar ? "نتيجة المختبر" : "Lab result"}</h2>
                <Row label={ar ? "المختبر" : "Laboratory"} value={lab.facility_name} />
                <Row label={ar ? "الفحص" : "Test"} value={lab.test_name} />
                <Row label={ar ? "تاريخ النتيجة" : "Result date"} value={fmtDate(lab.result_date ?? lab.uploaded_at, ar)} />
                <Row label={ar ? "الحالة" : "Status"} value={lab.status} />
              </Card>
            )}

            {/* Waitlist */}
            {kind === "waitlist" && (
              <Card>
                <h2 className={`font-black font-serif text-lg mb-3 ${ar ? "text-right" : ""}`}>{ar ? "عرض من قائمة الانتظار" : "Waitlist offer"}</h2>
                <Row label={ar ? "الموعد المعروض" : "Offered slot"} value={offeredSlot ? fmtDateTime(offeredSlot, ar) : null} />
              </Card>
            )}

            {/* Actions */}
            <div className={`flex flex-wrap items-center gap-3 pt-1 ${ar ? "flex-row-reverse" : ""}`}>
              {kind === "appointment" && (
                <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => router.push("/dashboard/appointments")}>
                  {ar ? "عرض الموعد" : "View Appointment"}
                </button>
              )}
              {kind === "appointment" && invoiceUrl && (
                <button className={btnGhost} onClick={() => window.open(invoiceUrl, "_blank", "noopener,noreferrer")}>
                  {ar ? "تنزيل الفاتورة" : "Download Invoice"}
                </button>
              )}
              {kind === "appointment" && isCancelled && (
                <button className={btnGhost} onClick={bookAgain} disabled={rebooking}>
                  {rebooking ? (ar ? "جارٍ الحجز…" : "Booking…") : (ar ? "احجز مرة أخرى" : "Book Again")}
                </button>
              )}
              {kind === "lab" && (
                <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => router.push("/dashboard/records")}>
                  {ar ? "عرض التقرير" : "View Report"}
                </button>
              )}
              {kind === "waitlist" && (
                <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => router.push("/dashboard/appointments")}>
                  {ar ? "عرض المواعيد" : "View Appointments"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
