export interface PasswordValidation {
  valid: boolean;
  errors: string[];
}

export const PASSWORD_RULES = [
  { label: "At least 8 characters",  test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter",    test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter",    test: (p: string) => /[a-z]/.test(p) },
  { label: "One number",              test: (p: string) => /[0-9]/.test(p) },
  { label: "One special character",   test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function validatePassword(password: string): PasswordValidation {
  const errors = PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.label);
  return { valid: errors.length === 0, errors };
}
