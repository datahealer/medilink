"use client";

/**
 * The one way the web app calls the MediLink backend.
 *
 * ── THE BUG THIS EXISTS TO FIX ──
 *
 * Every backend call from this app used `credentials: "include"` and nothing else, i.e. it
 * relied entirely on cookies. That cannot work in the deployed topology:
 *
 *     frontend   medilink-frontend*.vercel.app
 *     backend    medilink-backend-five.vercel.app     <- a DIFFERENT host
 *
 * `@supabase/ssr` sets the session cookies HOST-ONLY on the frontend's own domain, so the
 * browser never sends them to the backend's domain. Widening them with `Domain=.vercel.app`
 * is not an option either: `vercel.app` is on the Public Suffix List, so browsers reject
 * cookies scoped to it outright.
 *
 * The result was a 401 on every authenticated backend call, with a preflight that looked
 * perfectly healthy — `Access-Control-Allow-Credentials: true` only grants permission to
 * SEND cookies the browser already holds for that host; it cannot conjure any. That is why
 * OPTIONS returned 204 and the POST still returned 401, and why this reads as a CORS problem
 * when it is not one.
 *
 * `backend/src/lib/supabase/api.ts` has always accepted EITHER an `Authorization: Bearer`
 * token (how mobile authenticates) OR cookies, preferring the header. Mobile works for
 * exactly that reason. The web app simply never sent the header — with one exception,
 * `lib/appointmentEmail.ts`, whose comment diagnosed this correctly and attached the token.
 * This module generalises that fix so no call site has to remember it again.
 *
 * ── WHY THIS IS NOT A WEAKENING OF AUTH ──
 *
 * The token is the caller's OWN Supabase access token, a JWT signed by Supabase. The backend
 * validates it by calling `supabase.auth.getUser()` with it, which verifies the signature
 * server-side and returns the authenticated user. Identity is therefore proven
 * cryptographically, not asserted by the client:
 *
 *   • no user_id / patient_id is ever sent in a body or header, and the backend would ignore
 *     it if it were — every route derives the caller from the verified session;
 *   • server-side ownership filters (`.eq("patient_id", user.id)`) are untouched;
 *   • a forged or expired token fails `getUser()` and still yields 401;
 *   • CORS is untouched — the allow-list still decides which origins may call at all.
 *
 * This is the same trust model the mobile app has used since launch. Nothing becomes public.
 *
 * `credentials: "include"` is KEPT alongside the header, so a same-origin or reverse-proxied
 * deployment (where the cookies do arrive) keeps working unchanged.
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";

/**
 * The caller's current access token, or null when there is no session.
 *
 * Read fresh on every request rather than cached: `getSession()` refreshes an expired token
 * through the Supabase client, so a long-lived tab does not start sending a stale JWT and
 * getting 401s that look like this very bug.
 */
async function accessToken(): Promise<string | null> {
  try {
    const { data } = await createBrowserSupabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    // No session, or storage unavailable. The request proceeds unauthenticated and the
    // backend answers 401 — the correct outcome, and never a silent success.
    return null;
  }
}

/**
 * `fetch` against the backend with the caller's session attached.
 *
 * `path` must start with `/api/`. Returns the raw Response so callers keep their existing
 * status/error handling.
 */
export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith("/api/")) {
    throw new Error(`backendFetch: path must start with /api/ (got ${path})`);
  }

  const token = await accessToken();

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${env.BACKEND_URL}${path}`, {
    ...init,
    // Retained for the same-origin / proxied case; harmless cross-origin.
    credentials: "include",
    headers,
  });
}

/** `backendFetch` + JSON parse. Returns `{ res, data }` so callers can inspect the status. */
export async function backendJson<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<{ res: Response; data: T | null }> {
  const res = await backendFetch(path, init);
  const data = (await res.json().catch(() => null)) as T | null;
  return { res, data };
}

/**
 * Open a backend-authenticated FILE in a new tab.
 *
 * `window.open` cannot carry an Authorization header, which is why the invoice and
 * prescription download buttons would 401 even after this fix if they kept using it
 * directly. Both endpoints can hand back a short-lived signed URL instead, so this fetches
 * that URL with the session attached and opens the result — the signed URL needs no
 * credentials of its own.
 *
 * Returns false when the URL could not be obtained, so the caller can show its own error
 * rather than opening a blank tab.
 */
export async function openBackendFile(
  path: string,
  urlField: "url" | "signed_url" = "url"
): Promise<boolean> {
  const { res, data } = await backendJson<Record<string, unknown>>(path);
  const url = res.ok ? data?.[urlField] : null;
  if (typeof url !== "string" || !url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
