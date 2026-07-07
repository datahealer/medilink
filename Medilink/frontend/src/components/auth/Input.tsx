"use client";

import { type InputHTMLAttributes, forwardRef, useState } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  showPasswordToggle?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, showPasswordToggle = false, type, className = "", id, ...rest }, ref) => {
    const [visible, setVisible] = useState(false);
    const inputType = showPasswordToggle ? (visible ? "text" : "password") : type;

    return (
      <div className="flex flex-col gap-1 w-full">
        {label && (
          <label htmlFor={id} className="text-xs font-semibold text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 uppercase tracking-wide">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={inputType}
            className={`
              w-full px-4 py-3 rounded-xl text-sm
              text-[#2E1A47] dark:text-[#DFC8E7]
              bg-white dark:bg-[#1c1030]
              border transition-all outline-none
              placeholder:text-[#2E1A47]/35 dark:placeholder:text-[#DFC8E7]/35
              focus:border-[#2E1A47] focus:ring-2 focus:ring-[#2E1A47]/15
              ${error ? "border-red-400" : "border-[#e7dcee] dark:border-[#3a2560]"}
              ${showPasswordToggle ? "pr-11" : ""}
              ${className}
            `}
            {...rest}
          />
          {showPasswordToggle && (
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="absolute inset-y-0 end-3 flex items-center text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors"
              aria-label={visible ? "Hide password" : "Show password"}
            >
              {visible ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {hint && !error && <p className="text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
