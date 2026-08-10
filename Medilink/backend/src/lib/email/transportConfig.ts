/**
 * Pure configuration logic for the mail transport: which auth mode applies, what nodemailer
 * options to build, and what the startup log line says.
 *
 * Separated from `transporter.ts` because that module creates real sockets and reads files.
 * Everything here is a pure function of (env, ca, token), which makes the decisions that
 * matter — "are we using OAuth or Basic?", "is TLS verification on?", "does the log leak a
 * secret?" — directly assertable without a network, a mailbox, or a Microsoft tenant.
 *
 * NOTHING in this file imports another project module. That keeps it importable by the
 * Node test runner without dragging in nodemailer, and it is why `transporter.ts` passes the
 * CA and token in rather than this file reading them.
 */

export const DEFAULT_HOST = "smtp.office365.com";
export const DEFAULT_PORT = 587;

/**
 * OAuth2 is PREFERRED, unconditionally, whenever it is fully configured.
 *
 * Deliberately not "fall back to Basic if OAuth fails": a half-configured OAuth setup that
 * silently reverted to a password would reintroduce exactly the 535 that motivated this
 * migration, and hide it behind an apparently-working config. If the OAuth variables are
 * present, OAuth is what runs.
 */
export type AuthMode =
  | { mode: "oauth2"; user: string }
  | { mode: "basic"; user: string }
  | { mode: "none"; missing: string[] };

export type EnvLike = Record<string, string | undefined>;

/** SMTP_USER is canonical; EMAIL_USER is the legacy Gmail-era name, still honoured. */
export function smtpUser(env: EnvLike): string | undefined {
  return env.SMTP_USER?.trim() || env.EMAIL_USER?.trim() || undefined;
}

/** Presence only — the value is never returned to a caller that might log it. */
function hasBasicPassword(env: EnvLike): boolean {
  return Boolean((env.SMTP_PASS ?? env.EMAIL_PASS ?? "").trim());
}

function oauthMissing(env: EnvLike): string[] {
  const missing: string[] = [];
  if (!env.MICROSOFT_TENANT_ID?.trim()) missing.push("MICROSOFT_TENANT_ID");
  if (!env.MICROSOFT_CLIENT_ID?.trim()) missing.push("MICROSOFT_CLIENT_ID");
  if (!(env.MICROSOFT_CLIENT_SECRET ?? "").trim()) missing.push("MICROSOFT_CLIENT_SECRET");
  return missing;
}

/** Are ANY of the Microsoft OAuth variables set? Used to decide whether the operator
 *  intended OAuth, so a partial setup is reported rather than silently downgraded. */
function oauthAttempted(env: EnvLike): boolean {
  return oauthMissing(env).length < 3;
}

/**
 * Decide how to authenticate.
 *
 * Order:
 *   1. Complete OAuth config  → oauth2 (always wins).
 *   2. Partial OAuth config   → none, naming the missing variables. NOT a silent downgrade
 *                               to Basic, even if SMTP_PASS happens to be present — that is
 *                               the trap this migration exists to close.
 *   3. No OAuth config at all → basic, if a password exists (legacy/rollback path).
 *   4. Otherwise              → none.
 */
export function resolveAuthMode(env: EnvLike): AuthMode {
  const user = smtpUser(env);
  const missing = oauthMissing(env);

  if (missing.length === 0) {
    // SMTP_USER is the mailbox the token authorises submission for; XOAUTH2 carries it.
    if (!user) return { mode: "none", missing: ["SMTP_USER"] };
    return { mode: "oauth2", user };
  }

  if (oauthAttempted(env)) {
    const stillMissing = user ? missing : [...missing, "SMTP_USER"];
    return { mode: "none", missing: stillMissing };
  }

  if (user && hasBasicPassword(env)) return { mode: "basic", user };

  const missingBasic: string[] = [];
  if (!user) missingBasic.push("SMTP_USER");
  if (!hasBasicPassword(env)) missingBasic.push("SMTP_PASS");
  return { mode: "none", missing: missingBasic };
}

export type TlsOptions = {
  minVersion: "TLSv1.2";
  ca?: string[];
};

