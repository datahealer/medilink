/**
 * Structural invariants of the email layer.
 *
 * These assert on SOURCE rather than behaviour, deliberately. The property being protected
 * is architectural: there must be exactly one place that constructs a mail transport, and
 * every trigger must route through it. That is precisely what regressed before — three
 * modules each built their own Gmail transport, so a provider change had to be made in
 * three files and was missed in one.
 *
 * Behavioural tests cannot catch a NEW second transporter appearing in a fourth file;
 * a source invariant can. It also means the OAuth migration cannot be quietly bypassed by
 * a future module going back to a password.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const EMAIL_DIR = path.resolve(import.meta.dirname, "..");
const BACKEND_SRC = path.resolve(EMAIL_DIR, "../..");

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function emailModules(): string[] {
  return fs
    .readdirSync(EMAIL_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.join(EMAIL_DIR, f));
}

/* ── 10. Existing email triggers still route through the shared transporter ── */

test("exactly ONE module constructs a mail transport", () => {
  const offenders = emailModules().filter(
    (file) => /createTransport\s*\(/.test(read(file)) && path.basename(file) !== "transporter.ts"
  );
  assert.deepEqual(
    offenders.map((f) => path.basename(f)),
    [],
    "only transporter.ts may call nodemailer.createTransport"
  );
});

test("no email module imports nodemailer except the transporter", () => {
  const offenders = emailModules().filter(
    (file) => /from ["']nodemailer["']/.test(read(file)) && path.basename(file) !== "transporter.ts"
  );
  assert.deepEqual(offenders.map((f) => path.basename(f)), []);
});

for (const module of [
  "sendAppointment.ts",
  "sendInvoice.ts",
  "sendNotification.ts",
  "sendInvite.ts",
]) {
  test(`${module} still sends through the shared sendMail()`, () => {
    const source = read(path.join(EMAIL_DIR, module));
    assert.match(
      source,
      /import\s*\{[^}]*\bsendMail\b[^}]*\}\s*from\s*["']\.\/transporter["']/,
      "must import sendMail from ./transporter"
    );
    assert.match(source, /\bsendMail\s*\(/, "must actually call sendMail");
  });
}

test("the appointment email templates cover all three lifecycle kinds", () => {
  const source = read(path.join(EMAIL_DIR, "sendAppointment.ts"));
  for (const kind of ["booked", "cancelled", "rescheduled"]) {
    assert.match(source, new RegExp(`\\b${kind}\\b`), `${kind} template must exist`);
  }
});

test("the payment paths still trigger the receipt and confirmation emails", () => {
  // The OAuth migration happens strictly underneath these; if an import disappears, the
  // migration silently removed a user-visible email.
  const verify = read(path.join(BACKEND_SRC, "app/api/payments/verify/route.ts"));
  const webhook = read(path.join(BACKEND_SRC, "app/api/payments/webhook/route.ts"));

  assert.match(verify, /sendInvoiceEmail/, "verify must still send the payment receipt");
  assert.match(verify, /sendAppointmentEmailForUser/, "verify must still send the confirmation");
  assert.match(webhook, /sendInvoiceEmail/, "webhook must still send the payment receipt");
  assert.match(webhook, /sendAppointmentEmailForUser/, "webhook must still send the confirmation");
});

test("the appointment email route still handles all three kinds", () => {
  const route = read(path.join(BACKEND_SRC, "app/api/appointments/[id]/email/route.ts"));
  assert.match(route, /sendAppointmentEmail/);
  for (const kind of ["booked", "cancelled", "rescheduled"]) {
    assert.match(route, new RegExp(`"${kind}"`), `${kind} must remain an accepted kind`);
  }
});

/* ── TLS and credential invariants across the whole email layer ───────────── */

test("no email module disables certificate verification", () => {
  for (const file of emailModules()) {
    const source = read(file);
    assert.ok(
      !/rejectUnauthorized\s*:/.test(source),
      `${path.basename(file)} must not set rejectUnauthorized`
    );
    assert.ok(
      !/NODE_TLS_REJECT_UNAUTHORIZED/.test(source),
      `${path.basename(file)} must not touch NODE_TLS_REJECT_UNAUTHORIZED`
    );
  }
});

test("the transporter still pins TLS 1.2 and requires STARTTLS via transportConfig", () => {
  const config = read(path.join(EMAIL_DIR, "transportConfig.ts"));
  assert.match(config, /minVersion:\s*"TLSv1\.2"/);
  assert.match(config, /requireTLS:\s*!secure/);
});

test("SMTP_CA_FILE support is intact in the transporter", () => {
  const source = read(path.join(EMAIL_DIR, "transporter.ts"));
  assert.match(source, /SMTP_CA_FILE/, "the extra-CA escape hatch must remain");
});

test("the transporter registers the OAuth2 provisioning callback", () => {
  // Without this, a token would be baked into the pooled transporter and every send would
  // fail once it expired.
  const source = read(path.join(EMAIL_DIR, "transporter.ts"));
  assert.match(source, /oauth2_provision_cb/, "token rotation depends on this hook");
  assert.match(source, /invalidateAccessToken\s*\(\s*\)/, "renew must drop the cached token");
});

test("no Microsoft OAuth variable is exposed to a client bundle", () => {
  // NEXT_PUBLIC_/EXPO_PUBLIC_ prefixes are inlined into shipped bundles.
  for (const file of [...emailModules(), path.join(EMAIL_DIR, "__tests__/microsoftOAuth.test.ts")]) {
    if (!fs.existsSync(file)) continue;
    const source = read(file);
    assert.ok(
      !/(NEXT_PUBLIC|EXPO_PUBLIC)_MICROSOFT/.test(source),
      `${path.basename(file)} must not expose Microsoft OAuth config publicly`
    );
  }
});
