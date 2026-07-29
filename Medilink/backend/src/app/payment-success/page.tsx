"use client";

import { useEffect, useState } from "react";

/**
 * Thawani redirects the hosted-checkout browser here (http/https — Thawani rejects
 * custom schemes). This page immediately bounces back into the MediLink mobile app
 * via its deep link, and offers a manual button as a fallback.
 */
export default function PaymentSuccessReturn() {
  const [deepLink, setDeepLink] = useState("medilink://booking/payment-success");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const apptId = params.get("appointment_id") ?? "";
    const link = `medilink://booking/payment-success${apptId ? `?appointment_id=${apptId}` : ""}`;
    setDeepLink(link);
    const t = setTimeout(() => {
      window.location.href = link;
    }, 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <main style={wrap}>
      <div style={card}>
        <div style={{ ...badge, background: "#DCF3E7", color: "#2f8f63" }}>✓</div>
        <h1 style={h1}>Payment complete</h1>
        <p style={p}>Returning you to the MediLink app…</p>
        <a href={deepLink} style={btn}>Open MediLink</a>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F9F4FA", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: 24 };
const card: React.CSSProperties = { background: "#fff", borderRadius: 22, padding: "40px 28px", maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 8px 30px rgba(46,26,71,0.12)" };
const badge: React.CSSProperties = { width: 72, height: 72, borderRadius: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, margin: "0 auto 18px" };
const h1: React.CSSProperties = { color: "#241338", fontSize: 22, margin: "0 0 8px" };
const p: React.CSSProperties = { color: "#6c6379", fontSize: 14, margin: "0 0 22px" };
const btn: React.CSSProperties = { display: "inline-block", background: "#2E1A47", color: "#fff", textDecoration: "none", padding: "13px 22px", borderRadius: 14, fontSize: 15, fontWeight: 600 };
