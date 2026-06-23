"use client";

type Strength = "weak" | "fair" | "strong";

function getStrength(password: string): Strength {
  if (password.length < 6) return "weak";
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const score = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
  if (score >= 3 && password.length >= 8) return "strong";
  if (score >= 2) return "fair";
  return "weak";
}

const config: Record<Strength, { bars: number; color: string; label: string }> = {
  weak:   { bars: 1, color: "#ef4444", label: "Weak password" },
  fair:   { bars: 2, color: "#f59e0b", label: "Fair password" },
  strong: { bars: 3, color: "#22c55e", label: "Strong password" },
};

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const level = getStrength(password);
  const { bars, color, label } = config[level];

  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: n <= bars ? color : "#e7dcee" }}
          />
        ))}
      </div>
      <p className="text-xs font-medium" style={{ color }}>
        {label}
      </p>
    </div>
  );
}
