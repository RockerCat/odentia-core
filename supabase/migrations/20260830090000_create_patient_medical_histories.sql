-- Odentia Core — Antecedentes clínicos reales (Historia Clínica → Antecedentes)
--
-- V1 model: ONE row per patient, consolidating the demo's sprawling
-- Anamnesis field set (personalHistory/familyHistory/habits/
-- surgicalHistory/pregnancy/otherRelevant + three separate "*Summary"
-- fields that were, by the demo's own comment, just differently-worded
-- restatements of the same facts — never real distinct data) down to the
-- 6 fields that actually carry distinct clinical meaning: allergies,
-- current_medications, medical_conditions, surgeries_or_hospitalizations,
-- relevant_family_history, and one general observations field absorbing
-- personalHistory/habits/otherRelevant/pregnancy. Correctness over
-- premature normalization — no odontograma/atenciones/documentos tables
-- here, that's future work.
--
-- Tenant integrity: same composite-FK pattern already used by
-- professional_profiles/patient_access_invitations — clinic_id can never
-- diverge from the referenced patient's real clinic, structurally, not
-- just by convention.
create table public.patient_medical_histories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null,
  allergies text,
  current_medications text,
  medical_conditions text,
  surgeries_or_hospitalizations text,
  relevant_family_history text,
  observations text,
  -- Who last wrote this row — always auth.uid() as resolved server-side by
  -- upsert_patient_medical_history() below, never a client-supplied value.
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- At most one row per patient (see task scope, section 4).
  constraint patient_medical_histories_patient_id_key unique (patient_id),
  constraint patient_medical_histories_patient_clinic_fk
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade
);
-- clinic_id restrict (matches patients' own convention — a clinic must
-- never be deletable in a way that silently wipes clinical records).
-- patient_id cascade via the composite FK: a medical history has no
-- purpose once its patient is gone (patients has no real delete path
-- today either — active = false is the convention).

create trigger set_updated_at
  before update on public.patient_medical_histories
  for each row execute function public.set_updated_at();

create index patient_medical_histories_clinic_id_idx on public.patient_medical_histories (clinic_id);

alter table public.patient_medical_histories enable row level security;

-- READ: any active clinic member (clinic_admin/dentist/assistant) — see
-- task scope, section 6. Same shape as patients_select_member.
create policy patient_medical_histories_select_member
  on public.patient_medical_histories for select
  to authenticated
  using (public.is_clinic_member(clinic_id));
-- No INSERT/UPDATE/DELETE policy at all, deliberately: the write
-- authorization rule (dentist OR clinic_admin, AND an ACTIVE
-- professional_profile — see is_active_clinical_professional below) isn't
-- expressible as a simple row filter without risking a client also being
-- able to move a row to a different patient_id or forge updated_by (see
-- task scope, section 7: "ante duda, usa RPC"). Every write goes through
-- upsert_patient_medical_history() instead, which runs SECURITY DEFINER
-- and so needs no table-level INSERT/UPDATE grant for `authenticated` at
-- all — only SELECT (for the read policy above to be reachable) and
-- EXECUTE on the RPC.
grant select on public.patient_medical_histories to authenticated;

-- Reusable "is this caller an active clinical professional in this
-- clinic" check — dentist or clinic_admin, AND their own
-- professional_profile is active. Deliberately its own helper (not
-- folded into has_clinic_role) because CLAUDE.md task scope explicitly
-- warns against treating clinic_admin as a synonym for dentist: an admin
-- with no professional_profile, or an inactive one, must NOT pass this.
-- Reusable as-is for Odontograma/Atenciones/Documentos RPCs later.
create function public.is_active_clinical_professional(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_memberships m
    join public.professional_profiles pp on pp.clinic_membership_id = m.id
    where m.clinic_id = target_clinic_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.role in ('dentist', 'clinic_admin')
      and pp.active = true
  );
$$;

revoke execute on function public.is_active_clinical_professional(uuid) from public;
grant execute on function public.is_active_clinical_professional(uuid) to authenticated;

-- The one sanctioned write path. Resolves the patient's REAL clinic_id
-- server-side (never accepts one as an argument — see task scope, section
-- 3/16), checks is_active_clinical_professional() for that clinic, then
-- does an atomic upsert keyed on the patient_id unique constraint —
-- always the same row for a given patient, never a duplicate, and never
-- able to move an existing row to a different patient_id (p_patient_id is
-- both the ON CONFLICT target and the only identity the caller controls).
-- updated_by is always auth.uid(), never a client-supplied value.
create function public.upsert_patient_medical_history(
  p_patient_id uuid,
  p_allergies text,
  p_current_medications text,
  p_medical_conditions text,
  p_surgeries_or_hospitalizations text,
  p_relevant_family_history text,
  p_observations text
)
returns public.patient_medical_histories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_result public.patient_medical_histories;
begin
  select clinic_id into v_clinic_id from public.patients where id = p_patient_id;
  if v_clinic_id is null then
    raise exception 'patient not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  insert into public.patient_medical_histories (
    clinic_id, patient_id, allergies, current_medications, medical_conditions,
    surgeries_or_hospitalizations, relevant_family_history, observations, updated_by
  )
  values (
    v_clinic_id, p_patient_id, p_allergies, p_current_medications, p_medical_conditions,
    p_surgeries_or_hospitalizations, p_relevant_family_history, p_observations, auth.uid()
  )
  on conflict (patient_id) do update set
    allergies = excluded.allergies,
    current_medications = excluded.current_medications,
    medical_conditions = excluded.medical_conditions,
    surgeries_or_hospitalizations = excluded.surgeries_or_hospitalizations,
    relevant_family_history = excluded.relevant_family_history,
    observations = excluded.observations,
    updated_by = excluded.updated_by
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.upsert_patient_medical_history(uuid, text, text, text, text, text, text) from public;
grant execute on function public.upsert_patient_medical_history(uuid, text, text, text, text, text, text) to authenticated;
