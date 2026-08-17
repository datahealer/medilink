import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";
import { serverErrorResponse } from "@/lib/http/serverError";
import {
  INVOICES_BUCKET,
  INVOICE_SIGNED_URL_TTL_SECONDS,
  invoiceObjectPath,
  isPaymentId,
} from "@/lib/payments/invoiceObject";

/**
 * GET /api/payments/{id}/invoice — download a patient's own invoice PDF.
 *
 * ── WHAT CHANGED AND WHY ──
 *
 * This route always authenticated the caller and always filtered on
 * `patient_id = auth.uid()`. That part was right. What it then did was 302 to
 * `payments.invoice_url` — a PUBLIC, permanently-valid storage URL — which made the
 * authorization above decorative: whoever held the link read the PHI without a session.
 *
 * Now the route mints a SHORT-LIVED SIGNED URL for the object instead, so the redirect
 * target is only usable for a few minutes and cannot be replayed by anyone who did not pass
 * the check above. Paired with migration 20260817000000, which closes the bucket.
 *
 * ── THE OBJECT IS ADDRESSED BY PAYMENT ID, NOT BY THE STORED URL ──
 *
 * `invoice_url` is read ONLY as an existence flag. The path handed to Storage is derived
 * from `id`, which the query below has already proven belongs to the caller. A wrong or
 * tampered `invoice_url` therefore cannot make this route sign somebody else's object. See
 * lib/payments/invoiceObject.ts for the full argument.
 *
 * ── TWO RESPONSE SHAPES ──
 *
 *   default        302 to the signed URL. What an email link and a browser need.
 *   ?format=json   { url, expiresIn }. For clients that cannot follow a redirect while
 *                  attaching a bearer token — the mobile app opens and shares the PDF
 *                  itself, and `Linking.openURL` cannot set an Authorization header.
 *
 * Both shapes run the identical authentication and ownership check first; `format` only
 * decides how the already-authorized result is delivered.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // Reject a malformed id before it reaches the database or Storage. Cheap, and it keeps
    // anything that is not a UUID out of the object path entirely.
    if (!isPaymentId(id)) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // 1. Authenticate the caller (same cookie/bearer session as GET /api/payments).
    const supabaseAuth = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabaseAuth);

    // 2. Service client + OWNERSHIP filter — payments.patient_id is the auth user id (see
    //    payments/checkout/route.ts). Scoping the lookup to the caller is what makes `id`
    //    safe to use as an object address below.
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("payments")
      .select("id, invoice_url")
      .eq("id", id)
      .eq("patient_id", user.id)
      .maybeSingle();

    // `invoice_url` is checked for PRESENCE only — it means "the worker finished". Its
    // contents are never dereferenced; see the header.
    if (error || !data?.invoice_url) {
      // Same 404 whether the payment is missing, not owned, or has no invoice yet — no
      // existence leak, and no way to probe another patient's payment ids.
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // 3. Mint a short-lived signed URL for the object this payment owns.
    const objectPath = invoiceObjectPath(data.id);
    const { data: signed, error: signError } = await supabase.storage
      .from(INVOICES_BUCKET)
      .createSignedUrl(objectPath, INVOICE_SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      // The row says an invoice exists but the object cannot be signed — it is missing, or
      // the bucket is misconfigured. That is an operator problem, not a patient one, so log
      // the detail server-side and keep the client response generic. `invoice_status` and
      // the retry-invoices sweeper own the repair path.
      console.error(
        `[payments/invoice] cannot sign ${INVOICES_BUCKET}/${objectPath}:`,
        signError?.message ?? "no signed URL returned"
      );
      return NextResponse.json({ error: "Invoice not available" }, { status: 404 });
    }

    if (req.nextUrl.searchParams.get("format") === "json") {
      return NextResponse.json(
        { url: signed.signedUrl, expiresIn: INVOICE_SIGNED_URL_TTL_SECONDS },
        {
          // A signed URL to PHI must never be cached by a browser, a proxy or a CDN.
          headers: { "Cache-Control": "no-store, private" },
        }
      );
    }

    const res = NextResponse.redirect(signed.signedUrl);
    res.headers.set("Cache-Control", "no-store, private");
    return res;
  } catch (err: unknown) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    // Was `err?.message` — that leaked database and storage internals to the client. Uses
    // the shared handler now, matching the rest of the payments surface (ff01e24).
    return serverErrorResponse(err, "payments/invoice");
  }
}
