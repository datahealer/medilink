import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@medilink/shared";

export async function getUserWithRole(
  supabase: SupabaseClient<Database>
) {
  try {
    // ✅ Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        user: null,
        role: null,
      };
    }

    // ✅ Get role from profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile error:", profileError.message);
      return {
        user,
        role: null,
      };
    }

    return {
      user,
      role: profile?.role ?? null,
    };

  } catch (error) {
    console.error("getUserWithRole error:", error);

    return {
      user: null,
      role: null,
    };
  }
}