"use client";

import { Suspense } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { OTPInput } from "@/components/auth/OTPInput";
import { Button } from "@/components/auth/Button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

const RESEND_SECONDS = 60;

function OTPForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const { locale } = useI18n();
  const ar = locale === "ar";

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [resendLoading, setResendLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timerRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, []);

  const handleVerify = async () => {
    if (otp.length < 6) { setError(ar ? "أدخل جميع الأرقام الستة" : "Enter all 6 digits"); return; }
    setError("");
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: err } = await supabase.auth.verifyOtp({ email, token: otp, type: "signup" });
      if (err) setError(err.message);
      else router.push("/dashboard");
    } catch {
      setError(ar ? "فشل التحقق. حاول مرة أخرى." : "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.resend({ type: "signup", email });
      setCountdown(RESEND_SECONDS);
      timerRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(timerRef.current!); return 0; }
          return c - 1;
        });
      }, 1000);
    } finally {
      setResendLoading(false);
    }
  };

  const maskedEmail = email.replace(/(.{2})(.+)(@.+)/, "$1***$3");

  return (
    <AuthCard>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-5"
          style={{ background: "#DFC8E7" }}>
          ✉️
        </div>

        <h2 className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-2"
          style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: "30px" }}>
          {ar ? "أدخل الرمز المكون من ٦ أرقام" : "Enter the 6-digit code"}
        </h2>
        <p className="text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 mb-1">
          {ar ? "أرسلنا رمزاً مكوناً من ٦ أرقام إلى" : "We sent a 6-digit code to"}
        </p>
        <p className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] mb-7">{maskedEmail || (ar ? "بريدك الإلكتروني" : "your email")}</p>

        <OTPInput length={6} value={otp} onChange={setOtp} />

        {error && (
          <p className="mt-3 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2 w-full">
            {error}
          </p>
        )}

        <Button variant="cta" fullWidth className="mt-6" onClick={handleVerify}
          loading={loading} disabled={otp.length < 6}>
          {ar ? "تحقق" : "Verify"}
        </Button>

        <div className="mt-5 text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
          {countdown > 0 ? (
            <p>
              {ar ? "إعادة الإرسال بعد " : "Resend code in "}
              <span className="font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">
                {String(Math.floor(countdown / 60)).padStart(2, "0")}:
                {String(countdown % 60).padStart(2, "0")}
              </span>
              {ar ? " ثانية" : ""}
            </p>
          ) : (
            <button onClick={handleResend} disabled={resendLoading}
              className="font-semibold text-[#46255f] dark:text-[#DFC8E7] hover:underline disabled:opacity-50">
              {resendLoading ? (ar ? "جارٍ الإرسال…" : "Sending…") : (ar ? "إعادة إرسال الرمز" : "Resend code")}
            </button>
          )}
        </div>

        <button onClick={() => router.back()}
          className="mt-4 text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors">
          {ar ? "→ رجوع" : "← Back"}
        </button>
      </div>
    </AuthCard>
  );
}

export default function OTPPage() {
  return (
    <Suspense>
      <OTPForm />
    </Suspense>
  );
}
