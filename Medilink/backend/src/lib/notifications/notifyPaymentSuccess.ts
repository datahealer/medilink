import type { createServiceSupabase } from "@/lib/supabase/service";
import { sendPushToUser } from "@/lib/notifications/sendPush";

type ServiceClient = ReturnType<typeof createServiceSupabase>;

export type NotifyResult = { success: true } | { success: false; error: string };

/**
 * Single insert point for the patient "payment successful" notification — used by
 * both the Thawani webhook and the /api/payments/verify fallback, so a payment
 * finalized through either path notifies the patient the same way.
 *
 * The DB `type` column is constrained to info|warning|error, so the routable category
 * lives in `data.kind` ("payment"). The mobile app classifies on `data.kind` to route
 * the tap to the payment / appointment destination (a bare "info" notification with no
 * kind used to fall through to the wrong screen).
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
    data: { appointment_id: input.appointmentId, kind: "payment" },
  });

  if (error) {
    console.error("❌ Patient payment notification failed:", error.message);
    return { success: false, error: error.message };
  }

  // Dispatch the device push (best-effort — never fails the in-app notification). The
  // payload's `kind`/`appointment_id` drive the mobile tap-routing to the appointment.
  await sendPushToUser(service, {
    userId: input.userId,
    title: input.title,
    body: input.body,
    data: { appointment_id: input.appointmentId, kind: "payment" },
  });

  return { success: true };
}
