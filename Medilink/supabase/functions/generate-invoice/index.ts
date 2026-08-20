import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib";
import { requireInternalCaller } from "../_shared/internalAuth.ts";

// Invoice worker (idempotent). Flow: claim_invoice_generation (advisory-locked,
// double-checked) -> build PDF -> upload -> finalize_invoice_generation (records
// success/failure + logs the attempt). Safe under concurrency (webhook + verify +
// cron) and crashes: the claim serializes per payment and returns the existing
// invoice when one already exists, so there are never duplicates.
serve(async (req) => {
  /**
   * SERVER-TO-SERVER ONLY.
   *
   * verify_jwt alone is NOT sufficient: it only proves the caller presented a VALID project
   * JWT, and the anon key is a valid project JWT that ships publicly in every browser bundle.
   * Demonstrated on this project -- poll-refund-status had verify_jwt = true and no guard, and
   * returned 200 to the public anon key.
   *
   * Callers: the HAMS payments webhook, MediLink's lib/payments/ensureInvoice, and the
   * retry-invoices Edge Function. All three already send Bearer <service-role key>, so this
   * guard accepts every existing caller unchanged.
   *
   * requireInternalCaller accepts only the raw injected service-role key or a
   * signature-verified `role: service_role` JWT; anon and authenticated are refused 401. It is
   * placed FIRST so an unauthorized caller learns nothing -- no method check, no body parse, no
   * database access happens before it.
   *
   * ⚠️ Operational invariant from _shared/internalAuth.ts: verify_jwt must stay TRUE for this
   * function, or an unsigned forged token could claim role: service_role.
   */
  const refusal = requireInternalCaller(req, "generate-invoice");
  if (refusal) return refusal;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let paymentId: string | null = null;
  let source = "unknown";

  try {
    const body = await req.json().catch(() => ({}));
    paymentId = body?.payment_id ?? null;
    source = body?.source ?? "unknown";

    if (!paymentId) {
      return json({ error: "Missing payment_id" }, 400);
    }

    // ── 1. Claim (idempotent + concurrency-safe) ──────────────────────────
    const { data: claimRows, error: claimErr } = await admin.rpc("claim_invoice_generation", {
      p_payment_id: paymentId,
    });
    if (claimErr) return json({ error: "claim failed", details: claimErr.message }, 500);

    const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
    switch (claim?.outcome) {
      case "already_generated":
        return json({ success: true, skipped: true, reason: "already_generated", url: claim.invoice_url, invoice_number: claim.invoice_number }, 200);
      case "in_progress":
        return json({ success: false, skipped: true, reason: "in_progress" }, 200);
      case "not_paid":
        return json({ success: false, error: "payment_not_paid" }, 409);
      case "not_found":
        return json({ error: "Payment not found" }, 404);
      case "claimed":
        break; // proceed
      default:
        return json({ error: "unexpected_claim_outcome", outcome: claim?.outcome }, 500);
    }

    // ── 2. Build the invoice PDF ──────────────────────────────────────────
    const { data: payment, error: fetchErr } = await admin
      .from("payments")
      .select(`
        *,
        profiles:patient_id ( full_name, email ),
        appointments ( id, doctors ( full_name ), facilities ( name, address, logo_url ) )
      `)
      .eq("id", paymentId)
      .single();

    if (fetchErr || !payment) throw new Error(fetchErr?.message ?? "payment fetch failed");

    const invoiceNumber = payment.invoice_number || `INV-${new Date().getFullYear()}-${payment.id.slice(0, 6)}`;
    const subtotal = Number(payment.amount);
    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let y = 750;

    // deno-lint-ignore no-explicit-any
    let logo: any = null;
    const logoUrl = (payment.appointments as any)?.facilities?.logo_url;
    if (logoUrl) {
      try {
        const imgRes = await fetch(logoUrl);
        const imgBytes = await imgRes.arrayBuffer();
        const ct = imgRes.headers.get("content-type") ?? "";
        logo = ct.includes("png") ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
      } catch { /* non-fatal: continue without logo */ }
    }

    const draw = (text: string, size = 12, bold = false, x = 50) => {
      page.drawText(text, { x, y, size, font: bold ? boldFont : font, color: rgb(0, 0, 0) });
      y -= size + 8;
    };
    const divider = () => {
      y -= 10;
      page.drawLine({ start: { x: 50, y }, end: { x: 550, y }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });
      y -= 20;
    };

    if (logo) {
      const d = logo.scaleToFit(60, 60);
      page.drawImage(logo, { x: 50, y: y - d.height + 20, width: d.width, height: d.height });
      draw("HAMS - Healthcare Management System", 18, true, 125);
      draw("INVOICE", 16, true, 125);
      y -= 20;
    } else {
      draw("HAMS - Healthcare Management System", 18, true);
      draw("INVOICE", 16, true);
    }
    divider();
    draw(`Invoice No: ${invoiceNumber}`, 12, true);
    draw(`Date: ${new Date(payment.created_at).toLocaleString()}`);
    draw(`Appointment ID: ${payment.appointment_id}`);
    divider();
    draw("Facility Details", 14, true);
    draw(`Name: ${payment.appointments?.facilities?.name || "N/A"}`);
    draw(`Address: ${payment.appointments?.facilities?.address || "N/A"}`);
    divider();
    draw("Doctor", 14, true);
    draw(payment.appointments?.doctors?.full_name || "N/A");
    divider();
    draw("Patient", 14, true);
    draw(payment.profiles?.full_name || "N/A");
    draw(payment.profiles?.email || "N/A");
    divider();
    draw("Billing Details", 14, true);
    draw(`Service: Consultation`);
    draw(`Subtotal: ${subtotal.toFixed(2)} ${payment.currency}`);
    draw(`Tax (5%): ${tax.toFixed(2)} ${payment.currency}`);
    draw(`Total: ${total.toFixed(2)} ${payment.currency}`, 12, true);
    divider();
    draw("Thank you for choosing HAMS!", 12, true);
    draw("This is a system-generated invoice.", 10);

    const pdfBytes = await pdfDoc.save();

    // ── 3. Upload (deterministic path -> upsert -> no duplicates) ─────────
    const filePath = `${payment.id}.pdf`;
    const { error: uploadErr } = await admin.storage
      .from("invoices")
      .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) throw new Error(`storage upload failed: ${uploadErr.message}`);

    const { data: publicUrl } = admin.storage.from("invoices").getPublicUrl(filePath);
    const url = publicUrl.publicUrl;

    // ── 4. Finalize success (error-checked, unlike the old direct UPDATE) ─
    const { error: finErr } = await admin.rpc("finalize_invoice_generation", {
      p_payment_id: payment.id,
      p_ok: true,
      p_invoice_url: url,
      p_invoice_number: invoiceNumber,
      p_error: null,
      p_source: source,
    });
    if (finErr) throw new Error(`finalize failed: ${finErr.message}`);

    return json({ success: true, url, invoice_number: invoiceNumber }, 200);
  } catch (err) {
    // Record the failure so the payment stays a sweeper candidate (status -> 'failed').
    const message = err instanceof Error ? err.message : String(err);
    if (paymentId) {
      await admin.rpc("finalize_invoice_generation", {
        p_payment_id: paymentId, p_ok: false, p_invoice_url: null,
        p_invoice_number: null, p_error: message, p_source: source,
      }).catch(() => { /* best-effort logging */ });
    }
    return json({ error: "Invoice generation failed", details: message }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
