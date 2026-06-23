"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { Input } from "@/components/auth/Input";
import { Button } from "@/components/auth/Button";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) setError(err.message);
      else setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: "#DFC8E7" }}
          >
            ✅
          </div>
          <h2
            className="font-bold text-[#2E1A47]"
            style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: "30px" }}
          >
            {ar ? "تم تحديث كلمة المرور!" : "Password updated!"}
          </h2>
          <p className="text-sm text-[#2E1A47]/60">
            {ar ? "تم تغيير كلمة مرورك. يمكنك الآن تسجيل الدخول." : "Your password has been changed. You can now sign in with your new password."}
          </p>
          <Button variant="cta" fullWidth onClick={() => router.push("/sign-in")}>
            {ar ? "الذهاب لتسجيل الدخول" : "Go to sign in"}
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="mb-7">
        <h2
          className="font-bold text-[#2E1A47]"
          style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: "30px", margin: "0 0 6px" }}
        >
          {ar ? "إعادة تعيين كلمة المرور" : "Reset password"}
        </h2>
        <p className="mt-1 text-sm text-[#2E1A47]/55">
          {ar ? "اختر كلمة مرور قوية لحسابك." : "Choose a strong password for your account."}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <Input
            id="password"
            label={ar ? "كلمة المرور الجديدة" : "New password"}
            type="password"
            placeholder="••••••••"
            showPasswordToggle
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <PasswordStrength password={password} />
        </div>

        <Input
          id="confirm"
          label={ar ? "تأكيد كلمة المرور" : "Confirm password"}
          type="password"
          placeholder="••••••••"
          showPasswordToggle
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={confirm && confirm !== password ? (ar ? "كلمتا المرور غير متطابقتين" : "Passwords do not match") : undefined}
          autoComplete="new-password"
        />

        {error && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={loading}
          className="mt-1"
          disabled={!password || !confirm}
        >
          {ar ? "تحديث كلمة المرور" : "Update password"}
        </Button>
      </form>
    </AuthCard>
  );
}
