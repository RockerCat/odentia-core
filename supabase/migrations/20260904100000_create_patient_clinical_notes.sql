-- Odentia Core — Notas clínicas importantes (Historia Clínica → Resumen)
--
-- Persistent, PATIENT-level clinical notes — explicitly distinct from:
--   - patient_clinical_encounters.notes (a single encounter's own
--     free-text, tied to one visit)
--   - patient_medical_histories.observations (Antecedentes' general
--     observations field, already surfaced under its own real label —
--     see resumen-tab.tsx's former comment on why this card stayed a
--     placeholder rather than relabeling either of those)
-- Multiple notes per patient, manually curated by clinical professionals.
-- Same tenant-integrity/authorization shape as patient_clinical_documents:
-- composite FK ties patient_id to its real clinic_id structurally, every
-- write goes through a SECURITY DEFINER RPC gated by
-- is_active_clinical_professional() (defined in the
-- patient_medical_histories migration — reused as-is, not redefined),
-- logical archive only (never a physical delete, same convention as
-- patient_clinical_documents) to preserve clinical traceability.
create table public.patient_clinical_notes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null,
  content text not null check (length(btrim(content)) > 0),
  -- Who wrote it — always auth.uid() as resolved server-side by
  -- insert_patient_clinical_note() below, never a client-supplied value.
  -- Never changes after creation, even if later edited by someone else.
  created_by uuid references public.profiles (id) on delete set null,
  -- Who last edited the content — null until the first edit (see
  -- update_patient_clinical_note() below). Kept separate from created_by
  -- so a note authored by one professional and later corrected by
  -- another shows both, never silently rewriting authorship.
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Logical archive only — never a physical delete (preserves clinical
  -- traceability). archived_at null = active, non-null = archived; same
  -- nullable-timestamp shape already used by patient_clinical_documents,
  -- no separate boolean needed.
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null,
  constraint patient_clinical_notes_patient_clinic_fk
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade
);
-- clinic_id restrict (matches every other clinical table's own
-- convention — a clinic must never be deletable in a way that silently
-- wipes clinical records). patient_id cascade via the composite FK: a
-- note has no purpose once its patient is gone (patients has no real
-- delete path today either — active = false is the convention).

create trigger set_updated_at
  before update on public.patient_clinical_notes
  for each row execute function public.set_updated_at();

create index patient_clinical_notes_clinic_id_idx on public.patient_clinical_notes (clinic_id);
create index patient_clinical_notes_patient_id_idx on public.patient_clinical_notes (patient_id);
-- Speeds up the "active only" filter both the Resumen card and the PDF
-- builder apply (archived notes are never shown in either).
create index patient_clinical_notes_archived_at_idx on public.patient_clinical_notes (archived_at);

alter table public.patient_clinical_notes enable row level security;

-- READ: any active clinic member (clinic_admin/dentist/assistant) — same
-- shape as every other clinical table's own _select_member policy.
-- Assistant is read-only BY OMISSION here, not a separate role check: no
-- INSERT/UPDATE policy exists at all (see below), and the write RPCs each
-- re-check is_active_clinical_professional(), which an Assistant never
-- passes (that helper only allows dentist/clinic_admin with an active
-- professional_profile — see the patient_medical_histories migration).
-- This is the real enforcement boundary, not just the UI hiding buttons.
create policy patient_clinical_notes_select_member
  on public.patient_clinical_notes for select
  to authenticated
  using (public.is_clinic_member(clinic_id));
-- No INSERT/UPDATE/DELETE policy at all, deliberately — same reasoning as
-- patient_clinical_documents/patient_medical_histories: the write
-- authorization rule (dentist OR clinic_admin, AND an ACTIVE
-- professional_profile) isn't expressible as a simple row filter without
-- risking a client also forging created_by/updated_by or moving a row to
-- a different patient_id. Every write goes through the RPCs below
-- instead, which run SECURITY DEFINER and so need no table-level INSERT/
-- UPDATE grant for `authenticated` at all — only SELECT (for the read
-- policy above to be reachable) and EXECUTE on the RPCs.
grant select on public.patient_clinical_notes to authenticated;

-- Create — resolves the patient's REAL clinic_id server-side (never
-- accepts one as an argument), checks is_active_clinical_professional()
-- for that clinic, then inserts with created_by always auth.uid().
create function public.insert_patient_clinical_note(
  p_patient_id uuid,
  p_content text
)
returns public.patient_clinical_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_result public.patient_clinical_notes;
begin
  select clinic_id into v_clinic_id from public.patients where id = p_patient_id;
  if v_clinic_id is null then
    raise exception 'patient not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  insert into public.patient_clinical_notes (clinic_id, patient_id, content, created_by)
  values (v_clinic_id, p_patient_id, p_content, auth.uid())
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.insert_patient_clinical_note(uuid, text) from public;
grant execute on function public.insert_patient_clinical_note(uuid, text) to authenticated;

-- Edit content only — never patient_id/clinic_id/created_by/archived_*.
-- Resolves clinic_id from the note row itself (never trusts a
-- client-supplied value), same authorization boundary as every other
-- clinical write here. The table's own check constraint (content must be
-- non-blank) applies to this UPDATE too, not just the INSERT above.
create function public.update_patient_clinical_note(
  p_note_id uuid,
  p_content text
)
returns public.patient_clinical_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_result public.patient_clinical_notes;
begin
  select clinic_id into v_clinic_id from public.patient_clinical_notes where id = p_note_id;
  if v_clinic_id is null then
    raise exception 'note not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  update public.patient_clinical_notes
  set content = p_content, updated_by = auth.uid()
  where id = p_note_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.update_patient_clinical_note(uuid, text) from public;
grant execute on function public.update_patient_clinical_note(uuid, text) to authenticated;

-- Logical archive. Same authorization boundary as above. Idempotent by
-- construction (re-archiving just re-sets archived_at/archived_by to the
-- latest action) — no unarchive path yet, same convention as
-- patient_clinical_documents.
create function public.archive_patient_clinical_note(p_note_id uuid)
returns public.patient_clinical_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_result public.patient_clinical_notes;
begin
  select clinic_id into v_clinic_id from public.patient_clinical_notes where id = p_note_id;
  if v_clinic_id is null then
    raise exception 'note not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  update public.patient_clinical_notes
  set archived_at = now(), archived_by = auth.uid()
  where id = p_note_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.archive_patient_clinical_note(uuid) from public;
grant execute on function public.archive_patient_clinical_note(uuid) to authenticated;
