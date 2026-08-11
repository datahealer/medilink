"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { Input } from "@/components/auth/Input";
import { Button } from "@/components/auth/Button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

/**
 * Password recovery — 6-DIGIT CODE, shared with mobile.
 *
 * This used to pass `redirectTo`, which made Supabase send {{ .ConfirmationURL }} (a
 * clickable link) and land the user on /reset-password with a session already established.
 * Mobile, meanwhile, calls the same `resetPasswordForEmail` with NO redirectTo and expects
 * a 6-digit code for `verifyOtp({ type: "recovery" })`.
 *
 * Supabase allows only ONE recovery template per project, so those two flows were mutually
 * exclusive: whichever was configured, the other platform's recovery was dead. The default
 * was the link, so MOBILE recovery could not complete at all.
 *
 * Both platforms now use the code. Dropping `redirectTo` is what makes Supabase render the
 * {{ .Token }} recovery template (supabase/templates/recovery.html), and the user is sent
 * to /otp?flow=recovery to enter it. Do NOT reintroduce `redirectTo` here.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const ar = locale === "ar";

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      // No redirectTo → Supabase sends the 6-digit recovery code, not a link.
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
      if (err) {
        setError(err.message);
        return;
      }
      // Straight to the shared OTP screen in recovery mode; it verifies the code and then
      // routes on to /reset-password with a live recovery session.
      router.push(`/otp?flow=recovery&email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch {
      setError(ar ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // No "check your inbox" interstitial any more: the user goes straight to /otp to type
  // the code, which is where they need to be. A terminal "follow the link" screen would
  // now be a dead end, since there is no link.

  return (
    <AuthCard>
      <div className="mb-7">
        <h2 className="font-bold text-[#2E1A47] dark:text-[#DFC8E7]"
          style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: "30px", margin: "0 0 6px" }}>
          {ar ? "نسيت كلمة المرور؟" : "Forgot password?"}
        </h2>
        <p className="mt-1 text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
          {ar
            ? "أدخل بريدك الإلكتروني وسنرسل لك رمزًا مكوّنًا من 6 أرقام."
            : "Enter your email and we'll send you a 6-digit code."}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Input
          id="email"
          label={ar ? "البريد الإلكتروني" : "Email"}
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        {error && (
          <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <Button type="submit" variant="cta" fullWidth loading={loading} className="mt-1">
          {ar ? "إرسال الرمز" : "Send code"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
        {ar ? "تذكرتها؟" : "Remembered it?"}{" "}
        <Link href="/sign-in" className="font-semibold text-[#46255f] dark:text-[#DFC8E7] hover:underline">
          {ar ? "تسجيل الدخول" : "Sign in"}
        </Link>
      </p>
    </AuthCard>
  );
}
