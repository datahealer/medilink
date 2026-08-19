-- =============================================================================
-- C-2 verification — appointments SELECT scoping
-- =============================================================================
-- READ-ONLY. Safe to run against production, before or after applying
-- supabase/planned/20260819000020_appointments_scope_select.sql.
--
-- SECTION A asserts the policy inventory. SECTION B simulates every
-- (user x appointment) pair against the intended predicates and proves no pair is visible
-- without a legitimate relationship. It simulates the PREDICATES as a superuser; it does not
-- exercise the RLS engine itself, which needs two real logins on a non-production database.
--
-- Baseline measured 2026-08-19 BEFORE applying:
--   pairs total .................. 59950   (275 profiles x 218 appointments)
--   visible under the blanket .... 59950   (every pair)
--   visible under the new scopes ... 3557   (94% reduction)
--   true leaks ......................... 0
-- =============================================================================

-- ── SECTION A: no permissive SELECT/ALL policy may be unconditional. Expect 0. ──
SELECT 'A1 unconditional permissive SELECT policies (expect 0)' AS check,
       count(*)::text AS value
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'appointments'
  AND p.polpermissive AND p.polcmd IN ('r', '*')
  AND COALESCE(pg_get_expr(p.polqual, p.polrelid), 'true') = 'true';

-- ── SECTION A2: the scoped readers that must exist. Expect 6. ──
SELECT 'A2 scoped SELECT policies present' AS check, count(*)::text AS value
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'appointments'
  AND p.polname IN (
    'appointments_patient_read', 'appointments_doctor_read', 'appointments_technician_read',
    'appointments_facility_members', 'appointments_facility_admin_read',
    'appointments_staff_read', 'appointments_super_admin_read'
  );

-- ── SECTION B: leakage simulation. The TRUE LEAK row must be 0. ──
WITH vis AS (
  SELECT p.id AS uid, p.role::text AS role,
    (a.patient_id IN (SELECT pp.id FROM public.patient_profiles pp WHERE pp.user_id=p.id)) AS own_patient,
    (a.doctor_id  IN (SELECT d.id  FROM public.doctors d WHERE d.user_id=p.id))            AS treating_doctor,
    EXISTS (SELECT 1 FROM public.facility_members fm WHERE fm.user_id=p.id AND fm.facility_id=a.facility_id) AS fac_member,
    (p.role='technician' AND a.facility_id IN (SELECT t.facility_id FROM public.technicians t WHERE t.user_id=p.id)) AS tech,
    (a.facility_id IN (SELECT fa.facility_id FROM public.facility_admins fa WHERE fa.user_id=p.id AND fa.revoked_at IS NULL)) AS fa,
    (a.facility_id IN (SELECT fs.facility_id FROM public.facility_staff fs WHERE fs.user_id=p.id AND fs.is_active)) AS st,
    (p.role='super_admin') AS sa
  FROM public.profiles p CROSS JOIN public.appointments a
)
SELECT 'visible AFTER, total pairs'  AS metric, count(*) FILTER (WHERE own_patient OR treating_doctor OR fac_member OR tech OR fa OR st OR sa)::text AS v FROM vis
UNION ALL SELECT 'TRUE LEAK: visible with NO legitimate relationship at all',
  count(*) FILTER (WHERE (own_patient OR treating_doctor OR fac_member OR tech OR fa OR st OR sa)
                     AND NOT own_patient AND NOT treating_doctor AND NOT fac_member
                     AND NOT tech AND NOT fa AND NOT st AND NOT sa)::text FROM vis
UNION ALL SELECT 'granted ONLY by super_admin (expected: 218)',
  count(*) FILTER (WHERE sa AND NOT own_patient AND NOT treating_doctor AND NOT fac_member AND NOT tech AND NOT fa AND NOT st)::text FROM vis
UNION ALL SELECT 'granted ONLY by the NEW facility_admin policy',
  count(*) FILTER (WHERE fa AND NOT own_patient AND NOT treating_doctor AND NOT fac_member AND NOT tech AND NOT st AND NOT sa)::text FROM vis
UNION ALL SELECT 'granted ONLY by the NEW staff policy',
  count(*) FILTER (WHERE st AND NOT own_patient AND NOT treating_doctor AND NOT fac_member AND NOT tech AND NOT fa AND NOT sa)::text FROM vis
UNION ALL SELECT 'users who now see ZERO appointments',
  (SELECT count(*)::text FROM (SELECT uid FROM vis GROUP BY uid
     HAVING count(*) FILTER (WHERE own_patient OR treating_doctor OR fac_member OR tech OR fa OR st OR sa)=0) z)
ORDER BY 1;
