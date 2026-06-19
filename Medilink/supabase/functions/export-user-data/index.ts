import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAGE_SIZE = 500;

const STRIP_FIELDS = new Set([
  "room_token",
  "share_token",
  "gateway_response",
  "encrypted_secret",
  "room_url",
  "room_token",
]);

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !STRIP_FIELDS.has(k))
  );
}

async function fetchPaginated(
  supabase: ReturnType<typeof createClient>,
  table: string,
  column: string,
  value: string,
  select = "*"
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from(table)
      .select(select)
      .eq(column, value)
      .range(from, from + PAGE_SIZE - 1);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Fix 3a: Require Authorization header — rejects unauthenticated direct calls
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  let export_id: string;
  let user_id: string;

  try {
    ({ export_id, user_id } = await req.json());
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!export_id || !user_id) {
    return new Response("Missing export_id or user_id", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Fix 3b: Verify export_id belongs to user_id before doing any work
  const { data: ownership, error: ownerErr } = await supabase
    .from("data_export_requests")
    .select("id, status")
    .eq("id", export_id)
    .eq("user_id", user_id)
    .single();

  if (ownerErr || !ownership) {
    console.error("[export-user-data] Ownership check failed:", ownerErr?.message);
    return new Response("Forbidden", { status: 403 });
  }

  // Reject if already completed or failed (prevents duplicate processing)
  if (ownership.status === "ready" || ownership.status === "failed") {
    console.warn(`[export-user-data] Skipping already-terminal export ${export_id} (${ownership.status})`);
    return new Response(JSON.stringify({ skipped: true, status: ownership.status }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Mark as processing
  await supabase
    .from("data_export_requests")
    .update({ status: "processing" })
    .eq("id", export_id);

  try {
    // Get patient_profiles.id (needed for patient-scoped queries)
    const { data: pp } = await supabase
      .from("patient_profiles")
      .select("id")
      .eq("user_id", user_id)
      .single();

    const patientProfileId = pp?.id ?? null;

    const [
      profileRes,
      patientProfileRes,
      appointments,
      payments,
      prescriptions,
      labResults,
      familyMembers,
      documents,
      messages,
      consentHistory,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, phone, email, role, language, consent_flags, consented_at, consent_version, status, created_at"
          // consent_ip intentionally excluded — operational metadata, not user data
        )
        .eq("id", user_id)
        .single(),

      patientProfileId
        ? supabase
            .from("patient_profiles")
            .select(
              "id, date_of_birth, gender, blood_group, address, emergency_contact, created_at"
            )
            .eq("id", patientProfileId)
            .single()
        : Promise.resolve({ data: null }),

      patientProfileId
        ? fetchPaginated(
            supabase,
            "appointments",
            "patient_id",
            patientProfileId,
            "id, slot_date, slot_start, slot_end, status, type, reason_for_visit, notes, created_at"
          )
        : Promise.resolve([]),

      patientProfileId
        ? fetchPaginated(
            supabase,
            "payments",
            "patient_id",
            patientProfileId,
            "amount, currency, status, payment_method, created_at"
          )
        : Promise.resolve([]),

      patientProfileId
        ? fetchPaginated(
            supabase,
            "prescriptions",
            "patient_id",
            patientProfileId,
            "medications, instructions, issued_at"
          )
        : Promise.resolve([]),

      patientProfileId
        ? fetchPaginated(
            supabase,
            "lab_results",
            "patient_id",
            patientProfileId,
            "test_name, notes, uploaded_at"
          )
        : Promise.resolve([]),

      patientProfileId
        ? fetchPaginated(
            supabase,
            "family_members",
            "patient_id",
            patientProfileId,
            "full_name, relation, date_of_birth, gender, created_at"
          )
        : Promise.resolve([]),

      patientProfileId
        ? fetchPaginated(
            supabase,
            "patient_documents",
            "patient_id",
            patientProfileId,
            "name, type, file_type, uploaded_at"
          ).then((rows) =>
            (rows as Record<string, unknown>[]).filter((r) => !r.deleted_at)
          )
        : Promise.resolve([]),

      fetchPaginated(
        supabase,
        "messages",
        "sender_id",
        user_id,
        "content, sent_at"
      ),

      fetchPaginated(
        supabase,
        "consent_history",
        "user_id",
        user_id,
        "consent_flags, consent_version, changed_at"
      ),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      export_version: "1.0",
      profile: profileRes.data ? strip(profileRes.data as Record<string, unknown>) : null,
      patient_profile: patientProfileRes.data ?? null,
      appointments: (appointments as Record<string, unknown>[]).map(strip),
      payments,
      prescriptions,
      lab_results: labResults,
      family_members: familyMembers,
      documents,
      messages,
      consent_history: consentHistory,
    };

    const json = JSON.stringify(exportData, null, 2);

    // Build upload buffer: ZIP preferred, plain JSON as fallback
    let uploadBuffer: Uint8Array;
    let contentType: string;
    let fileExt: string;

    try {
      uploadBuffer = zipSync({ "data.json": strToU8(json) }, { level: 6 });
      contentType = "application/zip";
      fileExt = "zip";
      console.log(`[export-user-data] ZIP created: ${uploadBuffer.length} bytes`);
    } catch (zipErr: unknown) {
      const msg = zipErr instanceof Error ? zipErr.message : String(zipErr);
      console.warn("[export-user-data] ZIP failed, falling back to JSON:", msg);
      uploadBuffer = new TextEncoder().encode(json);
      contentType = "application/json";
      fileExt = "json";
    }

    const downloadFilename = `user-data-${user_id}.${fileExt}`;
    const storagePath = `exports/${user_id}/${export_id}/${downloadFilename}`;

    const { error: uploadErr } = await supabase.storage
      .from("user-exports")
      .upload(storagePath, uploadBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    // Fix 1: pass { download: filename } so the signed URL sets
    // Content-Disposition: attachment — browser downloads instead of opening
    const { data: signed } = await supabase.storage
      .from("user-exports")
      .createSignedUrl(storagePath, 48 * 3600, { download: downloadFilename });

    if (!signed?.signedUrl) throw new Error("Failed to generate signed URL");

    await supabase
      .from("data_export_requests")
      .update({
        status: "ready",
        download_url: signed.signedUrl,
        storage_path: storagePath,
        file_size_bytes: uploadBuffer.length,
        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", export_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[export-user-data] Error:", message);

    // Retry logic: up to 3 attempts before marking failed
    const { data: current } = await supabase
      .from("data_export_requests")
      .select("retry_count")
      .eq("id", export_id)
      .single();

    const retryCount = ((current as { retry_count: number } | null)?.retry_count ?? 0) + 1;

    if (retryCount < 3) {
      await supabase
        .from("data_export_requests")
        .update({ status: "pending", retry_count: retryCount })
        .eq("id", export_id);
    } else {
      await supabase
        .from("data_export_requests")
        .update({ status: "failed" })
        .eq("id", export_id);
    }

    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
