/**
 * Tests for the transport configuration decisions: which auth mode applies, what nodemailer
 * options result, and what the log line says.
 *
 * These are the safety properties of the OAuth migration, so they are asserted rather than
 * assumed:
 *   • OAuth2 wins whenever it is configured.
 *   • A partial OAuth config NEVER silently downgrades to a password.
 *   • TLS is never weakened — no rejectUnauthorized, ever, in any branch.
 *   • The bundled CA roots are retained when an extra root is added.
 *   • No log line can carry a secret or a token.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildTransportOptions,
  describeAuthMode,
  describeTransport,
  resolveAuthMode,
  resolveHost,
  resolvePort,
  resolveSecure,
  smtpUser,
  DEFAULT_HOST,
  DEFAULT_PORT,
} from "../transportConfig.ts";

const MAILBOX = "alerts@medilink.om";
const SECRET = "entra-client-secret-value";
const PASSWORD = "legacy-smtp-password";

const OAUTH_ENV = {
  MICROSOFT_TENANT_ID: "tenant-abc",
  MICROSOFT_CLIENT_ID: "client-abc",
  MICROSOFT_CLIENT_SECRET: SECRET,
  SMTP_USER: MAILBOX,
};

const ROOTS = ["-----BEGIN CERTIFICATE-----\nROOT-A\n-----END CERTIFICATE-----"] as const;
const EXTRA_CA = "-----BEGIN CERTIFICATE-----\nINTERCEPTION-ROOT\n-----END CERTIFICATE-----";

/* ── 9. Auth-mode resolution ──────────────────────────────────────────────── */

test("full OAuth config selects OAuth2", () => {
  const auth = resolveAuthMode(OAUTH_ENV);
  assert.equal(auth.mode, "oauth2");
  assert.equal(auth.mode === "oauth2" && auth.user, MAILBOX);
});

test("OAuth2 is PREFERRED over a present SMTP_PASS", () => {
  // The whole point of the migration: a leftover password must not keep Basic auth alive.
  const auth = resolveAuthMode({ ...OAUTH_ENV, SMTP_PASS: PASSWORD });
  assert.equal(auth.mode, "oauth2");
});

test("a PARTIAL OAuth config does NOT silently fall back to Basic", () => {
  // This is the trap being closed: half-configured OAuth plus a password previously meant
  // the app kept using the password and kept getting 535.
  const auth = resolveAuthMode({
    MICROSOFT_TENANT_ID: "tenant-abc",
    MICROSOFT_CLIENT_ID: "client-abc",
    // secret absent
    SMTP_USER: MAILBOX,
    SMTP_PASS: PASSWORD,
  });
  assert.equal(auth.mode, "none");
  assert.deepEqual(auth.mode === "none" && auth.missing, ["MICROSOFT_CLIENT_SECRET"]);
});

test("no OAuth variables at all still allows the legacy Basic path", () => {
  const auth = resolveAuthMode({ SMTP_USER: MAILBOX, SMTP_PASS: PASSWORD });
  assert.equal(auth.mode, "basic");
});

test("OAuth complete but SMTP_USER missing is reported as missing SMTP_USER", () => {
  const auth = resolveAuthMode({ ...OAUTH_ENV, SMTP_USER: undefined });
  assert.equal(auth.mode, "none");
  assert.deepEqual(auth.mode === "none" && auth.missing, ["SMTP_USER"]);
});

test("nothing configured reports both Basic variables by name", () => {
  const auth = resolveAuthMode({});
  assert.equal(auth.mode, "none");
  assert.deepEqual(auth.mode === "none" && auth.missing, ["SMTP_USER", "SMTP_PASS"]);
});

test("legacy EMAIL_USER is still honoured as the mailbox", () => {
  assert.equal(smtpUser({ EMAIL_USER: MAILBOX }), MAILBOX);
  assert.equal(smtpUser({ SMTP_USER: MAILBOX, EMAIL_USER: "other@x.com" }), MAILBOX);
});

/* ── Host / port / TLS resolution ─────────────────────────────────────────── */

test("defaults to the Microsoft submission endpoint on STARTTLS", () => {
  assert.equal(resolveHost({}), DEFAULT_HOST);
  assert.equal(resolveHost({}), "smtp.office365.com");
  assert.equal(resolvePort({}), DEFAULT_PORT);
  assert.equal(resolvePort({}), 587);
  assert.equal(resolveSecure({}), false, "587 must stay on STARTTLS");
});

test("a non-numeric SMTP_PORT falls back rather than producing NaN", () => {
  assert.equal(resolvePort({ SMTP_PORT: "not-a-port" }), DEFAULT_PORT);
});

test("SMTP_SECURE is explicit opt-in only", () => {
  assert.equal(resolveSecure({ SMTP_SECURE: "true" }), true);
  assert.equal(resolveSecure({ SMTP_SECURE: "TRUE" }), true);
  assert.equal(resolveSecure({ SMTP_SECURE: "1" }), false, "only the literal 'true' enables it");
  assert.equal(resolveSecure({ SMTP_SECURE: "yes" }), false);
});

/* ── Transport options ────────────────────────────────────────────────────── */

