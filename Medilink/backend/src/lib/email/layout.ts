/**
 * Shared HTML shell for every application email.
 *
 * Email clients are not browsers: Outlook renders through Word's HTML engine, Gmail
 * strips <style> blocks in some contexts, and flexbox/grid are unavailable. So this is
 * table-based layout with inline styles — deliberately, not carelessly.
 *
 * The `escapeHtml` helper is the important part. The previous templates interpolated
 * values straight into markup (`<h2>Hello ${opts.name}</h2>`, `<p>${message}</p>`), so a
 * patient whose display name contained `<` produced broken output, and any operator-
 * supplied announcement body was raw HTML injection into every recipient's inbox. Every
 * interpolation below goes through `escapeHtml`.
 */

const BRAND = "#2E1A47";
const INK = "#1A1A1A";
const MUTED = "#6B6B6B";
const BORDER = "#E7E3ED";

/** HTML-escape an untrusted value destined for an email body. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape a URL for an `href`.
 *
 * Escaping alone is not enough: `javascript:` and `data:` URIs survive HTML escaping
 * intact and some clients still follow them. Anything that is not http(s) becomes "#".
 */
export function safeUrl(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!/^https?:\/\//i.test(raw)) return "#";
  return escapeHtml(raw);
}

export type EmailRow = { label: string; value: string };

/** A label/value detail table — appointment date, doctor, invoice number, and so on. */
export function detailRows(rows: EmailRow[]): string {
  const cells = rows
    .filter((r) => r.value)
    .map(
      (r) => `
        <tr>
          <td style="padding:8px 0;color:${MUTED};font-size:14px;vertical-align:top;width:40%">${escapeHtml(r.label)}</td>
          <td style="padding:8px 0;color:${INK};font-size:14px;font-weight:600">${escapeHtml(r.value)}</td>
        </tr>`
    )
    .join("");

  if (!cells) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
            style="margin:20px 0;border-top:1px solid ${BORDER};border-bottom:1px solid ${BORDER}">
            ${cells}
          </table>`;
}

/** A single call-to-action button. Omitted entirely when `url` is not a real http(s) link. */
export function ctaButton(label: string, url: string | null | undefined): string {
  const href = safeUrl(url);
  if (href === "#") return "";
  return `<p style="margin:28px 0">
            <a href="${href}"
               style="background:${BRAND};color:#FFFFFF;padding:13px 26px;border-radius:8px;
                      text-decoration:none;display:inline-block;font-size:15px;font-weight:600">
              ${escapeHtml(label)}
            </a>
          </p>`;
}

export type RenderEmailInput = {
  /** Shown as the <h1>. Not the subject line — pass that separately to sendMail. */
  heading: string;
  /** Inbox preview text. Hidden in the rendered body. */
  preheader?: string;
  /** Pre-escaped HTML. Build it from the helpers above; never concatenate raw input. */
  body: string;
};

/**
 * Wrap pre-built body HTML in the MediLink shell.
 *
 * `heading` is escaped here; `body` is NOT — it is expected to already be safe, which is
 * why the only way to put a value into it should be `escapeHtml` / `detailRows` /
 * `ctaButton`.
 */
export function renderEmail({ heading, preheader, body }: RenderEmailInput): string {
  const preview = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#F5F3F8">
    ${preview}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F5F3F8;padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;
                        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
            <tr>
              <td style="background:${BRAND};padding:20px 28px">
                <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:0.3px">MediLink</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px">
                <h1 style="margin:0 0 14px;color:${INK};font-size:20px;font-weight:700">${escapeHtml(heading)}</h1>
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;border-top:1px solid ${BORDER};color:${MUTED};font-size:12px;line-height:1.6">
                This is an automated message from MediLink — please do not reply.<br />
                If you did not expect this email you can safely ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Strip tags for the plaintext alternative. Crude by design — it only ever sees our
 *  own generated markup, not arbitrary HTML. */
export function toPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|tr|h1|h2|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}
