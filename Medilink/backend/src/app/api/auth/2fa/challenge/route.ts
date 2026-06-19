import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getUserOrThrow } from "@/lib/auth/api";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    await getUserOrThrow(supabase);

    const { factorId } = await req.json();
    if (!factorId) {
      return NextResponse.json(
        { success: false, error: "factorId is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.auth.mfa.challenge({ factorId });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
