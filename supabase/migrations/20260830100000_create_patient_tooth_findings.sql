-- Odentia Core — Odontograma real (Historia Clínica → Odontograma)
--
-- One row PER FINDING, not a monolithic per-patient JSON blob (see task
-- scope: "Preferir registros individuales de hallazgos"). A tooth can carry
-- zero, one, or many findings over time — same shape the approved demo
-- already used client-side (OdontogramData = Record<fdi, ToothFinding[]>,
-- see src/features/dashboard/odontogram-teeth.tsx) — this table is just
-- that same per-finding record, persisted, with clinic/patient scoping and
-- a real author instead of local-only state.
--
-- Reuses is_active_clinical_professional() from the patient_medical_histories
-- migration as-is (already written to be reusable here — see its own
-- comment) — same authorization rule, no duplication.
create table public.patient_tooth_findings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null,
  -- Adult permanent dentition only, FDI notation — same 32 valid positions
  -- as UPPER_RIGHT/UPPER_LEFT/LOWER_RIGHT/LOWER_LEFT in odontogram-teeth.tsx.
  tooth_fdi smallint not null check (
    tooth_fdi = any (array[
      18, 17, 16, 15, 14, 13, 12, 11,
      21, 22, 23, 24, 25, 26, 27, 28,
      48, 47, 46, 45, 44, 43, 42, 41,
      31, 32, 33, 34, 35, 36, 37, 38
    ])
  ),
  -- Matches FindingType exactly (odontogram-teeth.tsx) — never redesigned.
  finding_type text not null check (finding_type in ('caries', 'restauracion', 'ausente', 'otro')),
  -- Matches ToothSurface exactly (odontogram-teeth.tsx). Empty array is
  -- valid (e.g. "ausente" doesn't need a surface).
  surfaces text[] not null default '{}',
  constraint patient_tooth_findings_surfaces_valid check (
    surfaces <@ array['oclusal', 'vestibular', 'palatina', 'mesial', 'distal']::text[]
  ),
  note text,
  -- Who recorded this finding — always auth.uid() as resolved server-side
  -- by insert_patient_tooth_finding() below, never a client-supplied value.
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_tooth_findings_patient_clinic_fk
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade
);

create trigger set_updated_at
  before update on public.patient_tooth_findings
  for each row execute function public.set_updated_at();

create index patient_tooth_findings_clinic_id_idx on public.patient_tooth_findings (clinic_id);
create index patient_tooth_findings_patient_id_idx on public.patient_tooth_findings (patient_id);

alter table public.patient_tooth_findings enable row level security;

-- READ: any active clinic member — same shape as
-- patient_medical_histories_select_member.
create policy patient_tooth_findings_select_member
  on public.patient_tooth_findings for select
  to authenticated
  using (public.is_clinic_member(clinic_id));
-- No INSERT/UPDATE/DELETE policy, deliberately — same reasoning as
-- patient_medical_histories: the write authorization rule (active clinical
-- professional) and server-derived clinic_id/recorded_by aren't safely
-- expressible as a row filter alone. Every write goes through
-- insert_patient_tooth_finding()/delete_patient_tooth_finding() below.
grant select on public.patient_tooth_findings to authenticated;

-- Register one finding. Resolves the patient's REAL clinic_id server-side
-- (never accepts one as an argument), checks
-- is_active_clinical_professional() (already granted to authenticated by
-- the patient_medical_histories migration), then inserts. recorded_by is
-- always auth.uid(), never client-supplied.
create function public.insert_patient_tooth_finding(
  p_patient_id uuid,
  p_tooth_fdi smallint,
  p_finding_type text,
  p_surfaces text[],
  p_note text
)
returns public.patient_tooth_findings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_result public.patient_tooth_findings;
begin
  select clinic_id into v_clinic_id from public.patients where id = p_patient_id;
  if v_clinic_id is null then
    raise exception 'patient not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  insert into public.patient_tooth_findings (
    clinic_id, patient_id, tooth_fdi, finding_type, surfaces, note, recorded_by
  )
  values (
    v_clinic_id, p_patient_id, p_tooth_fdi, p_finding_type, coalesce(p_surfaces, '{}'), p_note, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.insert_patient_tooth_finding(uuid, smallint, text, text[], text) from public;
grant execute on function public.insert_patient_tooth_finding(uuid, smallint, text, text[], text) to authenticated;

-- Remove one finding. Re-derives clinic_id from the finding row itself
-- (never trusts a client-supplied clinic_id) and re-checks authorization
-- before deleting.
create function public.delete_patient_tooth_finding(p_finding_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
begin
  select clinic_id into v_clinic_id from public.patient_tooth_findings where id = p_finding_id;
  if v_clinic_id is null then
    raise exception 'finding not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  delete from public.patient_tooth_findings where id = p_finding_id;
end;
$$;

revoke execute on function public.delete_patient_tooth_finding(uuid) from public;
grant execute on function public.delete_patient_tooth_finding(uuid) to authenticated;
