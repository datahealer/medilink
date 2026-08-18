/**
 * Public support contact channels, and the `mailto:` composer the contact form uses.
 *
 * ── WHAT WAS WRONG ──
 *
 * `app/contact/page.tsx` rendered a full name/email/topic/message form whose submit handler was:
 *
 *     function handleSubmit(e) { e.preventDefault(); setSent(true); }
 *
 * No network call of any kind. It then displayed "Message sent!" / "تم الإرسال!" and promised
 * "We'll get back to you within one business day."
 *
 * For a healthcare product that is not a cosmetic defect. A patient reporting a problem with
 * their care — a wrong appointment, a billing error, a safeguarding concern — was told their
 * message had been received and would be answered, and nobody ever received anything. It is the
 * same class of defect as the invented lab-test and surgery prices removed in c5a5f3a, and it
 * survived that cleanup.
 *
 * The three contact options beside the form were placeholders (`hello@medilink.om`,
 * `+968 9000 0000` as both phone and WhatsApp), and the SAME placeholders appear in
 * `components/home/HomeFooter.tsx`, which renders on every marketing page. So the fake number
 * was published site-wide, not just on /contact.
 *
 * ── WHY A mailto COMPOSER AND NOT A BACKEND ENDPOINT ──
 *
 * There is no contact/support backend in this project: no route, no table, and no
 * support-inbox variable — the email config has `EMAIL_FROM` (a sender) and SMTP credentials,
 * but no destination. Building a real submission flow would need all of:
 *
 *   • a new public, unauthenticated endpoint that sends mail — i.e. an open relay unless it is
 *     also given rate limiting and abuse controls;
 *   • a destination inbox, which is a business decision, not something to invent;
 *   • validation and a delivery-failure story.
 *
 * A `mailto:` composer needs none of that and cannot lie. The user's own mail client opens with
 * the message pre-filled; they see it and press send themselves, so "sent" is their action and
 * their record, not a claim this app makes on their behalf. No server, no credentials, no spam
 * surface, no false SLA.
 *
 * ── EVERY CHANNEL IS CONFIGURATION, AND ABSENCE IS HONEST ──
 *
 * Nothing here is hardcoded. When a channel is unset the UI omits it, and when NO channel is
 * configured the form is replaced by a truthful "not yet available" message. That is the
 * important property: the failure mode of missing configuration is now silence, not a fake
 * phone number.
 *
 * These are `NEXT_PUBLIC_*` because they are meant to be published — a support address is the
 * opposite of a secret. They are build-inlined like every other `NEXT_PUBLIC_*` value, so
 * changing one needs a redeploy.
 */

/** Trim-and-treat-blank-as-absent, so `VAR=""` behaves the same as an unset var. */
function value(raw: string | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Read literally, never through a computed key.
 *
 * `lib/env.ts` documents why at length: Next inlines `process.env.NEXT_PUBLIC_X` by substituting
 * the exact member expression at build time. A dynamic `process.env[name]` is never substituted
 * and resolves to `undefined` in the browser, which once shipped as a bug where the build and
 * SSR both passed and the client threw.
 */
export interface SupportEnv {
  email?: string;
  phone?: string;
  whatsapp?: string;
}

const RAW: SupportEnv = {
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE,
  whatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
};

/** A very permissive address check — enough to reject an obvious placeholder or a typo. */
function isEmailish(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/**
 * E.164-ish digits for a `tel:` / `wa.me` href.
 *
 * Returns null unless the value looks like a real international number: 8–15 digits after an
 * optional `+`. Deliberately strict enough that `+968 9000 0000` — the placeholder that was
 * shipped — still passes the shape test, because shape cannot prove a number is real. That is
 * why the variable being UNSET is the safe default: we validate format, the operator supplies
 * truth.
 */
function telDigits(v: string): string | null {
  const digits = v.replace(/[^\d+]/g, "");
  const bare = digits.startsWith("+") ? digits.slice(1) : digits;
  if (!/^\d{8,15}$/.test(bare)) return null;
  return bare;
}

export interface SupportChannel {
  kind: "email" | "phone" | "whatsapp";
  /** What to display. */
  detail: string;
  /** Where it links. */
  href: string;
}

/** The channels that are actually configured. Empty when none are. */
export function supportChannels(env: SupportEnv = RAW): SupportChannel[] {
  const out: SupportChannel[] = [];

  const email = value(env.email);
  if (email && isEmailish(email)) {
    out.push({ kind: "email", detail: email, href: `mailto:${email}` });
  }

  const phone = value(env.phone);
  const phoneDigits = phone ? telDigits(phone) : null;
  if (phone && phoneDigits) {
    out.push({ kind: "phone", detail: phone, href: `tel:+${phoneDigits}` });
  }

  // Falls back to the phone number when a separate WhatsApp number is not configured, which is
  // the common case for a small operation — but only when the phone itself is configured.
  const whatsappRaw = value(env.whatsapp) ?? phone;
  const whatsappDigits = whatsappRaw ? telDigits(whatsappRaw) : null;
  if (whatsappRaw && whatsappDigits) {
    out.push({ kind: "whatsapp", detail: whatsappRaw, href: `https://wa.me/${whatsappDigits}` });
  }

  return out;
}

/** The configured support address, or null. The contact form needs this specifically. */
export function supportEmail(env: SupportEnv = RAW): string | null {
  const email = value(env.email);
  return email && isEmailish(email) ? email : null;
}

/** Can the contact form do anything real? */
export function canComposeMessage(env: SupportEnv = RAW): boolean {
  return supportEmail(env) !== null;
}

export interface ContactDraft {
  name: string;
  email: string;
  topic: string;
  message: string;
}

/**
 * Build the `mailto:` URL that opens the visitor's mail client with the message pre-filled.
 *
 * Returns null when no support address is configured — the caller must not render a submit
 * control in that case.
 *
 * ── HEADER-INJECTION SAFETY ──
 *
 * Everything interpolated is user input from a public, unauthenticated form, and it lands in a
 * URL whose query parameters some mail clients map onto real message headers. A bare CR or LF in
 * `subject` is the classic way to smuggle an extra header (a `Bcc:`, say).
 *
 * Two defences, both needed: CR/LF are stripped from the subject before encoding, and every
 * component is passed through `encodeURIComponent`, which percent-encodes `%0A`, `&`, `?` and
 * `=` so none of them can terminate a parameter or start a new one. The subject is also length-
 * capped, because a megabyte of pasted text in a URL is its own denial of service against the
 * mail client.
 */
export function buildMailtoUrl(draft: ContactDraft, env: SupportEnv = RAW): string | null {
  const to = supportEmail(env);
  if (!to) return null;

  const oneLine = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

  const topic = oneLine(draft.topic).slice(0, 80);
  const name = oneLine(draft.name).slice(0, 80);
  const subject = [topic || "Website enquiry", name && `— ${name}`].filter(Boolean).join(" ").slice(0, 160);

  /**
   * The body keeps its newlines: they are legal in a body and encodeURIComponent turns them into
   * %0A, which cannot break out of the parameter.
   *
   * The header lines are filtered SEPARATELY from the message, because the blank line between
   * them is deliberate and a single combined filter would either delete that separator or,
   * filtering only for `undefined`/`false`, delete nothing at all — every element here is a
   * string, and an omitted line is `""`, not a nullish value.
   */
  const headerLines = [
    name && `Name: ${name}`,
    draft.email.trim() && `Email: ${oneLine(draft.email)}`,
    topic && `Topic: ${topic}`,
  ].filter((line) => line !== "");

  const body = [...headerLines, "", draft.message.trim()].join("\n").slice(0, 4000);

  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