test("OAuth2 options carry type OAuth2 and the mailbox, and NO token", () => {
  const options = buildTransportOptions({
    env: OAUTH_ENV,
    auth: resolveAuthMode(OAUTH_ENV),
    ca: null,
    rootCertificates: ROOTS,
  });

  assert.deepEqual(options.auth, { type: "OAuth2", user: MAILBOX });
  // A baked-in token is exactly the bug the provisioning callback exists to avoid: it would
  // work for an hour and then fail permanently.
  assert.ok(!("accessToken" in options.auth), "no static token may be embedded");
  assert.ok(!("pass" in options.auth), "no password on the OAuth path");
  assert.ok(!JSON.stringify(options).includes(SECRET), "the client secret must not reach transport options");
});

test("TLS is never weakened, on either auth path", () => {
  for (const env of [OAUTH_ENV, { SMTP_USER: MAILBOX, SMTP_PASS: PASSWORD }]) {
    const options = buildTransportOptions({
      env,
      auth: resolveAuthMode(env),
      ca: null,
      rootCertificates: ROOTS,
      password: PASSWORD,
    });
    assert.equal(options.tls.minVersion, "TLSv1.2");
    assert.equal(options.requireTLS, true, "STARTTLS must be mandatory");
    assert.ok(
      !Object.prototype.hasOwnProperty.call(options.tls, "rejectUnauthorized"),
      "rejectUnauthorized must never be set"
    );
    assert.ok(!JSON.stringify(options).includes("rejectUnauthorized"));
  }
});

test("an extra CA is APPENDED to the bundled roots, never replacing them", () => {
  // Passing `ca` replaces Node's trust store. Supplying only the interception root would
  // break every ordinary Office 365 chain in an environment without that proxy.
  const options = buildTransportOptions({
    env: OAUTH_ENV,
    auth: resolveAuthMode(OAUTH_ENV),
    ca: EXTRA_CA,
    rootCertificates: ROOTS,
  });

  assert.ok(options.tls.ca, "ca should be set");
  assert.equal(options.tls.ca!.length, ROOTS.length + 1);
  assert.equal(options.tls.ca![0], ROOTS[0], "bundled roots come first");
  assert.equal(options.tls.ca!.at(-1), EXTRA_CA, "extra root is appended");
});

test("no extra CA means no ca key at all, leaving Node's defaults untouched", () => {
  const options = buildTransportOptions({
    env: OAUTH_ENV,
    auth: resolveAuthMode(OAUTH_ENV),
    ca: null,
    rootCertificates: ROOTS,
  });
  assert.equal(options.tls.ca, undefined);
});

test("pooling stays on so token rotation is per-connection, not per-process", () => {
  const options = buildTransportOptions({
    env: OAUTH_ENV,
    auth: resolveAuthMode(OAUTH_ENV),
    ca: null,
    rootCertificates: ROOTS,
  });
  assert.equal(options.pool, true);
  assert.equal(options.host, "smtp.office365.com");
  assert.equal(options.port, 587);
  assert.equal(options.secure, false);
});

test("building options with no usable auth throws rather than sending unauthenticated", () => {
  assert.throws(() =>
    buildTransportOptions({
      env: {},
      auth: resolveAuthMode({}),
      ca: null,
      rootCertificates: ROOTS,
    })
  );
});

/* ── Log lines ────────────────────────────────────────────────────────────── */

test("the auth-mode banner names Microsoft OAuth2 exactly", () => {
  assert.equal(describeAuthMode(resolveAuthMode(OAUTH_ENV)), "[email] auth mode: Microsoft OAuth2");
});

test("the Basic banner is explicitly marked deprecated", () => {
  const line = describeAuthMode(resolveAuthMode({ SMTP_USER: MAILBOX, SMTP_PASS: PASSWORD }));
  assert.match(line, /Basic/);
  assert.match(line, /DEPRECATED/);
});

test("the not-configured banner lists the missing NON-SECRET names", () => {
  const line = describeAuthMode(resolveAuthMode({}));
  assert.match(line, /NOT CONFIGURED/);
  assert.match(line, /SMTP_USER/);
});

test("the ready line reports host, port, STARTTLS, OAuth2, verify=on and the mailbox", () => {
  const line = describeTransport({
    env: OAUTH_ENV,
    auth: { mode: "oauth2", user: MAILBOX },
    hasExtraCa: false,
  });
  assert.equal(
    line,
    `[email] transporter ready: smtp.office365.com:587 (STARTTLS, OAuth2, verify=on) as ${MAILBOX}`
  );
});

test("the ready line notes an extra CA root when one is in use", () => {
  const line = describeTransport({
    env: OAUTH_ENV,
    auth: { mode: "oauth2", user: MAILBOX },
    hasExtraCa: true,
  });
  assert.match(line, /\+SMTP_CA_FILE root/);
  assert.match(line, /verify=on/);
});

test("no log line can contain the secret or a password", () => {
  const lines = [
    describeAuthMode(resolveAuthMode({ ...OAUTH_ENV, SMTP_PASS: PASSWORD })),
    describeTransport({ env: { ...OAUTH_ENV, SMTP_PASS: PASSWORD }, auth: { mode: "oauth2", user: MAILBOX }, hasExtraCa: true }),
    describeAuthMode(resolveAuthMode({ SMTP_USER: MAILBOX, SMTP_PASS: PASSWORD })),
    describeTransport({ env: { SMTP_USER: MAILBOX, SMTP_PASS: PASSWORD }, auth: { mode: "basic", user: MAILBOX }, hasExtraCa: false }),
  ].join("\n");

  assert.ok(!lines.includes(SECRET), "client secret must never be logged");
  assert.ok(!lines.includes(PASSWORD), "SMTP password must never be logged");
});
