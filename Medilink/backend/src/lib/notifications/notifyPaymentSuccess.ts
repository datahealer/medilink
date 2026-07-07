import type { createServiceSupabase } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceSupabase>;

export type NotifyResult = { success: true } | { success: false; error: string };

/**
 * Single insert point for the patient "payment successful" notification — used by
 * both the Thawani webhook and the /api/payments/verify fallback, so a payment
 * finalized through either path notifies the patient the same way. Uses the
 * existing "info" notification type (schema is unchanged in this phase).
 */
export async function notifyPaymentSuccess(
  service: ServiceClient,
  input: { userId: string; appointmentId: string; title: string; body: string }
): Promise<NotifyResult> {
  const { error } = await service.from("in_app_notifications").insert({
    user_id: input.userId,
    type: "info" as const,
    title: input.title,
    body: input.body,
    data: { appointment_id: input.appointmentId },
  });

  if (error) {
    console.error("❌ Patient payment notification failed:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}
