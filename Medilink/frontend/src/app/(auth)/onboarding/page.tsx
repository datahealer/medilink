"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/auth/Button";
import { AuthCard } from "@/components/auth/AuthCard";

const SLIDES = [
  {
    emoji: "🩺",
    title: "Find the right doctor",
    subtitle: "Browse verified specialists near you, filtered by specialty, language, and availability.",
  },
  {
    emoji: "📅",
    title: "Book appointments instantly",
    subtitle: "Schedule visits in seconds — no waiting on hold, no back-and-forth calls.",
  },
  {
    emoji: "💊",
    title: "Manage your prescriptions",
    subtitle: "Keep all your medications and refill reminders in one secure place.",
  },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const router = useRouter();

  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step] ?? SLIDES[0]!;

  const next = () => {
    if (isLast) {
      router.push("/language");
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <AuthCard>
      <div className="flex flex-col items-center text-center">
        {/* Illustration area */}
        <div
          className="w-28 h-28 rounded-3xl flex items-center justify-center mb-6 text-5xl shadow-lg"
          style={{ background: "linear-gradient(135deg, #DFC8E7 0%, #C3D7EE 100%)" }}
        >
          {slide.emoji}
        </div>

        <h2
          className="font-bold text-[#2E1A47] mb-3"
          style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: "30px" }}
        >
          {slide.title}
        </h2>
        <p className="text-sm text-[#2E1A47]/60 leading-relaxed max-w-xs">
          {slide.subtitle}
        </p>

        {/* Step dots */}
        <div className="flex gap-2 mt-8 mb-8">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === step ? "24px" : "8px",
                height: "8px",
                background: i === step ? "#2E1A47" : "#DFC8E7",
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        <Button variant="cta" fullWidth onClick={next}>
          {isLast ? "Get started" : "Next"}
        </Button>

        {step < SLIDES.length - 1 && (
          <button
            onClick={() => router.push("/language")}
            className="mt-4 text-sm text-[#2E1A47]/45 hover:text-[#2E1A47] transition-colors"
          >
            Skip
          </button>
        )}
      </div>
    </AuthCard>
  );
}
