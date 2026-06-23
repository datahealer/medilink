"use client";

import { AuthCard } from "@/components/auth/AuthCard";
import { LinkButton } from "@/components/auth/LinkButton";
import { useI18n } from "@/i18n/I18nProvider";

export default function WelcomePage() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  return (
    <AuthCard>
      <h2
        className="font-bold text-[#2E1A47] dark:text-[#DFC8E7]"
        style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: "30px", margin: "0 0 6px" }}
      >
        {ar ? "أهلا بك في MediLink" : "Welcome to MediLink"}
      </h2>
      <p className="text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 mb-[18px]">
        {ar ? "ابدأ في دقيقة واحدة." : "Get started in a minute."}
      </p>

      <div className="flex flex-col gap-[10px]">
        <LinkButton href="/onboarding" variant="cta" fullWidth>
          {ar ? "إنشاء حساب" : "Create account"}
        </LinkButton>
        <LinkButton href="/sign-in" variant="ghost" fullWidth>
          {ar ? "لدي حساب بالفعل" : "I already have an account"}
        </LinkButton>
      </div>
    </AuthCard>
  );
}
