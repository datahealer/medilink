#!/usr/bin/env node
/**
 * Prove the Microsoft 365 SMTP mailbox works, without going through a booking.
 *
 *   node scripts/smtp-check.mjs                    # connect + authenticate only
 *   node scripts/smtp-check.mjs you@example.com    # …and send one test message
 *
 * Reads backend/.env.local (or the ambient environment, which wins). Prints the host,
 * port, TLS mode and the sending mailbox — never the password, and never the raw
 * nodemailer error object, which can carry the SMTP conversation including the AUTH line.
 *
 * Exists because the alternative way to discover that the app password expired is a
 * patient not receiving their appointment confirmation.
 */
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/**
 * Signals "stop, exit non-zero" without calling `process.exit()`.
 *
 * `process.exit()` tears the process down while `fetch`'s keep-alive socket is still open,
 * which on Windows trips a libuv assertion (`!(handle->flags & UV_HANDLE_CLOSING)`) AFTER the
 * diagnostic output. A tool whose job is to explain failures must not end in what looks like
 * a crash. Setting `process.exitCode` and letting the loop drain avoids it.
 */
class ExitFailure extends Error {}

// Turns the sentinel into a quiet non-zero exit. Top-level `throw` in an ES module surfaces
// here rather than as a catchable error, and printing a stack trace for an already-explained
// failure would bury the diagnosis under noise. Any OTHER error still prints in full.
for (const event of ["uncaughtException", "unhandledRejection"]) {
  process.on(event, (error) => {
    if (!(error instanceof ExitFailure)) console.error(error);
    process.exitCode = 1;
  });
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
// nodemailer is a backend dependency; resolve it from there rather than adding a
// duplicate at the repo root.
const require = createRequire(path.join(repoRoot, "backend", "package.json"));
const nodemailer = require("nodemailer");

/** Minimal .env reader — no dotenv dependency, and the ambient env always wins. */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(repoRoot, "backend", ".env.local"));
loadEnvFile(path.join(repoRoot, ".env"));

const user = process.env.SMTP_USER || process.env.EMAIL_USER;
const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
const host = process.env.SMTP_HOST || "smtp.office365.com";
const port = Number(process.env.SMTP_PORT || 587);
const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
const from = process.env.EMAIL_FROM || (user ? `"MediLink" <${user}>` : "");

// ── Auth mode: mirrors resolveAuthMode() in backend/src/lib/email/transportConfig.ts ──
// OAuth2 wins whenever it is fully configured; a partial OAuth setup is an error rather
// than a silent downgrade to Basic, because that downgrade is what reintroduces the 535.
const oauthMissing = [];
if (!process.env.MICROSOFT_TENANT_ID?.trim()) oauthMissing.push("MICROSOFT_TENANT_ID");
if (!process.env.MICROSOFT_CLIENT_ID?.trim()) oauthMissing.push("MICROSOFT_CLIENT_ID");
if (!(process.env.MICROSOFT_CLIENT_SECRET ?? "").trim()) oauthMissing.push("MICROSOFT_CLIENT_SECRET");
const oauthComplete = oauthMissing.length === 0;
const oauthAttempted = oauthMissing.length < 3;

if (!user) {
  console.error("✗ SMTP_USER is not set (checked backend/.env.local and the environment).");
  throw new ExitFailure();
}
if (!oauthComplete && oauthAttempted) {
  console.error(`✗ Microsoft OAuth is partially configured — missing: ${oauthMissing.join(", ")}`);
  console.error("  Refusing to fall back to password auth: Microsoft blocks it under security defaults.");
  throw new ExitFailure();
}
if (!oauthComplete && !pass) {
  console.error("✗ No usable auth: set MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET.");
  throw new ExitFailure();
}

/**
 * Client-credentials token for Exchange Online SMTP.
 *
 * Mirrors backend/src/lib/email/microsoftOAuth.ts. Neither the secret nor the token is
 * printed — only the fact of acquisition, the expiry, and a mapped error.
 */
