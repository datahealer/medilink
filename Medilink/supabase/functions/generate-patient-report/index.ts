// @ts-ignore Deno URL import resolved at edge runtime
import { serve } from "https://deno.land/std/http/server.ts";
// @ts-ignore Deno URL import resolved at edge runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore npm specifier — Deno Node compat
import PDFDocument from "npm:pdfkit";
import { Buffer } from "node:buffer";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getFullNameFromRelation(rel: unknown): string | null {
  if (!rel) return null;
  if (Array.isArray(rel)) {
    const first = rel[0] as { full_name?: string } | undefined;
    return first?.full_name ?? null;
  }
  const item = rel as { full_name?: string };
  return item.full_name ?? null;
}

serve(async (req: Request) => {
  try {
    const { patient_id, created_by } = await req.json();

    if (!patient_id || !created_by) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: patient_id, created_by" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Fetch all data in parallel ──
    const [profileRes, historyRes, appointmentsRes] = await Promise.all([
      supabase
        .from("patient_profiles")
        .select(`
          id,
          user_id,
          date_of_birth,
          blood_group,
          gender,
          profiles!patient_profiles_user_id_fkey (
            full_name
          )
        `)
        .eq("id", patient_id)
        .single(),
      supabase
        .from("medical_histories")
        .select("allergies, conditions, medications, surgeries, smoking_status, notes")
        .eq("patient_id", patient_id)
        .maybeSingle(),
      supabase
        .from("appointments")
        .select("slot_date, slot_start, status, doctors!appointments_doctor_id_fkey(full_name)")
        .eq("patient_id", patient_id)
        .order("slot_date", { ascending: false })
        .limit(10),
    ]);

    if (profileRes.error || !profileRes.data) {
      return new Response(
        JSON.stringify({ error: "Patient not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const patient      = profileRes.data;
    const history      = historyRes.data ?? null;
    const appointments = (appointmentsRes.data ?? []) as Array<{
      slot_date: string;
      slot_start: string;
      status: string;
      doctors: { full_name: string } | Array<{ full_name: string }> | null;
    }>;

    const patientName = getFullNameFromRelation(patient.profiles) ?? "Patient";

    const htmlTemplate = [
      "<html><body>",
      `<h1>HAMS - Patient Medical History</h1>`,
      `<h2>${patientName}</h2>`,
      `<p>DOB: ${patient.date_of_birth ?? "N/A"} | Blood Group: ${patient.blood_group ?? "N/A"} | Gender: ${patient.gender ?? "N/A"}</p>`,
      "<h3>Medical History</h3>",
      `<p>Allergies: ${normalizeValue(history?.allergies) || "None"}</p>`,
      `<p>Conditions: ${normalizeValue(history?.conditions) || "None"}</p>`,
      `<p>Medications: ${normalizeValue(history?.medications) || "None"}</p>`,
      `<p>Surgeries: ${normalizeValue(history?.surgeries) || "None"}</p>`,
      `<p>Smoking: ${normalizeValue(history?.smoking_status)}</p>`,
      `<p>Notes: ${normalizeValue(history?.notes)}</p>`,
      "<h3>Recent Appointments</h3>",
      "<table>",
      ...appointments.map((a) =>
        `<tr><td>${a.slot_date}</td><td>${a.slot_start}</td><td>${a.status}</td><td>${getFullNameFromRelation(a.doctors) ?? "N/A"}</td></tr>`
      ),
      "</table>",
      "<p>System-generated report · HAMS</p>",
      "</body></html>",
    ].join("\n");

    // Keep template materialized for audit/debug without changing response shape.
    console.debug("generate-patient-report html-template-bytes", htmlTemplate.length);


    // ── Generate PDF with pdfkit ──
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve) => doc.on("end", resolve));

    // Header
    doc.fontSize(22).font("Helvetica-Bold").text("HAMS — Patient Medical History", { align: "center" });
    doc.moveDown(0.4);
    doc.fontSize(15).font("Helvetica-Bold").text(patientName, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica").fillColor("#555555").text(
      `DOB: ${patient.date_of_birth ?? "N/A"}   |   Blood Group: ${patient.blood_group ?? "N/A"}   |   Gender: ${patient.gender ?? "N/A"}`,
      { align: "center" }
    );
    doc.moveDown(0.8).fillColor("#000000");
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.8);

    // Medical History section
    doc.fontSize(14).font("Helvetica-Bold").text("Medical History");
    doc.moveDown(0.4);

    const historyFields: [string, string][] = [
      ["Allergies",      normalizeValue(history?.allergies)],
      ["Conditions",     normalizeValue(history?.conditions)],
      ["Medications",    normalizeValue(history?.medications)],
      ["Surgeries",      normalizeValue(history?.surgeries)],
      ["Smoking Status", normalizeValue(history?.smoking_status)],
      ["Notes",          normalizeValue(history?.notes) || "—"],
    ];

    for (const [label, value] of historyFields) {
      doc.fontSize(11).font("Helvetica-Bold").text(`${label}: `, { continued: true });
      doc.font("Helvetica").text(value);
      doc.moveDown(0.2);
    }

    doc.moveDown(0.6);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.8);

    // Recent Appointments section
    doc.fontSize(14).font("Helvetica-Bold").text("Recent Appointments");
    doc.moveDown(0.4);

    if (appointments.length === 0) {
      doc.fontSize(11).font("Helvetica").fillColor("#888888").text("No appointments found.");
    } else {
      // Column headers
      const rowY = doc.y;
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#000000");
      doc.text("Date",   60,  rowY, { width: 90,  continued: false });
      doc.text("Time",   160, rowY, { width: 90,  continued: false });
      doc.text("Status", 255, rowY, { width: 105, continued: false });
      doc.text("Doctor", 365, rowY, { width: 180, continued: false });
      doc.moveDown(0.2);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#eeeeee").stroke();
      doc.moveDown(0.3);

      for (const appt of appointments) {
        const r = doc.y;
        doc.fontSize(10).font("Helvetica").fillColor("#333333");
        doc.text(appt.slot_date            ?? "—", 60,  r, { width: 90  });
        doc.text(appt.slot_start           ?? "—", 160, r, { width: 90  });
        doc.text(appt.status               ?? "—", 255, r, { width: 105 });
        doc.text(getFullNameFromRelation(appt.doctors) ?? "N/A", 365, r, { width: 180 });
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

    const pdfBuffer = Buffer.concat(chunks);

    // ── Upload to storage ──
    const filePath = `patients/${patient_id}/medical-history.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("reports")
      .upload(filePath, pdfBuffer, { contentType: "application/pdf", upsert: true });

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
      patient_id,
      report_type: "medical_history",
      file_url: publicUrl,
      created_by,
    });

    return new Response(
      JSON.stringify({ success: true, url: publicUrl }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("generate-patient-report error:", message);
    return new Response(
      JSON.stringify({ error: "Report generation failed", details: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
