import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

/** Verdict returned by the request_appointment_refund RPC. */
type RefundClaim = {
  ok: boolean;
  code: string;
  already?: boolean;
  refund_id?: string;
  amount?: number;
  gateway_session_id?: string | null;
};

// Business codes → HTTP status for the "not refundable" outcomes.
const CLAIM_STATUS: Record<string, number> = {
  PAYMENT_NOT_FOUND: 404,
  APPOINTMENT_NOT_FOUND: 404,
  PAYMENT_NOT_PAID: 400,
  APPOINTMENT_NOT_CANCELLED: 409,
};

/**
 * Issue a refund for a cancelled appointment's payment.
 *
 * Flow (atomic + idempotent):
 *   1. Auth (AAL2) + ownership — the RLS-scoped read returns the payment only if it
 *      belongs to the caller.
 *   2. request_appointment_refund RPC — under a row lock it validates the payment is
 *      paid and the appointment is cancelled, derives the amount from the clinic's
 *      configurable policy, and claims (inserts) a single pending refund. A concurrent
 *      second call serializes on the lock and returns the existing claim (no double
 *      refund); an already-refunded payment returns idempotently.
 *   3. Real Thawani refund for the server-derived amount.
 *   4. finalize_appointment_refund on success (records the gateway ref + flips the
 *      payment to refunded/partial_refund) or fail_appointment_refund on decline.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const service = createServiceSupabase();
    await getAal2UserOrThrow(supabase);

    const { id: paymentId } = await params;

    // Ownership: RLS returns the row only if this payment belongs to the caller.
    const { data: owned } = await supabase
      .from("payments")
      .select("id")
      .eq("id", paymentId)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Validate + atomically claim the refund (amount derived server-side).
    const { data: claimData, error: claimErr } = await service.rpc(
      "request_appointment_refund" as never,
      { p_payment_id: paymentId } as never
    );
    if (claimErr) {
      console.error("refund: claim rpc failed:", claimErr.message);
      return NextResponse.json({ error: "Refund could not be processed" }, { status: 500 });
    }
    const claim = claimData as unknown as RefundClaim;

    if (!claim?.ok) {
      return NextResponse.json(
        { error: claim?.code ?? "REFUND_NOT_ALLOWED" },
        { status: CLAIM_STATUS[claim?.code ?? ""] ?? 400 }
      );
    }

    // Policy yielded no refund (e.g. cancelled after the cutoff with a 0% partial).
    if (claim.code === "NO_REFUND_DUE") {
      return NextResponse.json({ success: true, refund: null, amount: 0, code: claim.code });
    }

    // Idempotent hit: a refund is already in progress/complete — never re-charge Thawani.
    if (claim.already) {
      const { data: existing } = await service
        .from("refunds")
        .select("*")
        .eq("id", claim.refund_id!)
        .maybeSingle();
      return NextResponse.json({ success: true, refund: existing, code: claim.code });
    }

    // Newly claimed → issue the real gateway refund for the server-derived amount.
    let gatewayResponse: unknown = null;
    let gatewayRef: string | null = null;
    try {
      const tRes = await fetch(`${process.env.THAWANI_BASE_URL}/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "thawani-api-key": process.env.THAWANI_SECRET_KEY!,
        },
        body: JSON.stringify({
          session_id: claim.gateway_session_id,
          amount: Math.round((claim.amount ?? 0) * 1000), // OMR → baisa
        }),
      });
      gatewayResponse = await tRes.json().catch(() => null);
      if (!tRes.ok) throw new Error("thawani_refund_declined");
      gatewayRef = (gatewayResponse as { data?: { refund_id?: string } })?.data?.refund_id ?? null;
    } catch (gatewayErr) {
      await service.rpc("fail_appointment_refund" as never, {
        p_refund_id: claim.refund_id,
        p_gateway_response: gatewayResponse,
      } as never);
      console.error(
        "refund: gateway declined:",
        gatewayErr instanceof Error ? gatewayErr.message : gatewayErr
      );
      return NextResponse.json({ error: "Refund gateway declined" }, { status: 502 });
    }

    // Finalize: record the gateway ref + flip payment → refunded/partial_refund.
    const { error: finErr } = await service.rpc("finalize_appointment_refund" as never, {
      p_refund_id: claim.refund_id,
      p_gateway_ref: gatewayRef,
      p_gateway_response: gatewayResponse,
    } as never);
    if (finErr) {
      // The gateway already accepted the refund; log for reconciliation but don't fail
      // the response — poll-refund-status + the recorded refund row remain the record.
      console.error("refund: finalize failed (money already refunded):", finErr.message);
    }

    const { data: refund } = await service
      .from("refunds")
      .select("*")
      .eq("id", claim.refund_id!)
      .maybeSingle();
    return NextResponse.json({ success: true, refund });
  } catch (err: unknown) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("refund: unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Refund could not be processed" }, { status: 500 });
  }
}
