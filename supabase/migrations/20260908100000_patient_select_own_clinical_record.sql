-- Odentia Core — Patient Portal: Mi Historia Clínica (real, read-only)
--
-- Every real clinical table already has exactly ONE select policy —
-- `<table>_select_member`, staff-only (`is_clinic_member`/`is_clinic_role`).
-- None of them has any patient_user_links branch (confirmed by reading
-- each table's own migration). This migration adds ONE additive,
-- permissive SELECT policy per table — same "Postgres ORs every
-- permissive policy for the same command" pattern already used by
-- patients_select_own_via_link/appointments_select_own_via_patient_link —
-- so the existing staff policies are never touched, narrowed, or
-- re-evaluated differently for a staff caller.
--
-- No INSERT/UPDATE/DELETE grant or policy is added anywhere in this
-- migration, on any table or the storage bucket: a Patient reads her own
-- real expediente, exactly as staff already sees it, and writes nothing.
-- Every write RPC in this schema already requires
-- is_active_clinical_professional() (dentist/clinic_admin with an ACTIVE
-- professional_profile) — a Patient can never pass that check, so even a
-- theoretical direct RPC call would be rejected server-side regardless of
-- this migration.
--
-- Isolation, every policy below: matching `patient_id` alone already
-- guarantees clinic isolation too, because every one of these tables ties
-- patient_id to its real clinic_id via a COMPOSITE FK to `patients (id,
-- clinic_id)` (see each table's own migration) — a row's clinic_id can
-- never disagree with its patient's own. Same reasoning
-- patients_select_own_via_link/appointments_select_own_via_patient_link
-- already rely on.

-- ============================================================
-- Antecedentes — public.patient_medical_histories
-- ============================================================
create policy patient_medical_histories_select_own_via_patient_link
  on public.patient_medical_histories for select
  to authenticated
  using (
    exists (
      select 1
      from public.patient_user_links l
      where l.patient_id = patient_medical_histories.patient_id
        and l.profile_id = auth.uid()
    )
  );

-- ============================================================
-- Odontograma — public.patient_tooth_findings
-- ============================================================
create policy patient_tooth_findings_select_own_via_patient_link
  on public.patient_tooth_findings for select
  to authenticated
  using (
    exists (
      select 1
      from public.patient_user_links l
      where l.patient_id = patient_tooth_findings.patient_id
        and l.profile_id = auth.uid()
    )
  );

-- ============================================================
-- Atenciones — public.patient_clinical_encounters
--
-- CRITICAL: `finalized_at is not null` is baked into the USING clause
-- itself, not left to fetchPatientClinicalEncounters' own query filter
-- (which stays, defense-in-depth, same convention as every other
-- "clinic_id filter redundant with RLS, kept anyway" fetcher in this
-- codebase) — a Patient can never SELECT a draft/in_progress encounter
-- row at all, at the database layer, regardless of what any future
-- Portal query does or doesn't filter client-side. This is the actual
-- enforcement boundary for "Paciente NO puede ver encounters en draft/
-- in_progress" — never only a UI filter.
-- ============================================================
create policy patient_clinical_encounters_select_own_finalized_via_patient_link
  on public.patient_clinical_encounters for select
  to authenticated
  using (
    finalized_at is not null
    and exists (
      select 1
      from public.patient_user_links l
      where l.patient_id = patient_clinical_encounters.patient_id
        and l.profile_id = auth.uid()
    )
  );

-- ============================================================
-- Documentos — public.patient_clinical_documents (metadata only; the
-- actual bytes are gated separately below, on storage.objects)
-- ============================================================
create policy patient_clinical_documents_select_own_via_patient_link
  on public.patient_clinical_documents for select
  to authenticated
  using (
    exists (
      select 1
      from public.patient_user_links l
      where l.patient_id = patient_clinical_documents.patient_id
        and l.profile_id = auth.uid()
    )
  );

-- ============================================================
-- Notas clínicas importantes — public.patient_clinical_notes
--
-- No "internal"/staff-only classification exists anywhere on this table
-- (no such column, no such semantic in its own migration comment — see
-- that migration: notes are explicitly PATIENT-level clinical content,
-- distinct from an encounter's own notes and from Antecedentes'
-- observations, never marked as administrative-only). Kept visible to
-- the Patient as-is, same content staff sees — inventing a new
-- confidentiality tier here would be exactly the "no inventar una
-- política nueva" this task explicitly warns against.
-- ============================================================
create policy patient_clinical_notes_select_own_via_patient_link
  on public.patient_clinical_notes for select
  to authenticated
  using (
    exists (
      select 1
      from public.patient_user_links l
      where l.patient_id = patient_clinical_notes.patient_id
        and l.profile_id = auth.uid()
    )
  );

-- ============================================================
-- Plan de tratamiento — public.patient_treatment_plan_items only.
-- patient_treatment_plans (the one-row-per-patient parent) is never read
-- directly by any client fetcher (fetchPatientTreatmentPlanItems reads
-- only the items table, which already carries its own denormalized
-- patient_id/clinic_id — see that migration's own comment on why), so no
-- policy is added there.
-- ============================================================
create policy patient_treatment_plan_items_select_own_via_patient_link
  on public.patient_treatment_plan_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.patient_user_links l
      where l.patient_id = patient_treatment_plan_items.patient_id
        and l.profile_id = auth.uid()
    )
  );

-- ============================================================
-- Documentos — the actual file bytes (storage.objects, "clinical-documents"
-- bucket). The existing clinical_documents_select_member policy only
-- checks the path's clinic_id segment (any clinic member can read any
-- patient's documents in that clinic — deliberate, staff-wide, see that
-- migration). A Patient gets her own, narrower policy instead: BOTH the
-- clinic_id AND patient_id path segments must match a real patient linked
-- to her account — never clinic-wide, isolating her to her own folder
-- exactly (`<clinic_id>/<patient_id>/...`, the same convention
-- insert_patient_clinical_document already enforces at write time).
-- getSignedDocumentUrl() (clinical-documents-actions.ts, reused unchanged
-- by the Portal) mints a signed URL only when this policy allows the
-- underlying object read — so a Patient can never mint a signed URL for
-- another patient's file, not just be blocked by a hidden UI button.
-- ============================================================
create function public.clinical_document_path_patient_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_patient_id uuid;
begin
  begin
    v_patient_id := split_part(object_name, '/', 2)::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return v_patient_id;
