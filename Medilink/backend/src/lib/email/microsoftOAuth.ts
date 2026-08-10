/**
 * Microsoft Entra OAuth2 access tokens for Exchange Online SMTP (XOAUTH2).
 *
 * ── Why this exists ──
 *
 * Basic SMTP authentication (SMTP_USER + SMTP_PASS) against Microsoft 365 is refused when
 * Entra **Security Defaults** are enabled:
 *
 *     535 5.7.139 Authentication unsuccessful, user is locked by your organization's
 *     security defaults policy.
 *
 * Security Defaults block legacy authentication by design, and they stay ON. The supported
 * path is OAuth2 client credentials: the backend proves it is a registered application, and
 * Exchange grants it permission to submit mail as a specific mailbox. No user password is
 * involved at any point, which is why the policy does not apply.
 *
 * ── Flow ──
 *
 *   POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
 *   grant_type=client_credentials
 *   scope=https://outlook.office365.com/.default
 *
 * The `.default` scope means "every application permission already consented for this app",
 * which for SMTP submission is `SMTP.SendAsApp`. Note the resource is
 * `outlook.office365.com`, NOT Graph — a Graph-scoped token is rejected by SMTP.
 *
 * ── Dependency-free on purpose ──
 *
 * This is one POST with a form body. `@azure/msal-node` would add a large dependency tree
 * to a serverless bundle to wrap `fetch`, and its value (multi-account caching, interactive
 * flows, token persistence) is irrelevant to a single service principal that needs one
 * app-only token at a time.
 *
 * ── Secrets ──
 *
 * The client secret is read from the environment at call time and passed straight into the
 * request body. It is never logged, never returned, never included in an error message, and
 * never stored on the module. The same applies to the access token: it is returned to the
 * caller and cached in memory, but no code path prints it.
 */

/** Refresh this far before real expiry, so a token never expires mid-connection. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

/** Exchange Online SMTP resource. NOT Microsoft Graph. */
export const SMTP_OAUTH_SCOPE = "https://outlook.office365.com/.default";

export type MicrosoftOAuthConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

/**
 * Read and validate the OAuth configuration.
 *
 * Returns the missing variable NAMES when incomplete — names only, which are not secret,
 * so a misconfigured deployment says exactly what to set instead of failing with an opaque
 * SMTP error much later.
 */
export function readOAuthConfig(
  env: Record<string, string | undefined> = process.env
): { ok: true; config: MicrosoftOAuthConfig } | { ok: false; missing: string[] } {
  const tenantId = env.MICROSOFT_TENANT_ID?.trim();
  const clientId = env.MICROSOFT_CLIENT_ID?.trim();
  // Not trimmed: a secret is an opaque string and trimming could corrupt a valid value.
  // Only its presence is checked.
  const clientSecret = env.MICROSOFT_CLIENT_SECRET;

  const missing: string[] = [];
  if (!tenantId) missing.push("MICROSOFT_TENANT_ID");
  if (!clientId) missing.push("MICROSOFT_CLIENT_ID");
  if (!clientSecret || !clientSecret.trim()) missing.push("MICROSOFT_CLIENT_SECRET");

  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    config: { tenantId: tenantId!, clientId: clientId!, clientSecret: clientSecret! },
  };
}

/**
 * Turn an Entra error response into something actionable.
 *
 * `error_description` from Entra embeds the AADSTS code plus a correlation id and timestamp.
 * It contains no credential material, but it is long and noisy, so the specific codes worth
 * recognising are translated and the raw description is kept only as a suffix.
 */
