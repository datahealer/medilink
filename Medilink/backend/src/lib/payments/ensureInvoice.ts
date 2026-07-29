export type InvoiceSource = "webhook" | "verify" | "manual";

export type InvoiceOutcome =
  | "generated"
  | "already_generated"
  | "in_progress"
  | "not_paid"
  | "failed";

export interface EnsureInvoiceResult {
  ok: boolean;
  url: string | null;
  invoiceNumber: string | null;
  outcome: InvoiceOutcome;
}

/**
 * Trigger the idempotent invoice worker (`generate-invoice` edge function) for a
 * payment. Safe to call from multiple paths concurrently (webhook, verify, manual
 * regenerate): the edge function claims per-payment via a DB advisory lock and returns
 * the existing invoice when one already exists — so this NEVER creates duplicates.
 *
 * NON-FATAL by contract: an invoice failure must never block payment confirmation. On
 * failure the payment row is marked `invoice_status='failed'` (by the edge function's
 * finalize step) and the recovery sweeper retries it later.
 */
export async function ensureInvoice(
  paymentId: string,
  source: InvoiceSource,
): Promise<EnsureInvoiceResult> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const failed = (outcome: InvoiceOutcome = "failed"): EnsureInvoiceResult => ({
    ok: false,
    url: null,
    invoiceNumber: null,
    outcome,
  });

  if (!baseUrl || !serviceKey) {
    console.error(`[ensureInvoice:${source}] missing Supabase env`);
    return failed();
  }

  try {
    const res = await fetch(`${baseUrl}/functions/v1/generate-invoice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payment_id: paymentId, source }),
    });
    const body = (await res.json().catch(() => null)) as
      | { success?: boolean; skipped?: boolean; reason?: string; url?: string; invoice_number?: string }
      | null;

    if (!res.ok) {
      console.error(`[ensureInvoice:${source}] generation failed (${res.status})`, body);
      return failed(res.status === 409 ? "not_paid" : "failed");
    }

    if (body?.reason === "in_progress") return failed("in_progress");

    return {
      ok: true,
      url: body?.url ?? null,
      invoiceNumber: body?.invoice_number ?? null,
      outcome: body?.reason === "already_generated" ? "already_generated" : "generated",
    };
  } catch (err) {
    console.error(`[ensureInvoice:${source}] error`, err instanceof Error ? err.message : err);
    return failed();
  }
}
