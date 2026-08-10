/**
 * The ONE SMTP transporter for application email.
 *
 * Scope — read this before adding a caller:
 *   ✅ transactional / business email: booking confirmation, cancellation, reschedule,
 *      payment receipt + invoice, staff invitations, announcements, generic notifications.
 *   🚫 AUTHENTICATION email: signup verification, email confirmation, password reset and
 *      login OTP are delivered by **Supabase Auth's own mailer** (GoTrue), configured in
 *      the Supabase dashboard. They never pass through this module. Routing them here
 *      would duplicate delivery, break the token/redirect templating Supabase owns, and
 *      silently bypass its rate limits. See docs/EMAIL_ARCHITECTURE.md.
 *
 * ── Why one shared module ──
 *
 * There used to be three: sendInvite.ts, sendInvoice.ts and sendNotification.ts each
 * called `nodemailer.createTransport({ service: "gmail", ... })` on its own. Three
 * connection pools, three copies of the credential read, and a provider switch meant
 * editing three files and missing one. Everything now resolves through `getTransporter()`.
 *
 * ── Provider: Microsoft 365 / Outlook, not Gmail ──
 *
 * `service: "gmail"` is gone. The mailbox is a Microsoft 365 one, and the defaults below
 * are the Microsoft SMTP AUTH client submission settings:
 *
 *     smtp.office365.com : 587, STARTTLS (secure=false + requireTLS=true)
 *
 * `secure: true` on 587 is the classic misconfiguration — it makes nodemailer open an
 * implicit-TLS connection against a port that expects a plaintext handshake upgraded by
 * STARTTLS, and it hangs until timeout rather than failing cleanly. Only set SMTP_SECURE
 * true if you have also moved SMTP_PORT to 465.
 *
 * Every default is overridable by env, so pointing at a different relay (or at a local
 * catcher like MailHog for testing) is configuration, never a code change.
 *
 * ── Authentication: OAuth2, not a password ──
 *
 * Basic SMTP auth is refused by Microsoft when Entra Security Defaults are enabled
 * (`535 5.7.139 … locked by your organization's security defaults policy`). Those defaults
 * stay on; the transport authenticates with an Entra app-only token over XOAUTH2 instead.
 * See microsoftOAuth.ts for the token flow and `oauth2_provision_cb` below for why one
 * long-lived pooled transporter keeps working after the token expires.
 */
import fs from "node:fs";
import tls from "node:tls";

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import { getAccessToken, invalidateAccessToken } from "./microsoftOAuth";
import {
  buildTransportOptions,
  describeAuthMode,
  describeTransport,
  resolveAuthMode,
  smtpUser,
  DEFAULT_HOST,
  DEFAULT_PORT,
} from "./transportConfig";

/**
 * Extra trusted root for environments behind a TLS-intercepting proxy.
 *
 * ── The problem this solves ──
 *
 * Endpoint-security products (Norton "Web/Mail Shield", ESET, Kaspersky, Zscaler,
 * Netskope, corporate proxies) terminate outbound TLS and re-sign it with a root they
 * install into the OS trust store. Node does NOT read the OS store — it carries its own
 * bundled CA list — so a Node process on such a machine sees a chain ending in an unknown
 * self-signed root and fails with:
 *
 *     SELF_SIGNED_CERT_IN_CHAIN — self-signed certificate in certificate chain
 *
 * Confirmed here: `smtp.office365.com:587` presented a leaf for `outlook.com` issued by
 * `Norton Web/Mail Shield Root`, a self-signed root absent from Node's 120-cert bundle.
 *
 * ── Why an env var in code, rather than NODE_EXTRA_CA_CERTS ──
 *
 * `NODE_EXTRA_CA_CERTS` is read by Node **at process start**, before Next.js loads
 * `.env.local`. Putting it there therefore does nothing — it must already exist in the
 * shell that launches the server, which is exactly the fragile condition that caused this:
 * the backend was restarted from a shell that happened not to have it, and email began
 * failing with no code change. `SMTP_CA_FILE` is read when the transporter is built, so it
 * works through the same `.env.local` as every other setting and survives a restart.
 *
 * ── Why this does not weaken TLS ──
 *
 * Certificate verification stays fully ON: `rejectUnauthorized` is never set anywhere in
 * this file, so it keeps its secure default of `true`. This only ADDS a root to the trust
 * set. Unset in production (no interception there), so production behaviour is unchanged.
 */
