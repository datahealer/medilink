// @ts-ignore Deno URL import resolved at edge runtime
import { serve } from "https://deno.land/std/http/server.ts";
// @ts-ignore Deno URL import resolved at edge runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore npm specifier — Deno Node compat
import PDFDocument from "npm:pdfkit";
import { Buffer } from "node:buffer";

declare const Deno: {
  env: { get: (key: string) => string | undefined };
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

serve(async (req: Request) => {
  try {
    const { facility_id, month, year, created_by } = await req.json();

    if (!facility_id || !month || !year || !created_by) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: facility_id, month, year, created_by" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Fetch facility name ──
    const { data: facility, error: facilityError } = await supabase
      .from("facilities")
      .select("name")
      .eq("id", facility_id)
      .single();

    if (facilityError || !facility) {
      return new Response(
        JSON.stringify({ error: "Facility not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Fetch stats via RPC (same as appointment summary, already known working) ──
    const { data: stats, error: rpcError } = await supabase.rpc(
      "get_monthly_report_summary",
      { p_facility_id: facility_id, p_month: month, p_year: year }
    );

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: rpcError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const s = stats ?? { total: 0, confirmed: 0, cancelled: 0, pending: 0, completed: 0, emergency: 0 };
    const monthName = MONTH_NAMES[(month as number) - 1];

    // ── Generate PDF ──
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve) => doc.on("end", resolve));

    // Header
    doc.fontSize(22).font("Helvetica-Bold").text("HAMS — Monthly Revenue Report", { align: "center" });
    doc.moveDown(0.4);
    doc.fontSize(16).font("Helvetica-Bold").text(facility.name as string, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(12).font("Helvetica").fillColor("#666666").text(`${monthName} ${year}`, { align: "center" });
    doc.moveDown(0.8).fillColor("#000000");
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.8);

    // Revenue & Appointment Stats
    doc.fontSize(14).font("Helvetica-Bold").text("Appointment & Revenue Summary");
    doc.moveDown(0.4);

    const rows: [string, number][] = [
      ["Total Appointments", s.total      ?? 0],
      ["Completed",          s.completed  ?? 0],
      ["Confirmed",          s.confirmed  ?? 0],
      ["Pending",            s.pending    ?? 0],
      ["Cancelled",          s.cancelled  ?? 0],
      ["Emergency",          s.emergency  ?? 0],
    ];

    for (const [label, value] of rows) {
      const rowY = doc.y;
      doc.fontSize(11).font("Helvetica").fillColor("#333333").text(label, 60, rowY, { width: 300 });
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#000000").text(String(value), 370, rowY, { width: 100, align: "right" });
      doc.moveDown(0.45);
    }

    doc.moveDown(0.7);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.8);

    // Footer
    const dateStr = new Date().toLocaleDateString("en-IN", {
      year: "numeric", month: "long", day: "numeric",
    });
    doc.fontSize(9).font("Helvetica").fillColor("#888888").text(
      `Generated on ${dateStr} · System-generated report · HAMS`,
      { align: "center" }
    );

    doc.end();
    await done;

    const pdfBytes = Buffer.concat(chunks);

    // ── Upload to storage ──
    const filePath = `${facility_id}/revenue-${month}-${year}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("reports")
      .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: uploadError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: urlData } = supabase.storage.from("reports").getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;

    // ── Insert into generated_reports ──
    await supabase.from("generated_reports").insert({
      facility_id,
      report_type: "monthly_revenue",
      period: `${year}-${String(month).padStart(2, "0")}`,
      file_url: publicUrl,
      created_by,
    });

    return new Response(
      JSON.stringify({ success: true, url: publicUrl }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("generate-revenue-report error:", message);
    return new Response(
      JSON.stringify({ error: "Report generation failed", details: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
