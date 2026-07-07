"use client";

import { useRef, type KeyboardEvent, type ClipboardEvent } from "react";

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (val: string) => void;
}

export function OTPInput({ length = 6, value, onChange }: OTPInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split("").concat(Array(length).fill("")).slice(0, length);

  const focus = (i: number) => refs.current[i]?.focus();

  const set = (i: number, char: string) => {
    const arr = digits.slice();
    arr[i] = char;
    onChange(arr.join(""));
  };

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) {
        set(i, "");
      } else if (i > 0) {
        set(i - 1, "");
        focus(i - 1);
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      focus(i - 1);
    } else if (e.key === "ArrowRight" && i < length - 1) {
      focus(i + 1);
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault();
      set(i, e.key);
      if (i < length - 1) focus(i + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    onChange(pasted.padEnd(length, "").slice(0, length));
    focus(Math.min(pasted.length, length - 1));
  };

  const isFilled = (i: number) => Boolean(digits[i]);
  const isActive = (i: number) => !isFilled(i) && (i === 0 || isFilled(i - 1));

  return (
    <div className="flex gap-2.5 justify-center" dir="ltr">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={`
            otp-input w-12 h-14 text-center text-xl font-bold rounded-[13px]
            border-2 outline-none transition-all
            text-[#2E1A47] dark:text-[#DFC8E7]
            bg-white dark:bg-[#1c1030]
            ${isFilled(i)
              ? "border-[#2E1A47] bg-[#f5f0fa] dark:bg-[#2a1c44]"
              : isActive(i)
              ? "border-[#2E1A47] shadow-[0_0_0_3px_rgba(46,26,71,0.12)]"
              : "border-[#e7dcee] dark:border-[#3a2560]"
            }
          `}
          type="number"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={() => {}}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
