-- Odentia Core — Patient Portal: "Mis citas" real data
--
-- appointments_select_scoped (foundation RLS) only covers staff, via
-- can_access_appointment(clinic_id, professional_profile_id) — clinic_admin/
-- assistant by clinic role, or a dentist by owning the professional_profile.
-- No branch at all for a Patient (see CLAUDE.md Domain Model: "not a clinic
-- team member") — confirmed live: `can_access_appointment`'s definition has
-- no patient_user_links reference anywhere.
--
-- Same additive-policy pattern as patients_select_own_via_link (Postgres ORs
-- every permissive policy for the same command, so this never touches
-- appointments_select_scoped's own staff access). Scoped only by patient_id,
-- never a client-supplied clinic_id — safe because
-- appointments_patient_clinic_fk is a COMPOSITE FK (patient_id, clinic_id)
-- REFERENCES patients(id, clinic_id): an appointment's clinic_id can never
-- disagree with its patient's own clinic_id, so matching patient_id alone
-- already guarantees clinic isolation, exactly like patients_select_own_via_link
-- itself doesn't need to check clinic_id either.
--
-- SELECT only — no UPDATE/INSERT/DELETE for a Patient in this Ninja (no
-- confirmar/cancelar/reprogramar/solicitar yet).
create policy appointments_select_own_via_patient_link
  on public.appointments for select
  to authenticated
  using (
    exists (
      select 1
      from public.patient_user_links l
      where l.patient_id = appointments.patient_id
        and l.profile_id = auth.uid()
    )
  );
