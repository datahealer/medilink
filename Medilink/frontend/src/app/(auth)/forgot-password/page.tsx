"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { Input } from "@/components/auth/Input";
import { Button } from "@/components/auth/Button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

export default function ForgotPasswordPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) setError(err.message);
      else setSent(true);
    } catch {
      setError(ar ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: "#DFC8E7" }}>
            📧
          </div>
          <h2 className="font-bold text-[#2E1A47]"
            style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: "30px" }}>
            {ar ? "تحقق من بريدك الوارد" : "Check your inbox"}
          </h2>
          <p className="text-sm text-[#2E1A47]/60">
            {ar
              ? <>أرسلنا رابط إعادة التعيين إلى <span className="font-semibold text-[#2E1A47]">{email}</span>. اتبع الرابط لإنشاء كلمة مرور جديدة.</>
              : <>We sent a reset link to <span className="font-semibold text-[#2E1A47]">{email}</span>. Follow the link to create a new password.</>
            }
          </p>
          <Link href="/sign-in" className="mt-2 text-sm font-semibold text-[#46255f] hover:underline">
            {ar ? "العودة لتسجيل الدخول" : "Back to sign in"}
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="mb-7">
        <h2 className="font-bold text-[#2E1A47]"
          style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: "30px", margin: "0 0 6px" }}>
          {ar ? "نسيت كلمة المرور؟" : "Forgot password?"}
        </h2>
        <p className="mt-1 text-sm text-[#2E1A47]/55">
          {ar ? "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين." : "Enter your email and we'll send you a reset link."}
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
          <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <Button type="submit" variant="cta" fullWidth loading={loading} className="mt-1">
          {ar ? "إرسال رابط إعادة التعيين" : "Send reset link"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[#2E1A47]/55">
        {ar ? "تذكرتها؟" : "Remembered it?"}{" "}
        <Link href="/sign-in" className="font-semibold text-[#46255f] hover:underline">
          {ar ? "تسجيل الدخول" : "Sign in"}
        </Link>
      </p>
    </AuthCard>
  );
}