export function describeTokenError(status: number, body: unknown): string {
  const err = (body ?? {}) as { error?: string; error_description?: string; error_codes?: number[] };
  const description = typeof err.error_description === "string" ? err.error_description : "";
  const codes = Array.isArray(err.error_codes) ? err.error_codes : [];

  /**
   * Match against BOTH representations Entra uses: the "AADSTS7000215" string inside
   * `error_description`, and the bare numeric `7000215` inside `error_codes`. The prefix has
   * to be stripped for the numeric comparison — `Number("AADSTS7000215")` is NaN, so
   * comparing it directly silently never matches, and the `error_codes` half of this check
   * would be dead code.
   */
  const has = (code: string) => {
    if (description.includes(code)) return true;
    const numeric = Number(code.replace(/^AADSTS/, ""));
    return Number.isFinite(numeric) && codes.includes(numeric);
  };

  if (has("AADSTS7000215")) {
    return "invalid client secret (AADSTS7000215) — MICROSOFT_CLIENT_SECRET is wrong or expired";
  }
  if (has("AADSTS700016")) {
    return (
      "application not found in this tenant (AADSTS700016) — MICROSOFT_CLIENT_ID or " +
      "MICROSOFT_TENANT_ID is wrong, or the app registration lives in a different tenant"
    );
  }
  if (has("AADSTS7000222")) {
    return "the client secret has EXPIRED (AADSTS7000222) — issue a new one in Entra";
  }
  if (has("AADSTS900023")) {
    return "tenant not found (AADSTS900023) — MICROSOFT_TENANT_ID is not a valid tenant";
  }
  if (has("AADSTS500011")) {
    return (
      "the resource principal was not found in the tenant (AADSTS500011) — the Exchange " +
      "Online service principal is likely not registered, or the scope is wrong"
    );
  }
  if (has("AADSTS65001") || err.error === "invalid_grant") {
    return "admin consent has not been granted for the application permission (AADSTS65001)";
  }

  const label = err.error ? `${err.error}` : `HTTP ${status}`;
  return description ? `${label} — ${description.split("\r\n")[0]}` : label;
}

type CachedToken = { accessToken: string; expiresAt: number };

/** In-memory cache. Never logged, never exported. */
let cached: CachedToken | null = null;
/** De-duplicates concurrent requests so a burst of sends makes ONE token call. */
let inFlight: Promise<CachedToken> | null = null;

/** Test seam: reset module state between cases. Not used by application code. */
export function __resetTokenCacheForTests(): void {
  cached = null;
  inFlight = null;
}

/** Is the cached token still usable, accounting for the safety margin? */
function isFresh(token: CachedToken | null, now: number): token is CachedToken {
  return Boolean(token && token.expiresAt - EXPIRY_MARGIN_MS > now);
}

async function requestToken(config: MicrosoftOAuthConfig, now: number): Promise<CachedToken> {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: SMTP_OAUTH_SCOPE,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    // Network-level failure. The message cannot contain the secret (it never reaches the
    // socket layer as anything but request body bytes), but keep it to `message` anyway.
    throw new Error(
      `could not reach the Microsoft token endpoint: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const payload = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number }
    | null;

  if (!res.ok) {
    throw new Error(describeTokenError(res.status, payload));
  }
  if (!payload?.access_token) {
    throw new Error(`token endpoint returned HTTP ${res.status} with no access_token`);
  }

  // Entra returns a relative lifetime in seconds (typically 3600). Treat a missing or
  // nonsensical value as a short life rather than assuming an hour — an over-long guess
  // means authenticating with a dead token.
  const lifetimeSec =
    typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 600;

  return { accessToken: payload.access_token, expiresAt: now + lifetimeSec * 1000 };
}

export type AccessToken = {
  accessToken: string;
  /** Absolute epoch ms. Handed to nodemailer so its own expiry check agrees with ours. */
  expiresAt: number;
};

/**
 * Return a valid app-only access token, from cache when possible.
 *
 * `now` is injectable so expiry and refresh behaviour can be tested without waiting an
 * hour or stubbing the clock globally.
 */
export async function getAccessToken(
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now()
): Promise<AccessToken> {
  if (isFresh(cached, now)) return { ...cached };

  // A second caller arriving during an in-flight request joins it instead of starting a
  // second token round trip. Entra rate-limits, and a burst of appointment emails would
  // otherwise request one token each.
  if (inFlight) return { ...(await inFlight) };

  const parsed = readOAuthConfig(env);
  if (!parsed.ok) {
    throw new Error(`Microsoft OAuth is not configured — missing: ${parsed.missing.join(", ")}`);
  }

  inFlight = requestToken(parsed.config, now)
    .then((token) => {
      cached = token;
      return token;
    })
    .finally(() => {
      inFlight = null;
    });

  return { ...(await inFlight) };
}

/**
 * Force the next `getAccessToken` to fetch a new token.
 *
 * Called when SMTP rejects the current one: nodemailer signals `renew` on an auth failure,
 * and honouring it is what makes recovery from a revoked or prematurely-invalidated token
 * automatic rather than requiring a process restart.
 */
export function invalidateAccessToken(): void {
  cached = null;
}
