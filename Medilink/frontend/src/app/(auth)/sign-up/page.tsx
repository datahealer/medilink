"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { Input } from "@/components/auth/Input";
import { Button } from "@/components/auth/Button";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

export default function SignUpPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const ar = locale === "ar";

  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Partial<typeof form & { terms: string }>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const errs: typeof errors = {};
    if (!form.fullName.trim()) errs.fullName = ar ? "الاسم الكامل مطلوب" : "Full name is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = ar ? "بريد إلكتروني صحيح مطلوب" : "Valid email required";
    if (form.password.length < 8) errs.password = ar ? "٨ أحرف على الأقل" : "At least 8 characters";
    if (!agreed) errs.terms = ar ? "يرجى قبول الشروط" : "Please accept the terms";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setServerError("");
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: err } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { full_name: form.fullName, phone: form.phone },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (err) setServerError(err.message);
      else router.push(`/otp?email=${encodeURIComponent(form.email)}`);
    } catch {
      setServerError(ar ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <div className="mb-[18px]">
        <h2
          className="font-bold text-[#2E1A47]"
          style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: "30px", margin: "0 0 6px" }}
        >
          {ar ? "إنشاء حساب" : "Create account"}
        </h2>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Input
          id="fullName"
          label={ar ? "الاسم الكامل" : "Full name"}
          type="text"
          placeholder={ar ? "فاطمة الزهراء" : "Jane Smith"}
          value={form.fullName}
          onChange={set("fullName")}
          error={errors.fullName}
          autoComplete="name"
        />
        <Input
          id="email"
          label={ar ? "البريد الإلكتروني" : "Email"}
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={set("email")}
          error={errors.email}
          autoComplete="email"
        />
        <Input
          id="phone"
          label={ar ? "الهاتف (اختياري)" : "Phone (optional)"}
          type="tel"
          placeholder="+968 9000 0000"
          value={form.phone}
          onChange={set("phone")}
          autoComplete="tel"
        />
        <div>
          <Input
            id="password"
            label={ar ? "كلمة المرور" : "Password"}
            type="password"
            placeholder="••••••••"
            showPasswordToggle
            value={form.password}
            onChange={set("password")}
            error={errors.password}
            autoComplete="new-password"
          />
          <PasswordStrength password={form.password} />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#d8cce4] accent-[#2E1A47]"
          />
          <span className="text-xs text-[#2E1A47]/65 leading-relaxed">
            {ar ? "أوافق على " : "I agree to MediLink's "}
            <a href="#" className="text-[#46255f] hover:underline">
              {ar ? "شروط الخدمة" : "Terms of Service"}
            </a>
            {ar ? " و" : " and "}
            <a href="#" className="text-[#46255f] hover:underline">
              {ar ? "سياسة الخصوصية" : "Privacy Policy"}
            </a>
          </span>
        </label>
        {errors.terms && <p className="text-xs text-red-500 -mt-2">{errors.terms}</p>}

        {serverError && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {serverError}
          </p>
        )}

        <Button type="submit" variant="cta" fullWidth loading={loading} className="mt-1">
          {ar ? "إنشاء الحساب" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[#2E1A47]/55">
        {ar ? "لديك حساب بالفعل؟" : "Already have an account?"}{" "}
        <Link href="/sign-in" className="font-semibold text-[#46255f] hover:underline">
          {ar ? "سجل الدخول" : "Sign in"}
        </Link>
      </p>
    </AuthCard>
  );
}
