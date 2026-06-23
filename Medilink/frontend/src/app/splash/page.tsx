"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function SplashPage() {
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (bar) {
      bar.style.transition = "width 1.6s cubic-bezier(.4,0,.2,1)";
      bar.style.width = "72%";
    }
    const timer = setTimeout(() => router.replace("/welcome"), 2200);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "#2E1A47" }}
    >
      {/* Large brand circles — matching the brand cover aesthetic */}
      <div
        className="absolute top-[-18%] right-[-12%] w-[55vw] h-[55vw] rounded-full"
        style={{ background: "rgba(70,37,95,0.7)" }}
      />
      <div
        className="absolute top-[-8%] right-[8%] w-[38vw] h-[38vw] rounded-full"
        style={{ background: "rgba(55,30,80,0.5)" }}
      />
      <div
        className="absolute bottom-[-15%] left-[-10%] w-[45vw] h-[45vw] rounded-full"
        style={{ background: "rgba(70,37,95,0.5)" }}
      />
      <div
        className="absolute bottom-[8%] left-[12%] w-[22vw] h-[22vw] rounded-full opacity-30"
        style={{ background: "radial-gradient(circle, #C3D7EE, transparent)" }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-5">
        {/* Wordmark */}
        <img
          src="/logo/wordmark-lavender.svg"
          alt="Medilink"
          className="w-64 h-auto"
        />

        <p
          className="text-sm tracking-wide font-medium"
          style={{ color: "rgba(223,200,231,0.55)", letterSpacing: "0.12em" }}
        >
          Your Link to Better Care.
        </p>

        {/* Progress bar */}
        <div
          className="mt-10 w-40 h-[2px] overflow-hidden"
          style={{ background: "rgba(223,200,231,0.15)", borderRadius: "1px" }}
        >
          <div
            ref={barRef}
            className="h-full"
            style={{ width: "0%", background: "#DFC8E7", borderRadius: "1px" }}
          />
        </div>
      </div>
    </div>
  );
}
