import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const getServerUserAndRole = cache(async () => {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { user: null, role: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role ?? "patient";

  return { user, role, profile };
});
