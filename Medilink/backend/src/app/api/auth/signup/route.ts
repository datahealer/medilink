import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logAudit } from "@/lib/audit/logAudit";
import { validatePassword } from "@/lib/auth/validatePassword";

/* ================= POST (SIGNUP) ================= */
export async function POST(req: NextRequest) {
  try {
    // Service role client — bypasses email confirmation requirement
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { email, password, full_name, phone, role } = body;

    // ✅ Validation
    const pwResult = validatePassword(password ?? "");
    if (!pwResult.valid) {
      return NextResponse.json(
        { success: false, error: pwResult.errors[0] },
        { status: 400 }
      );
    }

    if (!email && !phone) {
      return NextResponse.json(
        { success: false, error: "Email or phone is required" },
        { status: 400 }
      );
    }

    if (role && role !== "patient") {
      return NextResponse.json(
        { success: false, error: "Only patients can register" },
        { status: 403 }
      );
    }

    const safeRole = "patient";

    // ✅ Signup — email_confirm: true skips confirmation email requirement
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name || "",
        phone: phone || null,
        role: safeRole,
      },
    });

    if (error) {
      const msg = error.message.toLowerCase().includes("already been registered")
        ? "Email already registered."
        : error.message || "Signup failed";
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    if (data.user) {
      await logAudit({
        action: "consent_given",
        actor_user_id: data.user.id,
        actor_role: safeRole,
        resource_type: "profile",
        resource_id: data.user.id,
      });
    }

    return NextResponse.json({
      success: true,
      data,
      message: "Signup successful",
    });

  } catch (err: any) {
    console.error("Signup error:", err);

    return NextResponse.json(
      { success: false, error: err.message || "Something went wrong" },
      { status: 500 }
    );
  }
}