-- Odentia Core — Patient Portal: let a linked patient read her OWN
-- clinic's sede(s)
--
-- `/portal/clinica` needs the real primary location's address (see
-- fetchPrimaryLocation, already used by staff Clínica) to replace the
-- mock MY_CLINIC address — same real gap the clinics_select_own_via_
-- patient_link migration already found and fixed for `clinics` itself:
-- clinic_locations_select_member_or_superadmin (foundation RLS) only
-- grants SELECT to a clinic_memberships member or a platform superadmin —
-- a real Patient is neither, so fetchPrimaryLocation would return zero
-- rows for a Patient caller today.
--
-- Same additive-policy pattern as clinics_select_own_via_patient_link/
-- patients_select_own_via_link — Postgres ORs every permissive policy for
-- the same command, so this never touches clinic_locations_select_member_
-- or_superadmin's own staff/superadmin access, and grants nothing beyond
-- SELECT (select is already granted broadly to `authenticated` — see
-- 20260828100000 — RLS is the only gap here, no new GRANT needed). Scoped
-- through the same real link the patient row itself is (patients →
-- patient_user_links), never a client-supplied clinic_id — matching
-- patient_id alone already guarantees clinic isolation, since a location's
-- clinic_id can never disagree with the patient's own (both ultimately
-- resolve through the same real clinics row).
create policy clinic_locations_select_own_via_patient_link
  on public.clinic_locations for select
  to authenticated
  using (
    exists (
      select 1
      from public.patients p
      join public.patient_user_links l on l.patient_id = p.id
      where p.clinic_id = clinic_locations.clinic_id
        and l.profile_id = auth.uid()
    )
  );
