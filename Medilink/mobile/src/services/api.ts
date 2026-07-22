import { Platform } from "react-native";

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

/** Abort a request that never connects/responds, so the UI fails fast and clearly. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Resolve the backend origin. On the Android emulator, `localhost`/`127.0.0.1`
 * resolves to the emulator itself, not the host machine — the host is reachable at
 * 10.0.2.2. Rewrite it so a `localhost` API URL "just works" on the emulator. A LAN
 * IP (physical device / staging) is passed through unchanged.
 */
function resolveBaseUrl(): string {
  const base = (env.API_URL || "").trim().replace(/\/+$/, "");
  if (Platform.OS === "android") {
    return base.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/i, "$110.0.2.2");
  }
  return base;
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

  const base = resolveBaseUrl();
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (e) {
    // Transport-level failure BEFORE any HTTP status — this is what surfaces as the
    // opaque RN "Network request failed". Causes: backend not running, connection
    // refused, host unreachable (localhost vs LAN IP), wrong port, DNS, TLS, cleartext
    // blocked, or device on a different network. Re-raise with the attempted URL and a
    // concrete hint instead of the bare message.
    const aborted = e instanceof Error && e.name === "AbortError";
    const detail = aborted
      ? `request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      : e instanceof Error
        ? e.message
        : String(e);
    throw new ApiError(
      0,
      `Couldn't reach the API server at ${url} (${detail}). ` +
        `Confirm the backend is running and reachable from this device: EXPO_PUBLIC_API_URL ` +
        `must be a host the device can see (a LAN IP — not "localhost" — for a physical phone, ` +
        `or 10.0.2.2 for the Android emulator), the server must listen on 0.0.0.0, and the ` +
        `device must be on the same network.`,
      { url, cause: detail }
    );
  } finally {
    clearTimeout(timer);
  }

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
