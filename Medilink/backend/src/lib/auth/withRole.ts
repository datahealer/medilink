import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@medilink/shared";
import type { User } from "@supabase/supabase-js";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export async function withRole(
  request: Request,
  allowedRoles: Database["public"]["Enums"]["user_role"][],
  handler: (args: { supabase: Supabase; user: User }) => Promise<NextResponse>
) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = data.user;

  const profileRes = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profileRes.data?.role ?? null;

  if (!role || !allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return handler({ supabase, user });
}