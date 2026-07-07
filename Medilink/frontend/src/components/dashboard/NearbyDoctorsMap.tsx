"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/** Muscat, Oman — used when geolocation is denied/unavailable so the map isn't empty. */
const DEFAULT_CENTER: [number, number] = [23.588, 58.3829];

type Facility = {
  id: string;
  name: string;
  type: string;
  address: unknown;
  rating: number;
  review_count: number;
  distance_km: number;
  lat: number;
  lng: number;
};

type FacilityDoctor = {
  id: string;
  full_name: string;
  specialty: string | null;
  facility_id: string | null;
};

function formatAddress(address: unknown): string {
  if (!address || typeof address !== "object") return "";
  const a = address as Record<string, unknown>;
  const parts = [a.street, a.area, a.city, a.region].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  return parts.join(", ");
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

const userIcon = L.divIcon({
  html: `<div style="font-size:22px;line-height:1;transform:translate(-50%,-90%)">📍</div>`,
  className: "",
  iconSize: [0, 0],
});
const facilityIcon = L.divIcon({
  html: `<div style="font-size:22px;line-height:1;transform:translate(-50%,-90%)">🏥</div>`,
  className: "",
  iconSize: [0, 0],
});

export default function NearbyDoctorsMap({ isAr }: { isAr: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const [center, setCenter] = useState<[number, number] | null>(null);
  const [locDenied, setLocDenied] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [doctorsByFacility, setDoctorsByFacility] = useState<Record<string, FacilityDoctor[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocDenied(true);
      setCenter(DEFAULT_CENTER);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => setCenter([pos.coords.latitude, pos.coords.longitude]),
      () => {
        setLocDenied(true);
        setCenter(DEFAULT_CENTER);
      },
      { timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createBrowserSupabaseClient();
      const { data: nearby } = await supabase.rpc("get_nearby_facilities", {
        p_lat: center[0],
        p_lng: center[1],
        p_radius_m: 15000,
      });
      if (cancelled) return;
      const list = ((nearby ?? []) as unknown as Facility[]).filter(
        f => typeof f.lat === "number" && typeof f.lng === "number" && !Number.isNaN(f.lat) && !Number.isNaN(f.lng)
      );
      setFacilities(list);

      if (list.length > 0) {
        const { data: doctors } = await supabase
          .from("doctors")
          .select("id, full_name, specialty, facility_id")
          .eq("is_active", true)
          .in("facility_id", list.map(f => f.id))
          .limit(100);
        if (cancelled) return;
        const grouped: Record<string, FacilityDoctor[]> = {};
        for (const doc of (doctors ?? []) as FacilityDoctor[]) {
          if (!doc.facility_id) continue;
          (grouped[doc.facility_id] ??= []).push(doc);
        }
        setDoctorsByFacility(grouped);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [center]);

  // Create the map exactly once per mounted container — guards against React
  // Strict Mode's dev-only double-invoke, which otherwise trips Leaflet's
  // "Map container is already initialized" check on the second pass.
  useEffect(() => {
    if (!center || !containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(center, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    L.marker(center, { icon: userIcon }).addTo(map).bindPopup(isAr ? "أنت هنا" : "You are here");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  // Redraw facility markers whenever the nearby list (or their doctors) changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = facilities.map(f => {
      const address = formatAddress(f.address);
      const docs = (doctorsByFacility[f.id] ?? []).slice(0, 3);
      const html = `
        <div style="min-width:180px">
          <p style="font-weight:700;margin-bottom:2px">${escapeHtml(f.name)}</p>
          ${address ? `<p style="font-size:12px;color:#666;margin-bottom:4px">${escapeHtml(address)}</p>` : ""}
          <p style="font-size:12px;margin-bottom:6px">${f.distance_km} km · ★ ${f.rating.toFixed(1)}</p>
          ${docs
            .map(doc => `<a href="/dashboard/find-doctors/${doc.id}" style="display:block;font-size:12px;color:#46255f;margin-bottom:2px">${escapeHtml(doc.full_name)}${doc.specialty ? " · " + escapeHtml(doc.specialty) : ""}</a>`)
            .join("")}
        </div>`;
      return L.marker([f.lat, f.lng], { icon: facilityIcon }).addTo(map).bindPopup(html);
    });
  }, [facilities, doctorsByFacility]);

  if (!center) {
    return (
      <div className="h-72 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] flex items-center justify-center bg-white dark:bg-[#1a1030]">
        <div className="w-6 h-6 rounded-full border-2 border-[#46255f]/20 border-t-[#46255f] dark:border-[#DFC8E7]/20 dark:border-t-[#DFC8E7] animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {locDenied && (
        <p className={`text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 mb-2 ${isAr ? "text-right" : ""}`}>
          {isAr ? "تعذر الوصول إلى موقعك — نعرض عيادات بالقرب من مسقط." : "Couldn't access your location — showing clinics near Muscat."}
        </p>
      )}
      <div ref={containerRef} className="h-72 rounded-2xl overflow-hidden border border-[#e7dcee] dark:border-[#3a2560]" />
      {!loading && facilities.length === 0 && (
        <p className={`text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 mt-2 ${isAr ? "text-right" : ""}`}>
          {isAr ? "لا توجد عيادات قريبة ضمن هذا النطاق." : "No clinics found nearby within this range."}
        </p>
      )}
    </div>
  );
}