end;
$$;

create policy clinical_documents_select_own_via_patient_link
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'clinical-documents'
    and exists (
      select 1
      from public.patient_user_links l
      join public.patients pt on pt.id = l.patient_id
      where l.profile_id = auth.uid()
        and pt.id = public.clinical_document_path_patient_id(name)
        and pt.clinic_id = public.clinical_document_path_clinic_id(name)
    )
  );

-- ============================================================
-- Author name display — Antecedentes/Odontograma/Atenciones/Documentos
-- each show "Actualizado/Atendido/Subido por <nombre>" (resolve-updated-by.ts,
-- reused as-is by the Portal — see resolve-updated-by.ts's own updated
-- comment). That helper resolves names via fetchTeamMembers(), which reads
-- clinic_memberships/professional_profiles/profiles — ALL staff-only for
-- SELECT (same gap get_my_appointment_professionals/
-- get_my_clinic_professionals already worked around for Agenda/Solicitud
-- de Cita). Rather than widen those staff-sensitive tables' own RLS, this
-- is the same narrow SECURITY DEFINER shape those two already established:
-- returns display info ONLY for dentist/clinic_admin members of the
-- CALLING patient's own clinic (resolved via patient_user_links, never a
-- client-supplied clinic_id) — never assistants (who can never author
-- clinical data — is_active_clinical_professional() only ever allows
-- dentist/clinic_admin), never email/phone/license/bio, and nothing about
-- any OTHER clinic. resolve-updated-by.ts calls this only as a fallback
-- when fetchTeamMembers() itself comes back empty (the real signal that
-- the caller has no staff-level access at all) — a legitimate staff
-- caller never reaches this RPC.
create function public.get_my_clinical_record_authors()
returns table (
  profile_id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  specialty_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    prof.id,
    prof.first_name,
    prof.last_name,
    prof.avatar_url,
    s.name
  from public.profiles prof
  join public.clinic_memberships m on m.profile_id = prof.id
  left join public.professional_profiles pp on pp.clinic_membership_id = m.id
  left join public.specialties s on s.id = pp.primary_specialty_id
  where m.role in ('dentist', 'clinic_admin')
    and exists (
      select 1
      from public.patient_user_links l
      join public.patients pt on pt.id = l.patient_id
      where l.profile_id = auth.uid()
        and pt.clinic_id = m.clinic_id
    );
$$;

revoke execute on function public.get_my_clinical_record_authors() from public;
grant execute on function public.get_my_clinical_record_authors() to authenticated;