function extraCa(): string | null {
  const file = process.env.SMTP_CA_FILE?.trim();
  if (!file) return null;
  try {
    const pem = fs.readFileSync(file, "utf8");
    if (!pem.includes("-----BEGIN CERTIFICATE-----")) {
      console.error(`[email] SMTP_CA_FILE (${file}) contains no PEM certificate — ignoring`);
      return null;
    }
    return pem;
  } catch (error) {
    // Never fatal: a bad path must not take email offline, and the resulting TLS error is
    // self-explanatory. Say so loudly instead of failing mysteriously later.
    console.error(
      `[email] SMTP_CA_FILE (${file}) could not be read — ignoring:`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/** Mailbox address used when EMAIL_FROM is not set — falls back to the SMTP user. */
function fromAddress(): string {
  const explicit = process.env.EMAIL_FROM?.trim();
  if (explicit) return explicit;
  const user = smtpUser(process.env);
  return user ? `"MediLink" <${user}>` : "";
}

/**
 * Is outbound email configured at all?
 *
 * OAuth-aware: true when Microsoft OAuth2 is complete (tenant + client id + secret +
 * SMTP_USER), or when the legacy Basic path is complete. Callers use this to stay silent
 * instead of throwing — a clinic that has not set up mail yet should still be able to take
 * a booking. Absence of credentials is a deployment state, not an error condition.
 */
export function isEmailConfigured(): boolean {
  return resolveAuthMode(process.env).mode !== "none";
}

let cached: Transporter | null = null;

/**
 * Lazily-built singleton.
 *
 * Lazy on purpose: building it at module scope would read credentials during
 * `next build` (route modules are evaluated for page-data collection), coupling the build
 * to deployment secrets — the same reasoning as the getters in `lib/env.ts`.
 *
 * Returns null rather than throwing when unconfigured, so `sendMail` can degrade quietly.
 */
export function getTransporter(): Transporter | null {
  if (cached) return cached;

  const auth = resolveAuthMode(process.env);
  if (auth.mode === "none") {
    // Names only — never a value. Says exactly what to set.
    console.warn(describeAuthMode(auth));
    return null;
  }

  const ca = extraCa();

  const transporter = nodemailer.createTransport(
    buildTransportOptions({
      env: process.env,
      auth,
      ca,
      rootCertificates: tls.rootCertificates,
      // Basic mode only. Read here and handed straight to nodemailer; never logged, never
      // returned, and absent entirely from the OAuth path.
      password: auth.mode === "basic" ? process.env.SMTP_PASS || process.env.EMAIL_PASS : undefined,
    })
  );

  if (auth.mode === "oauth2") {
    /**
     * ── The token-expiry problem, and why this is the fix ──
     *
     * An Entra access token lives about an hour. The transporter is a long-lived pooled
     * singleton. Baking one token into it at construction would send mail for an hour and
     * then fail forever with a 535 until the process restarted — the exact trap to avoid.
     *
     * nodemailer's OAuth2 support has a provisioning hook for this. Rather than holding a
     * token, the transport asks US for one whenever a connection needs to authenticate:
     *
     *   • `getToken(renew=false)` reuses its copy while `expires > Date.now()`, so this is
     *     not called per message — only when the token is actually stale.
     *   • On an auth failure nodemailer calls back with `renew=true`; we drop our cached
     *     token so a genuinely new one is fetched instead of replaying the dead one.
     *   • Concurrent connections needing a renewal are queued by nodemailer, and our own
     *     helper de-duplicates in-flight requests, so a burst makes ONE token call.
     *
     * The pool is honoured: smtp-pool reads this callback per connection resource, so new
     * connections pick up rotated tokens without rebuilding the transporter.
     *
     * `expires` MUST be absolute epoch ms — nodemailer stores it verbatim and compares it
     * against `Date.now()`. A relative value here would make every token look expired.
     */
    transporter.set(
      "oauth2_provision_cb",
      (
        user: string,
        renew: boolean,
        callback: (err: Error | null, accessToken?: string, expires?: number) => void
      ) => {
        if (renew) invalidateAccessToken();
        getAccessToken()
          .then((token) => callback(null, token.accessToken, token.expiresAt))
          .catch((error: unknown) =>
            // The message is already sanitised by microsoftOAuth (AADSTS code + hint, no
            // credential material). Pass an Error, never the raw response.
            callback(error instanceof Error ? error : new Error(String(error)))
          );
      }
    );
  }

  cached = transporter;

  // Emitted ONCE per process (the transporter is cached), so it costs nothing and answers
  // the question that is otherwise unanswerable from outside: does this server process
  // actually have working email configuration? A payment flow that produced no email at
  // all was traced to exactly this blind spot — the code ran, and left no evidence.
  //
  // Both lines are built by pure functions in transportConfig.ts that take no secret and
  // no token, so there is no parameter through which a credential could reach the log.
  console.info(describeAuthMode(auth));
  console.info(describeTransport({ env: process.env, auth, hasExtraCa: Boolean(ca) }));

  return cached;
}

/**
 * `patient.name@example.com` → `pa***@example.com`.
 *
 * Enough to confirm a message went to the right person while keeping a full patient email
 * address out of stdout — these logs land in Vercel/terminal output, which is a wider
 * audience than the database this address came from.
 */
function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = address.slice(0, at);
  const domain = address.slice(at);
  return `${local.slice(0, 2)}***${domain}`;
}

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  /** Optional plaintext alternative. Improves deliverability and is what a screen
   *  reader or a text-only client renders. */
  text?: string;
  replyTo?: string;
};

export type SendMailResult =
  | { success: true; messageId?: string }
  /** `skipped` means SMTP is not configured — an expected deployment state, not a fault. */
  | { success: false; skipped: true }
  | { success: false; skipped?: false; error: string };

/**
 * Send one message. NEVER throws.
 *
 * Every caller here is a side effect of an operation that has already succeeded — the
 * payment is captured, the appointment is booked. Letting a dead SMTP host turn that into
 * a 500 would roll back nothing and lose the user's money or slot, so failure is logged
 * and reported in the return value instead.
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const transporter = getTransporter();
  if (!transporter) {
    const auth = resolveAuthMode(process.env);
    console.warn(
      `[email] SKIPPED "${input.subject}" → ${maskEmail(input.to)} — email is not ` +
        `configured in this process (missing: ${auth.mode === "none" ? auth.missing.join(", ") : "unknown"})`
    );
    return { success: false, skipped: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });
    // A SUCCESS log, not just a failure one. Without this, "email worked" and "email code
    // never ran" are indistinguishable in the logs — which is precisely how a silent
    // no-email flow went undiagnosed.
    console.info(`[email] sent "${input.subject}" → ${maskEmail(input.to)} (id: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    // Message only. The nodemailer error object can carry the SMTP conversation, which
    // includes the AUTH line — never log the whole thing.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[email] FAILED "${input.subject}" → ${maskEmail(input.to)} — ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Open a connection and authenticate without sending anything.
 *
 * Exists so SMTP can be proved working from a script or an ops check before anyone relies
 * on a booking to reveal that the OAuth app permission was never consented. On the OAuth
 * path this also exercises token acquisition, because the provisioning callback fires
 * during the AUTH exchange.
 */
export async function verifyTransport(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const transporter = getTransporter();
  if (!transporter) {
    const auth = resolveAuthMode(process.env);
    return {
      ok: false,
      reason:
        auth.mode === "none"
          ? `email is not configured — missing: ${auth.missing.join(", ")}`
          : "transporter unavailable",
    };
  }
  try {
    await transporter.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
