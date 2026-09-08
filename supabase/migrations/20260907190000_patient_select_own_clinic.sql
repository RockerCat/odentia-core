-- Odentia Core — Patient Portal: let a linked patient read her OWN
-- clinic's row
--
-- Real gap found while QA-ing resolve-patient-context.ts directly against
-- the live project: clinics_select_member_or_superadmin (foundation RLS
-- migration) only grants SELECT to a clinic_memberships member or a
-- platform superadmin — a real Patient is neither (see CLAUDE.md Domain
-- Model: "not a clinic team member"), so a linked patient could read her
-- OWN patients row (patients_select_own_via_link already covers that) but
-- got ZERO rows back from the embedded clinics join — confirmed directly:
--   BEGIN; SET LOCAL ROLE authenticated;
--   SELECT ... FROM patient_user_links l JOIN patients p ...
--     JOIN clinics c ON c.id = p.clinic_id WHERE l.profile_id = auth.uid();
--   → zero rows (the patients row alone, unjoined, DOES come back — only
--     adding the clinics join makes it disappear, since a plain join
--     against a table you can't SELECT never matches).
--
-- Same additive-policy pattern as patients_select_own_via_link — Postgres
-- ORs every permissive policy for the same command, so this never touches
-- clinics_select_member_or_superadmin's own staff/superadmin access.
-- Scoped through the same real link the patient row itself is (patients →
-- patient_user_links), never a client-supplied clinic_id.
create policy clinics_select_own_via_patient_link
  on public.clinics for select
  to authenticated
  using (
    exists (
      select 1
      from public.patients p
      join public.patient_user_links l on l.patient_id = p.id
      where p.clinic_id = clinics.id
        and l.profile_id = auth.uid()
    )
  );
