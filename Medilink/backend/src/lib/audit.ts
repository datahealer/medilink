// Re-export from the canonical location so existing imports keep working.
// New code should import from "@/lib/audit/logAudit" directly.
export { logAudit as fireAuditLog, getClientIp } from "@/lib/audit/logAudit";
