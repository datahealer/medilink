"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@medilink/shared";
import { AuthCard } from "@/components/auth/AuthCard";
import { Input } from "@/components/auth/Input";
import { Button } from "@/components/auth/Button";
import { createBrowserSupabaseClient, signInWithGoogle } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

export default function SignInPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const ar = locale === "ar";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      await api.auth.signInWithPassword(supabase, { email, password });
      router.push("/dashboard");
      router.refresh(); // let middleware + server components pick up the new session cookie
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : ar
            ? "تعذر تسجيل الدخول. تحقق من بياناتك."
            : "Could not sign in. Please check your details."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    try {
      await signInWithGoogle(); // redirects to Google, then /auth/callback
    } catch {
      setError(ar ? "تعذر المتابعة مع Google." : "Could not continue with Google.");
    }
  };

  return (
    <AuthCard>
      <div className="mb-[18px]">
        <h2 className="font-bold text-[#2E1A47] dark:text-[#DFC8E7]"
          style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: "30px", margin: "0 0 6px" }}>
          {ar ? "أهلا وسهلا" : "Welcome back"}
        </h2>
        <p className="text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
          {ar ? "سجل الدخول لمواصلة رحلتك الصحية." : "Sign in to continue your care journey."}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Input id="email" label={ar ? "البريد الإلكتروني" : "Email"} type="email"
          placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
          autoComplete="email" required />

        <Input id="password" label={ar ? "كلمة المرور" : "Password"} type="password"
          placeholder="••••••••" showPasswordToggle value={password}
          onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />

        {error && (
          <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button type="submit" variant="cta" fullWidth loading={loading} className="mt-2">
          {ar ? "تسجيل الدخول" : "Sign in"}
        </Button>
      </form>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-[#e7dcee] dark:bg-[#3a2560]" />
        <span className="text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 font-medium">{ar ? "أو" : "or"}</span>
        <div className="flex-1 h-px bg-[#e7dcee] dark:bg-[#3a2560]" />
      </div>

      <button type="button" onClick={handleGoogle}
        className="flex items-center justify-center gap-3 w-full px-5 py-3 rounded-xl border border-[#e7dcee] dark:border-[#3a2560] bg-white dark:bg-[#1c1030] text-[#2E1A47] dark:text-[#DFC8E7] text-sm font-semibold hover:bg-[#f9f4fa] dark:hover:bg-[#2a1c44] active:scale-[0.98] transition-all shadow-sm">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908C16.658 14.232 17.64 11.927 17.64 9.2z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
          <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        {ar ? "المتابعة مع Google" : "Continue with Google"}
      </button>

      <p className="mt-5 text-center text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
        <Link href="/forgot-password" className="font-medium text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 hover:text-[#46255f] dark:hover:text-[#DFC8E7] transition-colors">
          {ar ? "نسيت كلمة المرور؟" : "Forgot password?"}
        </Link>
      </p>

      <p className="mt-3 text-center text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
        {ar ? "ليس لديك حساب؟" : "No account yet?"}{" "}
        <Link href="/sign-up" className="font-semibold text-[#46255f] hover:underline">
          {ar ? "أنشئ واحداً" : "Create one"}
        </Link>
      </p>
    </AuthCard>
  );
}
