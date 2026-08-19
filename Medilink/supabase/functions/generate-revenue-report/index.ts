// @ts-ignore Deno URL import resolved at edge runtime
import { serve } from "https://deno.land/std/http/server.ts";
// @ts-ignore Deno URL import resolved at edge runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore npm specifier — Deno Node compat
import PDFDocument from "npm:pdfkit";
import { Buffer } from "node:buffer";
import {
  isUuid,
  REPORT_SIGNED_URL_TTL_SECONDS,
  requireInternalCaller,
} from "../_shared/internalAuth.ts";

declare const Deno: {
  env: { get: (key: string) => string | undefined };
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

serve(async (req: Request) => {
  /**
   * SERVER-TO-SERVER ONLY. This function renders privileged data with the service role, so
   * it must never be reachable by an end user directly. See _shared/internalAuth.ts for the
   * full account of the PHI disclosure this closes.
   */
  const refusal = requireInternalCaller(req, "generate-revenue-report");
  if (refusal) return refusal;

  try {
    const { facility_id, month, year, created_by } = await req.json();

    const bad = (msg: string) =>
      new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });

    // Shape-validate every id BEFORE it reaches a query or a storage path. Authorization itself
    // stays with the calling route; this only ensures an id cannot be a path or an injection.
    if (!isUuid(facility_id)) return bad("facility_id must be a UUID");
    // month/year are interpolated into the STORAGE PATH below. Unvalidated, a value such as
    // "../../patients/<uuid>/medical-history" would write outside the intended prefix, so they
    // are constrained here rather than merely trusted from the calling route.
    if (!Number.isInteger(month) || month < 1 || month > 12) return bad("month must be an integer 1-12");
    if (!Number.isInteger(year) || year < 1000 || year > 9999) return bad("year must be a 4-digit integer");
    if (created_by !== undefined && created_by !== null && !isUuid(created_by)) {
      return bad("created_by must be a UUID");
    }

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

    // SIGNED, SHORT-LIVED URL — never getPublicUrl().
    // The `reports` bucket stored patient medical-history PDFs at a deterministic path while
    // being world-readable, so getPublicUrl() handed out a permanent, unauthenticated link to a
    // medical record. The bucket is made private by the prepared migration under
    // supabase/planned/; this link now expires.
    const { data: urlData, error: signError } = await supabase.storage
      .from("reports")
      .createSignedUrl(filePath, REPORT_SIGNED_URL_TTL_SECONDS);

    if (signError || !urlData?.signedUrl) {
      console.error("[generate-revenue-report] could not sign report URL:", signError?.message);
      return new Response(JSON.stringify({ error: "Could not issue report link" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const publicUrl = urlData.signedUrl;

    // ── Insert into generated_reports ──
    await supabase.from("generated_reports").insert({
      facility_id,
      report_type: "monthly_revenue",
      period: `${year}-${String(month).padStart(2, "0")}`,
      file_url: filePath, // storage PATH, re-signable — a signed URL would be expired by then
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
