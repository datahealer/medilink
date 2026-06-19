import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅ FIX
) {
  const { id } = await context.params; // ✅ MUST await

  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("payments")
    .select("invoice_url")
    .eq("id", id)
    .single();

  if (error || !data?.invoice_url) {
    return NextResponse.json(
      { error: "Invoice not found" },
      { status: 404 }
    );
  }

  return NextResponse.redirect(data.invoice_url);
}