import { redirect } from "next/navigation";
import { getServerUserAndRole } from "@/lib/auth/getServerSession";
import type { Database } from "@medilink/shared";

export async function requireRole(allowedRoles: Database["public"]["Enums"]["user_role"][]) {
  const { user, role, profile } = await getServerUserAndRole();

  if (!user) {
    redirect("/login");
  }

  const userRole = (role ?? "patient") as Database["public"]["Enums"]["user_role"];

  if (!allowedRoles.includes(userRole)) {
    redirect("/unauthorized");
  }

  return {
    user,
    profile: {
      role: userRole,
      full_name: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
    },
  };
}
