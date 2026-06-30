"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { Input } from "@/components/auth/Input";
import { Button } from "@/components/auth/Button";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { useI18n } from "@/i18n/I18nProvider";

export default function SignUpPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const ar = locale === "ar";

  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Partial<typeof form & { terms: string }>>({});

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    router.push("/dashboard");
  };

  return (
    <AuthCard>
      <div className="mb-[18px]">
        <h2
          className="font-bold text-[#2E1A47] dark:text-[#DFC8E7]"
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
          <span className="text-xs text-[#2E1A47]/65 dark:text-[#DFC8E7]/65 leading-relaxed">
            {ar ? "أوافق على " : "I agree to MediLink's "}
            <a href="#" className="text-[#46255f] dark:text-[#DFC8E7] hover:underline">
              {ar ? "شروط الخدمة" : "Terms of Service"}
            </a>
            {ar ? " و" : " and "}
            <a href="#" className="text-[#46255f] dark:text-[#DFC8E7] hover:underline">
              {ar ? "سياسة الخصوصية" : "Privacy Policy"}
            </a>
          </span>
        </label>
        {errors.terms && <p className="text-xs text-red-500 -mt-2">{errors.terms}</p>}

        <Button type="submit" variant="cta" fullWidth className="mt-1">
          {ar ? "إنشاء الحساب" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
        {ar ? "لديك حساب بالفعل؟" : "Already have an account?"}{" "}
        <Link href="/sign-in" className="font-semibold text-[#46255f] dark:text-[#DFC8E7] hover:underline">
          {ar ? "سجل الدخول" : "Sign in"}
        </Link>
      </p>
    </AuthCard>
  );
}
