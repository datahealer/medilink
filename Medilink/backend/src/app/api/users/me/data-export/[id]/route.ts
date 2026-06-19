import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit/logAudit";

type ExportRow = {
  id: string;
  status: string;
  download_url: string | null;
  expires_at: string | null;
  completed_at: string | null;
  file_size_bytes: number | null;
  retry_count: number;
  download_logged: boolean;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);
    const { id } = await params;

    const { data: exportReq, error } = await (supabase as any)
      .from("data_export_requests")
      .select(
        "id, status, download_url, expires_at, completed_at, file_size_bytes, retry_count, download_logged"
      )
      .eq("id", id)
      .eq("user_id", user.id) // ownership enforced here
      .single() as { data: ExportRow | null; error: unknown };

    if (error || !exportReq) {
      return NextResponse.json({ error: "Export request not found" }, { status: 404 });
    }

    // Fix 2 & 5: log download exactly once (download_logged gate) and await the call
    if (
      exportReq.status === "ready" &&
      exportReq.expires_at &&
      new Date(exportReq.expires_at) > new Date() &&
      !exportReq.download_logged
    ) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      // Fix 5: await the audit log
      await logAudit({
        action: "data_export_downloaded",
        actor_user_id: user.id,
        actor_role: profile?.role ?? null,
        resource_type: "data_export",
        resource_id: id,
      });

      // Mark as logged so subsequent fetches do not re-fire (service client bypasses RLS)
      const serviceClient = createServiceSupabase();
      await (serviceClient as any)
        .from("data_export_requests")
        .update({ download_logged: true })
        .eq("id", id)
        .eq("download_logged", false)
    }

    // Strip internal field before returning to client
    const { download_logged: _dl, ...clientPayload } = exportReq;

    return NextResponse.json(clientPayload);
  } catch (err: any) {
    if (err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