async function getOAuthToken() {
  const tenant = process.env.MICROSOFT_TENANT_ID.trim();
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.MICROSOFT_CLIENT_ID.trim(),
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    scope: "https://outlook.office365.com/.default",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.access_token) {
    const desc = String(json?.error_description ?? "").split("\r\n")[0];
    const codes = Array.isArray(json?.error_codes) ? json.error_codes.join(",") : "";
    const hit = (c) => desc.includes(c) || codes.includes(String(c).replace("AADSTS", ""));

    console.error(`✗ OAuth token request failed (HTTP ${res.status}): ${json?.error ?? "unknown"}`);
    if (desc) console.error(`  ${desc}`);
    if (hit("AADSTS7000215")) {
      console.error("  → AADSTS7000215: the CLIENT SECRET is invalid. Check MICROSOFT_CLIENT_SECRET;");
      console.error("    Entra shows the secret VALUE only once at creation — a copied 'Secret ID' is a common mix-up.");
    } else if (hit("AADSTS7000222")) {
      console.error("  → AADSTS7000222: the client secret has EXPIRED. Issue a new one in Entra.");
    } else if (hit("AADSTS700016")) {
      console.error("  → AADSTS700016: application not found in this tenant. Check MICROSOFT_CLIENT_ID");
      console.error("    and MICROSOFT_TENANT_ID — the app may be registered in a different tenant.");
    } else if (hit("AADSTS900023")) {
      console.error("  → AADSTS900023: tenant not found. MICROSOFT_TENANT_ID is not a valid tenant.");
    } else if (hit("AADSTS500011")) {
      console.error("  → AADSTS500011: resource principal not found. The Exchange Online service");
      console.error("    principal is likely not registered in the tenant.");
    } else if (hit("AADSTS65001")) {
      console.error("  → AADSTS65001: admin consent has NOT been granted for the application permission.");
    }
    throw new ExitFailure();
  }

  return { token: json.access_token, expiresIn: Number(json.expires_in) || 0 };
}

/**
 * Report the NON-SECRET claims of an app-only token.
 *
 * The token payload is a base64url JSON segment carrying `aud`, `tid`, `appid` and — the
 * one that matters here — `roles`, the application permissions that have actually been
 * granted AND admin-consented. `roles` being empty is the difference between "Exchange
 * rejected my credentials" and "nobody ever consented the permission", which are entirely
 * different fixes. Neither the token nor its signature is printed.
 */
