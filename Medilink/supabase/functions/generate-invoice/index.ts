import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib";

serve(async (req) => {
  try {
    const { payment_id } = await req.json();

    if (!payment_id) {
      return new Response(JSON.stringify({ error: "Missing payment_id" }), {
        status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ✅ FETCH FULL DATA
    const { data: payment, error } = await supabase
      .from("payments")
      .select(`
        *,
        profiles:patient_id (
          full_name,
          email
        ),
        appointments (
          id,
          doctors (
            full_name
          ),
          facilities (
            name,
            address,
            logo_url
          )
        )
      `)
      .eq("id", payment_id)
      .single();

    if (error || !payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404,
      });
    }

    // ✅ GENERATE INVOICE NUMBER
    const invoiceNumber =
      payment.invoice_number ||
      `INV-${new Date().getFullYear()}-${payment.id.slice(0, 6)}`;

    // 💰 CALCULATIONS
    const subtotal = Number(payment.amount);
    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    // 📄 CREATE PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = 750;

    // Attempt to embed facility logo (non-fatal if fetch/embed fails)
    let facilityLogoImage: any = null;
    const logoUrl = (payment.appointments as any)?.facilities?.logo_url;
    if (logoUrl) {
      try {
        const imgRes = await fetch(logoUrl);
        const imgBytes = await imgRes.arrayBuffer();
        const contentType = imgRes.headers.get("content-type") ?? "";
        if (contentType.includes("png")) {
          facilityLogoImage = await pdfDoc.embedPng(imgBytes);
        } else {
          facilityLogoImage = await pdfDoc.embedJpg(imgBytes);
        }
      } catch {
        // continue without logo
      }
    }

    const draw = (text: string, size = 12, bold = false, x = 50) => {
      page.drawText(text, {
        x,
        y,
        size,
        font: bold ? boldFont : font,
        color: rgb(0, 0, 0),
      });
      y -= size + 8;
    };

    const divider = () => {
      y -= 10;
      page.drawLine({
        start: { x: 50, y },
        end: { x: 550, y },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= 20;
    };

    // 🏥 HEADER
    if (facilityLogoImage) {
      const logoDims = facilityLogoImage.scaleToFit(60, 60);
      page.drawImage(facilityLogoImage, {
        x: 50,
        y: y - logoDims.height + 20,
        width: logoDims.width,
        height: logoDims.height,
      });
      draw("HAMS - Healthcare Management System", 18, true, 125);
      draw("INVOICE", 16, true, 125);
      y -= 20;
    } else {
      draw("HAMS - Healthcare Management System", 18, true);
      draw("INVOICE", 16, true);
    }
    divider();

    // 📄 META
    draw(`Invoice No: ${invoiceNumber}`, 12, true);
    draw(`Date: ${new Date(payment.created_at).toLocaleString()}`);
    draw(`Appointment ID: ${payment.appointment_id}`);
    divider();

    // 🏥 FACILITY
    draw("Facility Details", 14, true);
    draw(
      `Name: ${payment.appointments?.facilities?.name || "N/A"}`
    );
    draw(
      `Address: ${
        payment.appointments?.facilities?.address || "N/A"
      }`
    );
    divider();

    // 👨‍⚕️ DOCTOR
    draw("Doctor", 14, true);
    draw(
      payment.appointments?.doctors?.full_name || "N/A"
    );
    divider();

    // 👤 PATIENT
    draw("Patient", 14, true);
    draw(payment.profiles?.full_name || "N/A");
    draw(payment.profiles?.email || "N/A");
    divider();

    // 💰 BILLING
    draw("Billing Details", 14, true);
    draw(`Service: Consultation`);
    draw(`Subtotal: ${subtotal.toFixed(2)} ${payment.currency}`);
    draw(`Tax (5%): ${tax.toFixed(2)} ${payment.currency}`);
    draw(`Total: ${total.toFixed(2)} ${payment.currency}`, 12, true);
    divider();

    // 📌 FOOTER
    draw("Thank you for choosing HAMS!", 12, true);
    draw("This is a system-generated invoice.", 10);

    const pdfBytes = await pdfDoc.save();

    const filePath = `${payment.id}.pdf`;

    // ☁️ UPLOAD
    const { error: uploadError } = await supabase.storage
      .from("invoices")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: uploadError.message }),
        { status: 500 }
      );
    }

    const { data: publicUrl } = supabase.storage
      .from("invoices")
      .getPublicUrl(filePath);

    // 💾 SAVE IN DB
    await supabase
      .from("payments")
      .update({
        invoice_url: publicUrl.publicUrl,
        invoice_number: invoiceNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl.publicUrl,
        invoice_number: invoiceNumber,
      }),
      { status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "Invoice generation failed",
        details: err.message,
      }),
      { status: 500 }
    );
  }
});