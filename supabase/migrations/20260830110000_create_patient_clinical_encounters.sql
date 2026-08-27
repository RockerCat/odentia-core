-- Odentia Core — Atenciones clínicas reales (Historia Clínica → Atenciones)
--
-- One row per clinical encounter actually attended (motivo de consulta,
-- diagnóstico/valoración, tratamiento realizado, notas clínicas) — richer
-- than the demo's mock ClinicalEncounterRecord (which only carried
-- treatment/findings/status, borrowed from AppointmentStatus purely for
-- its own visual badge — see clinical-record-screen.tsx's own comment on
-- that type). No status column here: a row in this table already IS a
-- completed clinical event, not a scheduled one — AppointmentStatus values
-- like "confirmed"/"pending" don't apply to something that already
-- happened. occurred_at is a single real timestamp (fecha + hora), not the
-- demo's separate dateLabel/timeLabel display strings.
--
-- Same tenant-integrity pattern as patient_medical_histories/
-- patient_tooth_findings: composite FK ties patient_id to its real
-- clinic_id structurally, not just by convention.
create table public.patient_clinical_encounters (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null,
  occurred_at timestamptz not null default now(),
  reason text,
  diagnosis text,
  treatment text,
  notes text,
  -- Who attended the patient — always auth.uid() as resolved server-side
  -- by insert_patient_clinical_encounter() below, never a client-supplied
  -- value.
  attended_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_clinical_encounters_patient_clinic_fk
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade
);

create trigger set_updated_at
  before update on public.patient_clinical_encounters
  for each row execute function public.set_updated_at();

create index patient_clinical_encounters_clinic_id_idx on public.patient_clinical_encounters (clinic_id);
create index patient_clinical_encounters_patient_id_idx on public.patient_clinical_encounters (patient_id);

alter table public.patient_clinical_encounters enable row level security;

-- READ: any active clinic member (clinic_admin/dentist/assistant) — same
-- shape as patient_medical_histories_select_member/
-- patient_tooth_findings_select_member.
create policy patient_clinical_encounters_select_member
  on public.patient_clinical_encounters for select
  to authenticated
  using (public.is_clinic_member(clinic_id));
-- No INSERT/UPDATE/DELETE policy at all, deliberately — same reasoning as
-- the other clinical tables: the write authorization rule (active clinical
-- professional) and server-derived clinic_id/attended_by aren't safely
-- expressible as a row filter. No DELETE RPC either (see task scope: a
-- recorded encounter is never removable from here). No UPDATE RPC either
-- — nothing in this task's scope calls for editing a past encounter.
grant select on public.patient_clinical_encounters to authenticated;

-- Register one encounter. Resolves the patient's REAL clinic_id
-- server-side (never accepts one as an argument), checks
-- is_active_clinical_professional() (already defined by the
-- patient_medical_histories migration — reused as-is, not redefined),
-- then inserts. attended_by is always auth.uid(), never client-supplied.
--
-- No UI in Historia Clínica calls this yet: the approved demo's own
-- Atenciones tab has no "register" action of its own — encounters are
-- only ever created by completing an appointment in Agenda
-- (ClinicalEncounterScreen), and Agenda is still fully mock (see
-- CLAUDE.md task scope: don't invent a second creation flow, don't touch
-- Agenda). This RPC exists so writes are already tenant-safe and
-- permission-gated for whenever that real integration lands.
create function public.insert_patient_clinical_encounter(
  p_patient_id uuid,
  p_occurred_at timestamptz,
  p_reason text,
  p_diagnosis text,
  p_treatment text,
  p_notes text
)
returns public.patient_clinical_encounters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_result public.patient_clinical_encounters;
begin
  select clinic_id into v_clinic_id from public.patients where id = p_patient_id;
  if v_clinic_id is null then
    raise exception 'patient not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  insert into public.patient_clinical_encounters (
    clinic_id, patient_id, occurred_at, reason, diagnosis, treatment, notes, attended_by
  )
  values (
    v_clinic_id, p_patient_id, coalesce(p_occurred_at, now()), p_reason, p_diagnosis, p_treatment, p_notes, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.insert_patient_clinical_encounter(uuid, timestamptz, text, text, text, text) from public;
grant execute on function public.insert_patient_clinical_encounter(uuid, timestamptz, text, text, text, text) to authenticated;
