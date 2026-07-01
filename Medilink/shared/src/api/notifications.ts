// NOTIFICATIONS — RE-HOMED from HAMS `notifications/{me,unread-count,read-all}`.
// Patient notifications live in `in_app_notifications`, keyed by auth user_id (not
// patient_profile id). Channel/category preferences use the additive
// `notification_preferences` table (see supabase/migrations).
import type { DB, Row, Update } from "./client";
import { getCurrentUserId, getMyPatientProfileId } from "./client";

const SELECT = "id, type, title, body, is_read, created_at, data";

export async function listNotifications(
  db: DB,
  opts: { page?: number; limit?: number } = {}
) {
  const userId = await getCurrentUserId(db);
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;

  const { data, error } = await db
    .from("in_app_notifications")
    .select(SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data ?? [];
}

export async function unreadCount(db: DB): Promise<number> {
  const userId = await getCurrentUserId(db);
  const { count, error } = await db
    .from("in_app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function markAllRead(db: DB): Promise<void> {
  const userId = await getCurrentUserId(db);
  const { error } = await db
    .from("in_app_notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
}

export async function markRead(db: DB, id: string): Promise<void> {
  const userId = await getCurrentUserId(db);
  const { error } = await db
    .from("in_app_notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function deleteNotification(db: DB, id: string): Promise<void> {
  const userId = await getCurrentUserId(db);
  const { error } = await db
    .from("in_app_notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

// ---- Facility Messages (Design p32) ----
// Read-only inbox of facility administrative announcements (public.announcements),
// with per-patient unread state from public.announcement_reads. Mute-aware
// (excludes announcements from facilities the patient has muted).

export interface FacilityMessage {
  id: string;
  source: string | null; // facility name
  preview: string;
  time: string; // created_at
  unread: boolean;
}

export async function listFacilityMessages(db: DB, limit = 50): Promise<FacilityMessage[]> {
  const patientId = await getMyPatientProfileId(db);
  const [anns, reads, muted] = await Promise.all([
    db
      .from("announcements")
      .select("id, facility_id, title, message, created_at, facility:facility_id ( name )")
      .order("created_at", { ascending: false })
      .limit(limit),
    db.from("announcement_reads").select("announcement_id").eq("patient_id", patientId),
    db.from("muted_facilities").select("facility_id").eq("patient_id", patientId),
  ]);
  if (anns.error) throw anns.error;
  if (reads.error) throw reads.error;
  if (muted.error) throw muted.error;

  const readIds = new Set((reads.data ?? []).map((r) => r.announcement_id));
  const mutedIds = new Set((muted.data ?? []).map((m) => m.facility_id));

  return (anns.data ?? [])
    .filter((a) => !mutedIds.has(a.facility_id))
    .map((a) => {
      const facility = a.facility as { name: string | null } | { name: string | null }[] | null;
      const name = Array.isArray(facility) ? facility[0]?.name ?? null : facility?.name ?? null;
      return {
        id: a.id,
        source: name,
        preview: a.message ?? a.title ?? "",
        time: a.created_at,
        unread: !readIds.has(a.id),
      };
    });
}

/** Mark the given facility announcements as read for the caller (idempotent). */
export async function markFacilityMessagesRead(db: DB, announcementIds: string[]): Promise<void> {
  if (!announcementIds.length) return;
  const patientId = await getMyPatientProfileId(db);
  const rows = announcementIds.map((announcement_id) => ({ patient_id: patientId, announcement_id }));
  const { error } = await db
    .from("announcement_reads")
    .upsert(rows, { onConflict: "patient_id,announcement_id", ignoreDuplicates: true });
  if (error) throw error;
}

// ---- Preferences ----
// Stored on `profiles.notification_prefs` (JSONB). There is NO separate
// `notification_preferences` table — channel flags (push/email/sms/whatsapp)
// live at the top level; the mobile app nests its category flags under
// `categories`. Read/write goes through the profiles_select_own /
// profiles_update_own RLS policies (id = auth.uid()).

export async function getPreferences(
  db: DB
): Promise<Row<"profiles">["notification_prefs"] | null> {
  const userId = await getCurrentUserId(db);
  const { data, error } = await db
    .from("profiles")
    .select("notification_prefs")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.notification_prefs ?? null;
}

export async function updatePreferences(
  db: DB,
  prefs: Update<"profiles">["notification_prefs"]
): Promise<Row<"profiles">["notification_prefs"]> {
  const userId = await getCurrentUserId(db);
  const { data, error } = await db
    .from("profiles")
    .update({ notification_prefs: prefs })
    .eq("id", userId)
    .select("notification_prefs")
    .single();
  if (error) throw error;
  return data.notification_prefs;
}
