import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit") as any;

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "doctor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const service = createServiceSupabase();

    // FIX 2: Fetch prescription first
    const { data: prescription, error: pErr } = await service
      .from("prescriptions")
      .select(`
        *,
        doctors!prescriptions_doctor_id_fkey(
          full_name, specialty,
          facilities!doctors_facility_id_fkey(name)
        ),
        appointments!prescriptions_appointment_id_fkey(slot_date, type),
        patient_profiles!prescriptions_patient_id_fkey(
          profiles!patient_profiles_user_id_fkey(full_name)
        )
      `)
      .eq("id", id)
      .single();

    if (pErr || !prescription) {
      return NextResponse.json({ error: "Prescription not found" }, { status: 404 });
    }

    // FIX 3: Fetch doctor and validate ownership explicitly
    const { data: doctor, error: dErr } = await service
      .from("doctors")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (dErr || !doctor || doctor.id !== prescription.doctor_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // FIX 5: Skip regeneration if PDF already exists
    if (prescription.pdf_url) {
      const { data: existing } = await service.storage
        .from("prescriptions")
        .createSignedUrl(prescription.pdf_url, 3600);
      return NextResponse.json({ signed_url: existing?.signedUrl ?? null });
    }

    const docInfo = prescription.doctors as any;
    const facilityName = docInfo?.facilities?.name ?? "HAMS Healthcare";
    const doctorName = docInfo?.full_name ?? "";
    const doctorSpecialty = docInfo?.specialty ?? "";
    const patientInfo = prescription.patient_profiles as any;
    const patientName = patientInfo?.profiles?.full_name ?? "Patient";
    const issuedDate = prescription.issued_at
      ? new Date(prescription.issued_at).toLocaleDateString("en-GB")
      : new Date().toLocaleDateString("en-GB");
    const medications = (prescription.medications ?? []) as any[];

    // FIX 2: Error-safe PDF buffer pattern
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Uint8Array[] = [];

    await new Promise<void>((resolve, reject) => {
      doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      doc.on("end", resolve);
      doc.on("error", reject);

      // ── Header ────────────────────────────────────────
      doc.fontSize(22).font("Helvetica-Bold").text("HAMS Healthcare", { align: "center" });
      doc.fontSize(13).font("Helvetica").text(facilityName, { align: "center" });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1).stroke();
      doc.moveDown(0.5);

      // ── Title ─────────────────────────────────────────
      doc.fontSize(14).font("Helvetica-Bold").text("PRESCRIPTION", { align: "center" });
      doc.moveDown(0.7);

      // ── Meta grid ─────────────────────────────────────
      doc.fontSize(11).font("Helvetica-Bold").text("Doctor:", { continued: true });
      doc.font("Helvetica").text(`  Dr. ${doctorName}  (${doctorSpecialty})`);

      doc.font("Helvetica-Bold").text("Patient:", { continued: true });
      doc.font("Helvetica").text(`  ${patientName}`);

      doc.font("Helvetica-Bold").text("Date:", { continued: true });
      doc.font("Helvetica").text(`  ${issuedDate}`);

      doc.font("Helvetica-Bold").text("Ref:", { continued: true });
      doc.font("Helvetica").text(`  ${id.slice(0, 8).toUpperCase()}`);

      doc.moveDown(0.7);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke();
      doc.moveDown(0.7);

      // ── Medications ───────────────────────────────────
      doc.fontSize(13).font("Helvetica-Bold").text("Medications");
      doc.moveDown(0.5);

      medications.forEach((med: any, idx: number) => {
        doc.fontSize(11).font("Helvetica-Bold").text(`${idx + 1}.  ${med.name ?? ""}`);
        doc.fontSize(10).font("Helvetica")
          .text(`      Dosage:      ${med.dosage ?? ""}`)
          .text(`      Frequency:   ${med.frequency ?? ""}`)
          .text(`      Duration:    ${med.duration ?? ""}`);
        if (med.notes) doc.text(`      Notes:       ${med.notes}`);
        doc.moveDown(0.5);
      });

      // ── Instructions ──────────────────────────────────
      if (prescription.instructions) {
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke();
        doc.moveDown(0.5);
        doc.fontSize(13).font("Helvetica-Bold").text("Instructions");
        doc.fontSize(10).font("Helvetica").text(prescription.instructions);
      }

      // ── Footer ────────────────────────────────────────
      doc.fontSize(8)
        .font("Helvetica")
        .fillColor("gray")
        .text(
          "This is a digitally generated prescription. HAMS Healthcare.",
          50,
          doc.page.height - 55,
          { align: "center", width: 495 }
        );

      doc.end();
    });

    const buffer = Buffer.concat(chunks);
    const storagePath = `${id}.pdf`;

    const { error: uploadErr } = await service.storage
      .from("prescriptions")
      .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true });

    if (uploadErr) throw uploadErr;

    const { error: updateErr } = await service
      .from("prescriptions")
      .update({ pdf_url: storagePath })
      .eq("id", id);

    if (updateErr) throw updateErr;

    const { data: signed } = await service.storage
      .from("prescriptions")
      .createSignedUrl(storagePath, 3600);

    return NextResponse.json({ success: true, signed_url: signed?.signedUrl ?? null });
  } catch (err: any) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
