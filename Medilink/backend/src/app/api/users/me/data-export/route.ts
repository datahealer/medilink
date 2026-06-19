import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit/logAudit";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);

    const { data: exports } = await supabase
      .from("data_export_requests")
      .select("id, status, download_url, expires_at, created_at, completed_at, file_size_bytes")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({ exports: exports ?? [] });
  } catch (err: any) {
    if (err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);

    // Rate limit: max 2 exports per 24 hours
    const { count } = await supabase
      .from("data_export_requests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());

    if ((count ?? 0) >= 2) {
      return NextResponse.json(
        { error: "Export rate limit exceeded. Maximum 2 exports per 24 hours." },
        { status: 429 }
      );
    }

    // Get user role for audit
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const serviceClient = createServiceSupabase();

    // Insert pending export request
    const { data: exportReq, error: insertErr } = await serviceClient
      .from("data_export_requests")
      .insert({ user_id: user.id, status: "pending" })
      .select()
      .single();

    if (insertErr || !exportReq) {
      return NextResponse.json({ error: "Failed to create export request" }, { status: 500 });
    }

    // Invoke Edge Function (service client auto-attaches service-role Authorization)
    // Fire-and-forget — do NOT await
    serviceClient.functions
      .invoke("export-user-data", {
        body: { export_id: exportReq.id, user_id: user.id },
      })
      .catch((e) => console.error("[DataExport] Edge Function invoke failed:", e));

    await logAudit({
      action: "data_export_requested",
      actor_user_id: user.id,
      actor_role: profile?.role ?? null,
      resource_type: "data_export",
      resource_id: exportReq.id,
    });

    return NextResponse.json({ export_id: exportReq.id, status: "processing" });
  } catch (err: any) {
    if (err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
