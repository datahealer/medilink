import { type ReactNode } from "react";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { HomeFooter } from "@/components/home/HomeFooter";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] flex flex-col">
      <DashboardNav />
      <main className="flex-1">{children}</main>
      <HomeFooter />
    </div>
  );
}
