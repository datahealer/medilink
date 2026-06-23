import { env } from "@/config/env";
import { getAccessToken } from "@/lib/supabase";

/**
 * Thin client for the backend (Next.js API) — used only for privileged/heavy work
 * (payments, AI, PDFs, GDPR). Plain RLS-safe CRUD should go directly through the
 * Supabase client + the shared `api` modules instead.
 *
 * Every request carries the Supabase access token as a Bearer credential, which the
 * backend exchanges for an RLS-scoped client — same identity as direct queries.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  // Let fetch set the multipart boundary for FormData; only default to JSON otherwise.
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const url = path.startsWith("http") ? path : `${env.API_URL}${path}`;
  const res = await fetch(url, { ...init, headers });

  const isJson = res.headers
    .get("content-type")
    ?.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message =
      (isJson && payload && (payload as { error?: string }).error) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message, payload);
  }
  return payload as T;
}