export type TransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth:
    | { type: "OAuth2"; user: string }
    | { user: string; pass: string };
  tls: TlsOptions;
  pool: boolean;
  maxConnections: number;
  maxMessages: number;
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
};

export function resolveHost(env: EnvLike): string {
  return env.SMTP_HOST?.trim() || DEFAULT_HOST;
}

export function resolvePort(env: EnvLike): number {
  const port = Number(env.SMTP_PORT ?? DEFAULT_PORT);
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT;
}

/** Explicit opt-in only — 587 must stay on the STARTTLS path. */
export function resolveSecure(env: EnvLike): boolean {
  return env.SMTP_SECURE?.trim().toLowerCase() === "true";
}

/**
 * Build the nodemailer transport options.
 *
 * `rootCertificates` and `ca` are parameters rather than reads so this stays pure. When a CA
 * is supplied the bundled roots are placed FIRST and the extra root appended — nodemailer's
 * `tls.ca` REPLACES Node's trust store, so passing only the interception root would break
 * every ordinary Office 365 chain in an environment without that proxy.
 *
 * `rejectUnauthorized` is never set, at all, in any branch. It keeps its secure default.
 */
export function buildTransportOptions(args: {
  env: EnvLike;
  auth: AuthMode;
  /** PEM contents of an extra trusted root, or null. */
  ca: string | null;
  /** Node's bundled roots — injected so this file need not import node:tls. */
  rootCertificates: readonly string[];
  /** Required for basic mode. Never logged. */
  password?: string;
}): TransportOptions {
  const { env, auth, ca, rootCertificates, password } = args;
  if (auth.mode === "none") {
    throw new Error("buildTransportOptions called with no usable auth mode");
  }

  const secure = resolveSecure(env);

  const tls: TlsOptions = { minVersion: "TLSv1.2" };
  if (ca) tls.ca = [...rootCertificates, ca];

  return {
    host: resolveHost(env),
    port: resolvePort(env),
    secure,
    // Never let a relay that fails to advertise STARTTLS receive patient names and
    // appointment details in the clear.
    requireTLS: !secure,
    auth:
      auth.mode === "oauth2"
        ? // No accessToken here on purpose: the token is supplied per connection by
          // nodemailer's oauth2 provisioning callback, so one long-lived pooled transporter
          // keeps working after the token rotates. See transporter.ts.
          { type: "OAuth2", user: auth.user }
        : { user: auth.user, pass: password ?? "" },
    tls,
    pool: true,
    maxConnections: 3,
    // Microsoft throttles aggressively; a low cap avoids tripping it during a batch.
    maxMessages: 50,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

/**
 * The startup log line.
 *
 * Contains the host, port, TLS mode, auth mode and mailbox — and by construction nothing
 * else. There is no parameter here through which a secret or a token could arrive, which is
 * what makes "no credential is ever logged" a property of the type rather than a promise.
 */
export function describeTransport(args: {
  env: EnvLike;
  auth: { mode: "oauth2" | "basic"; user: string };
  hasExtraCa: boolean;
}): string {
  const { env, auth, hasExtraCa } = args;
  const tlsMode = resolveSecure(env) ? "implicit TLS" : "STARTTLS";
  const authLabel = auth.mode === "oauth2" ? "OAuth2" : "Basic";
  return (
    `[email] transporter ready: ${resolveHost(env)}:${resolvePort(env)} ` +
    `(${tlsMode}, ${authLabel}, verify=on${hasExtraCa ? ", +SMTP_CA_FILE root" : ""}) ` +
    `as ${auth.user}`
  );
}

/** Human-readable auth-mode banner, logged once so the mode is never in doubt. */
export function describeAuthMode(auth: AuthMode): string {
  switch (auth.mode) {
    case "oauth2":
      return "[email] auth mode: Microsoft OAuth2";
    case "basic":
      return (
        "[email] auth mode: Basic (SMTP password) — DEPRECATED. Microsoft blocks this when " +
        "Entra security defaults are enabled; set MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID / " +
        "MICROSOFT_CLIENT_SECRET to use OAuth2."
      );
    case "none":
      return `[email] auth mode: NOT CONFIGURED — missing: ${auth.missing.join(", ")}`;
  }
}