function inspectTokenClaims(token) {
  try {
    const seg = token.split(".")[1];
    if (!seg) return null;
    const json = Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

let oauthToken = null;
if (oauthComplete) {
  oauthToken = await getOAuthToken();
  console.log(
    `oauth   : ✓ token acquired (expires in ${Math.round(oauthToken.expiresIn / 60)} min, value not printed)`
  );

  const claims = inspectTokenClaims(oauthToken.token);
  if (claims) {
    const roles = Array.isArray(claims.roles) ? claims.roles : [];
    console.log(`          audience=${claims.aud} tenant=${claims.tid} idtyp=${claims.idtyp ?? "?"}`);
    console.log(`          granted roles: ${roles.length ? roles.join(", ") : "(none)"}`);

    if (claims.aud !== "https://outlook.office365.com") {
      console.error(
        `\n✗ Wrong token audience (${claims.aud}). SMTP needs the Exchange Online resource;\n` +
          "  a Microsoft Graph token is rejected by SMTP. Scope must be exactly\n" +
          "  https://outlook.office365.com/.default\n"
      );
      throw new ExitFailure();
    }

    if (!roles.includes("SMTP.SendAsApp")) {
      console.error("\n✗ SMTP.SendAsApp is NOT present in the token's roles claim.");
      console.error("  The app registration is valid and the secret works — but no application");
      console.error("  permission has been granted and admin-consented, so Exchange will reject");
      console.error("  AUTH with 535 no matter what else is configured. Fix this FIRST:\n");
      console.error("    Entra admin centre → App registrations → <this app> → API permissions");
      console.error("      → Add a permission → APIs my organization uses");
      console.error('      → "Office 365 Exchange Online" → Application permissions');
      console.error("      → SMTP.SendAsApp → Add");
      console.error("      → Grant admin consent for <tenant>");
      console.error("\n  Note: 'Office 365 Exchange Online' is a DIFFERENT API from Microsoft Graph.");
      console.error("  Graph Mail.Send does not enable SMTP submission and is the usual mix-up.");
      console.error("  Re-run this script afterwards — the role will appear in the claim above.\n");
      throw new ExitFailure();
    }
    console.log("          ✓ SMTP.SendAsApp granted and admin-consented");
  }
}

// Mirror the app's trust configuration exactly (see lib/email/transporter.ts). `ca`
// REPLACES Node's trust store, so the bundled roots must come first and the extra root is
// appended. Verification is never disabled.
let caBundle = null;
const caFile = process.env.SMTP_CA_FILE?.trim();
if (caFile) {
  try {
    caBundle = [...tls.rootCertificates, fs.readFileSync(caFile, "utf8")];
  } catch (e) {
    console.error(`⚠ SMTP_CA_FILE (${caFile}) unreadable — ignoring: ${e.message}`);
  }
}

console.log(`host    : ${host}:${port} (${secure ? "implicit TLS" : "STARTTLS"})`);
console.log(`auth    : ${oauthComplete ? "Microsoft OAuth2 (XOAUTH2)" : "Basic (SMTP password) — DEPRECATED"}`);
console.log(`mailbox : ${user}`);
console.log(`from    : ${from}`);
console.log(
  `tls     : verify=on, minVersion=TLSv1.2` +
    (caBundle ? `, +SMTP_CA_FILE (${caFile})` : "") +
    (process.env.NODE_EXTRA_CA_CERTS ? `, NODE_EXTRA_CA_CERTS present` : "")
);
if (secure && port === 587) {
  console.warn("⚠ SMTP_SECURE=true on port 587 — Microsoft expects STARTTLS here; this usually hangs.");
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  requireTLS: !secure,
  auth: oauthComplete
    ? { type: "OAuth2", user, accessToken: oauthToken.token, expires: Date.now() + oauthToken.expiresIn * 1000 }
    : { user, pass },
  tls: { minVersion: "TLSv1.2", ...(caBundle ? { ca: caBundle } : {}) },
  connectionTimeout: 15_000,
  greetingTimeout: 10_000,
});

try {
  await transporter.verify();
  console.log("✓ SMTP connection + authentication OK");
} catch (error) {
  console.error("✗ SMTP verify failed:", error instanceof Error ? error.message : String(error));
  // TLS interception is a distinct failure class from an auth refusal, and it happens
  // EARLIER in the handshake — so it masks the auth state entirely. Diagnose it separately
  // and name the intercepting CA rather than leaving a bare OpenSSL string.
  if (/self.signed|unable to (verify|get local issuer)|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(String(error?.message))) {
    console.error(
      "\n  This is a TLS TRUST failure, not an authentication failure — the handshake\n" +
        "  never reached AUTH, so it tells you nothing about the credentials.\n"
    );
    console.error("  Cause: something is intercepting outbound TLS and re-signing it with a");
    console.error("  private root (endpoint antivirus 'mail shield', or a corporate proxy).");
    console.error("  Node ignores the OS certificate store, so it does not trust that root.\n");
    console.error("  Fix — keeps verification fully ON, never use rejectUnauthorized:false:");
    console.error("    1. Export the interception root as PEM (it is already in the Windows store).");
    console.error("    2. Set SMTP_CA_FILE=<path to that .pem> in backend/.env.local");
    console.error("    3. Restart the backend.");
    console.error("  Alternatives: run Node with --use-system-ca, or set NODE_EXTRA_CA_CERTS");
    console.error("  in the shell BEFORE starting the server (it is read at process start,");
    console.error("  so putting it in .env.local has no effect).");
    console.error("  Production is unaffected: there is no interception there, so leave SMTP_CA_FILE unset.\n");
    throw new ExitFailure();
  }

  const msg = String(error?.message ?? "");

  if (oauthComplete) {
    // The token was already acquired successfully above, so Entra is satisfied that the
    // APPLICATION is valid. A 535 at this point is therefore an EXCHANGE-side authorisation
    // problem, not a credential problem — a genuinely different fix, so say so.
    console.error("\n  The OAuth token was acquired successfully, so the app registration and");
    console.error("  client secret are valid. A 535 here is an EXCHANGE authorisation problem:\n");
    console.error("    1. Office 365 Exchange Online → SMTP.SendAsApp APPLICATION permission");
    console.error("       must be added to the app registration, with ADMIN CONSENT granted.");
    console.error("       (Graph 'Mail.Send' is NOT sufficient and is a common mix-up.)");
    console.error("    2. The Exchange service principal must exist:");
    console.error("       New-ServicePrincipal -AppId <client-id> -ObjectId <entra-object-id>");
    console.error("    3. It must be granted rights on the mailbox:");
    console.error(`       Add-MailboxPermission -Identity "${user}" -User <sp-object-id> -AccessRights FullAccess`);
    console.error("    4. SMTP AUTH must be enabled for the mailbox:");
    console.error(`       Set-CASMailbox -Identity "${user}" -SmtpClientAuthenticationDisabled $false`);
    console.error("\n  Note: 535 5.7.139 with OAuth usually means step 1, 2 or 3 is missing.");
    console.error("  Changes can take 15-60 minutes to propagate across Exchange Online.\n");
    throw new ExitFailure();
  }

  // Basic-auth path. The 535 sub-message matters more than the code — these are three
  // different administrative blocks that all surface as 535 5.7.139.
  console.error("  Common causes, matched on the message text above:");
  console.error(
    '    • "SmtpClientAuthentication is disabled for the Tenant" → Exchange: ' +
      "Set-CASMailbox -Identity <mailbox> -SmtpClientAuthenticationDisabled $false"
  );
  console.error(
    '    • "locked by your organization\'s security defaults policy" → Entra security ' +
      "defaults block legacy auth. Do NOT disable them — migrate to OAuth2 by setting " +
      "MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET."
  );
  console.error("    • MFA on the account without an app password");
  console.error("    • Wrong port/TLS combination (587 needs STARTTLS, i.e. SMTP_SECURE=false)");
  void msg;
  throw new ExitFailure();
}

const recipient = process.argv[2];
if (!recipient) {
  console.log("\n(no recipient argument — connection verified, nothing sent)");
  transporter.close();
} else {
  try {
    const info = await transporter.sendMail({
      from,
      to: recipient,
      subject: "MediLink SMTP test",
      text: "If you are reading this, MediLink transactional email is working.",
      html:
        '<div style="font-family:sans-serif;padding:16px">' +
        '<h2 style="color:#2E1A47;margin:0 0 8px">MediLink SMTP test</h2>' +
        "<p>If you are reading this, MediLink transactional email is working.</p></div>",
    });
    // "Accepted for delivery by Exchange" — NOT proof it reached the inbox.
    console.log(`✓ Test message ACCEPTED by the server for ${recipient} (id: ${info.messageId})`);
    console.log("  (server acceptance only — confirm arrival in the recipient's inbox)");
  } catch (error) {
    console.error("✗ Send failed:", error instanceof Error ? error.message : String(error));
    throw new ExitFailure();
  } finally {
    transporter.close();
  }
}
