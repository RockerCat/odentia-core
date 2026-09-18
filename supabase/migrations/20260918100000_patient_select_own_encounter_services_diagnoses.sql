-- Odentia Core — Patient Portal: extend "Mi Historia Clínica" to
-- Diagnósticos/Servicios realizados (encounter_diagnoses/encounter_services)
--
-- Master "consolidar Servicios realizados como única fuente de verdad":
-- the Atención screen's legacy "Procedimientos realizados" write-path
-- (patient_clinical_encounters.treatment, readable by a Patient since
-- 20260908100000) has been retired for NEW atenciones — "Servicios
-- realizados" (encounter_services) is now the only structured record of
-- "what was done". Without this migration, a Patient viewing her own
-- Portal history for a NEW atención would see nothing under "qué se
-- hizo" — /portal/historia/page.tsx's own existing comment already
-- documents this exact gap ("a Patient isn't a clinic member, so RLS
-- silently returns zero rows here... extending that read would need its
-- own additive RLS policy, out of this task's scope") — this migration
-- closes it.
--
-- Purely additive SELECT-only policies, same "Postgres ORs every
-- permissive policy for the same command" pattern
-- patient_clinical_encounters_select_own_finalized_via_patient_link
-- (20260908100000) already established — the existing staff-only
-- `_select_member` policy on each table (public.is_clinic_member(clinic_id))
-- is never touched, narrowed, or re-evaluated differently for a staff
-- caller. No INSERT/UPDATE/DELETE policy or grant added anywhere —
-- Patient writes nothing here, same as everywhere else in this schema
-- (every write RPC already requires is_active_clinical_professional(),
-- which a Patient can never pass).
--
-- Isolation: both tables have no direct patient_id column — they FK to
-- patient_clinical_encounters (encounter_id, clinic_id) instead — so the
-- policy joins through that parent row to reach patient_id, exactly the
-- same relationship `EncounterClinicalData`/fetchEncounterClinicalDataForEncounters
-- already reads through client-side. `finalized_at is not null` is baked
-- into the USING clause itself, not left to any query's own filter —
-- same reasoning as patient_clinical_encounters_select_own_finalized_via_patient_link's
-- own comment: a Patient can never SELECT a draft/in_progress encounter's
-- diagnoses/services at the database layer, regardless of what any
-- future Portal query does or doesn't filter client-side. `clinic_id` is
-- never trusted from the row being checked — it's re-derived from the
-- SAME patient_clinical_encounters row the encounter_id/finalized_at
-- check already joins to, so a row can never claim a clinic_id that
-- disagrees with its own real parent (matching the FK's own guarantee).
--
-- No client code changes ship in this migration — the Portal read path
-- change (page.tsx passing this through to AtencionesTab, already used
-- unmodified by the Portal) is a separate, non-DB change.

-- ============================================================
-- Diagnósticos — public.encounter_diagnoses
-- ============================================================
create policy encounter_diagnoses_select_own_via_patient_link
  on public.encounter_diagnoses for select
  to authenticated
  using (
    exists (
      select 1
      from public.patient_clinical_encounters pce
      join public.patient_user_links l on l.patient_id = pce.patient_id
      where pce.id = encounter_diagnoses.encounter_id
        and pce.finalized_at is not null
        and l.profile_id = auth.uid()
    )
  );

-- ============================================================
-- Servicios realizados — public.encounter_services
-- ============================================================
create policy encounter_services_select_own_via_patient_link
  on public.encounter_services for select
  to authenticated
  using (
    exists (
      select 1
      from public.patient_clinical_encounters pce
      join public.patient_user_links l on l.patient_id = pce.patient_id
      where pce.id = encounter_services.encounter_id
        and pce.finalized_at is not null
        and l.profile_id = auth.uid()
    )
  );
