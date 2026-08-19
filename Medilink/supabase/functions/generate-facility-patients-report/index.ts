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
  const refusal = requireInternalCaller(req, "generate-facility-patients-report");
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

    // ── Fetch appointments for the month (just patient_id + status) ──
    const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear  = month === 12 ? year + 1 : year;
    const endStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

    const { data: appts, error: apptError } = await supabase
      .from("appointments")
      .select("patient_id, status")
      .eq("facility_id", facility_id)
      .gte("slot_date", startStr)
      .lt("slot_date", endStr);

    if (apptError) {
      return new Response(
        JSON.stringify({ error: apptError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Deduplicate patient IDs + count visits ──
    const visitMap = new Map<string, number>();
    for (const row of (appts ?? [])) {
      const pid = (row as any).patient_id as string;
      visitMap.set(pid, (visitMap.get(pid) ?? 0) + 1);
    }

    const patientIds = Array.from(visitMap.keys());

    // ── Fetch patient profiles separately ──
    const patientDetails: Array<{ id: string; full_name: string; gender: string; dob: string; visits: number }> = [];

    if (patientIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("patient_profiles")
        .select(`
          id,
          date_of_birth,
          gender,
          profiles!patient_profiles_user_id_fkey ( full_name )
        `)
        .in("id", patientIds);

      if (!profileError && profiles) {
        for (const pp of profiles) {
          const rel = (pp as any).profiles;
          const fullName = Array.isArray(rel)
            ? (rel[0] as any)?.full_name ?? "Unknown"
            : (rel as any)?.full_name ?? "Unknown";

          patientDetails.push({
            id:        (pp as any).id,
            full_name: fullName,
            gender:    (pp as any).gender    ?? "N/A",
            dob:       (pp as any).date_of_birth ?? "N/A",
            visits:    visitMap.get((pp as any).id) ?? 1,
          });
        }
      }
    }

    // Sort by name
    patientDetails.sort((a, b) => a.full_name.localeCompare(b.full_name));

    const monthName = MONTH_NAMES[(month as number) - 1];

    // ── Generate PDF ──
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve) => doc.on("end", resolve));

    // Header
    doc.fontSize(22).font("Helvetica-Bold").text("HAMS — Patient Report", { align: "center" });
    doc.moveDown(0.4);
    doc.fontSize(16).font("Helvetica-Bold").text(facility.name as string, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(12).font("Helvetica").fillColor("#666666").text(`${monthName} ${year}`, { align: "center" });
    doc.moveDown(0.8).fillColor("#000000");
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.8);

    // Summary
    doc.fontSize(14).font("Helvetica-Bold").text("Patient Summary");
    doc.moveDown(0.4);
    doc.fontSize(11).font("Helvetica").fillColor("#333333").text("Unique Patients:  ", { continued: true });
    doc.font("Helvetica-Bold").fillColor("#000000").text(String(patientDetails.length));
    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.8);

    // Table
    if (patientDetails.length === 0) {
      doc.fontSize(11).font("Helvetica").fillColor("#888888").text("No patients found for this period.");
    } else {
      // Column headers
      const hY = doc.y;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000");
      doc.text("#",        55,  hY, { width: 25  });
      doc.text("Patient",  80,  hY, { width: 180 });
      doc.text("Gender",   265, hY, { width: 70  });
      doc.text("DOB",      340, hY, { width: 110 });
      doc.text("Visits",   455, hY, { width: 60, align: "right" });
      doc.moveDown(0.2);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#eeeeee").stroke();
      doc.moveDown(0.3);

      for (let i = 0; i < patientDetails.length; i++) {
        const p = patientDetails[i];
        const r = doc.y;
        doc.fontSize(10).font("Helvetica").fillColor("#333333");
        doc.text(String(i + 1), 55,  r, { width: 25  });
        doc.text(p.full_name,   80,  r, { width: 180 });
        doc.text(p.gender,      265, r, { width: 70  });
        doc.text(p.dob,         340, r, { width: 110 });
        doc.text(String(p.visits), 455, r, { width: 60, align: "right" });
        doc.moveDown(0.4);
      }
    }

    doc.moveDown(0.8);
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
    const filePath = `${facility_id}/patients-${month}-${year}.pdf`;

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
      console.error("[generate-facility-patients-report] could not sign report URL:", signError?.message);
      return new Response(JSON.stringify({ error: "Could not issue report link" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const publicUrl = urlData.signedUrl;

    // ── Insert into generated_reports ──
    await supabase.from("generated_reports").insert({
      facility_id,
      report_type: "facility_patients",
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
    console.error("generate-facility-patients-report error:", message);
    return new Response(
      JSON.stringify({ error: "Report generation failed", details: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
