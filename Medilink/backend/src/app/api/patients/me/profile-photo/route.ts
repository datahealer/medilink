import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { createServiceSupabase } from "@/lib/supabase/service";
/* ================= POST (UPLOAD PROFILE PHOTO) ================= */
export async function POST(req: NextRequest) {
  try {
    const apisupabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(apisupabase);

    const supabase = createServiceSupabase();

    // ✅ 1. Get file from form data
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file uploaded" },
        { status: 400 }
      );
    }

    // ✅ 2. File validation
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP` },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "File must be less than 5MB" },
        { status: 400 }
      );
    }
    // ✅ 3. Get patient profile
    const { data: profile, error: profileError } = await supabase
      .from("patient_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "Patient profile not found" },
        { status: 404 }
      );
    }
    // ✅ 4. Prepare file path - clean filename
    const cleanFileName = file.name
      .replace(/\s+/g, "-")              // spaces → -
      .replace(/[()]/g, "")              // remove brackets
      .replace(/[^a-zA-Z0-9.-]/g, "");   // remove anything unsafe
    
    const filePath = `patient-profiles/${user.id}/${Date.now()}-${cleanFileName}`;

    // ✅ 5. Upload to account_image bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("account_image")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });
    if (uploadError) {
      return NextResponse.json(
        { success: false, error: uploadError.message },
        { status: 400 }
      );
    }
    // ✅ 6. Get public URL
    const { data } = supabase.storage
      .from("account_image")
      .getPublicUrl(filePath);

    const publicUrl = data?.publicUrl;

    if (!publicUrl) {
      return NextResponse.json(
        { success: false, error: "Failed to generate public URL" },
        { status: 400 }
      );
    }
    // ✅ 7. Update patient profile with photo URL
    const { error: updateError } = await supabase
      .from("patient_profiles")
      .update({ profile_photo_url: publicUrl })
      .eq("id", profile.id);
    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 400 }
      );
    }
    // ✅ 8. Success response
    return NextResponse.json({
      success: true,
      data: {
        profile_photo_url: publicUrl,
      },
      message: "Profile photo uploaded successfully",
    });

  } catch (err: any) {
    console.error("Profile photo upload error:", err);

    return NextResponse.json(
      { success: false, error: err.message || "Upload failed" },
      { status: 500 }
    );
  }
}
