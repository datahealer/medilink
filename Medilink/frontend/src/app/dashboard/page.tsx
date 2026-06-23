export default function DashboardPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f9f4fa] p-8">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-md"
        style={{ background: "linear-gradient(135deg, #2E1A47, #46255f)" }}
      >
        <svg width="34" height="34" viewBox="0 0 44 44" fill="none">
          <path d="M22 6C13.163 6 6 13.163 6 22C6 30.837 13.163 38 22 38C30.837 38 38 30.837 38 22C38 13.163 30.837 6 22 6Z" stroke="#DFC8E7" strokeWidth="2.5"/>
          <path d="M22 13V31M13 22H31" stroke="#DFC8E7" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-[#2E1A47]" style={{ fontFamily: "Georgia, serif" }}>
        MediLink Dashboard
      </h1>
      <p className="text-sm text-[#2E1A47]/55">You're signed in! Dashboard coming soon.</p>
    </main>
  );
}
