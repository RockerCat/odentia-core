-- Odentia Core — RIPS #5: minimal audit trail for a generated RIPS sin
-- factura export.
--
-- Deliberately NOT a "batch" entity: no status/validated/submitted/CUV
-- column exists here, and none should be added until Odentia actually
-- sends something to the MUV (RIPS #6+, not this phase — see this task's
-- own Section 23 and Section 42's explicit "no implementar todavía"
-- list). This table answers exactly one question for a future regulatory
-- audit: "who generated a RIPS export for period X, when, and how much
-- did it cover" — never "was this ever submitted, validated, or
-- accepted", because none of those states exist yet.
--
-- The download itself stays stateless (this task's own Section 23: a
-- preview/download can be stateless) — this row is written AFTER a
-- successful generation, purely for traceability, and never blocks or
-- gates a later regeneration of the same period.
create table public.rips_export_log (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  generated_by uuid not null references public.profiles (id) on delete restrict,
  generated_at timestamptz not null default now(),
  patient_count integer not null check (patient_count >= 0),
  consultation_count integer not null check (consultation_count >= 0),
  procedure_count integer not null check (procedure_count >= 0)
);

-- One composite index, not two: (clinic_id, period_year, period_month)
-- already serves a plain "WHERE clinic_id = X" lookup as a leftmost-prefix
-- scan, so a separate single-column clinic_id index would be pure
-- redundancy on a table this small and simple (RIPS #5A review — "índices
-- mínimos necesarios").
create index rips_export_log_clinic_period_idx on public.rips_export_log (clinic_id, period_year, period_month);

alter table public.rips_export_log enable row level security;

create policy rips_export_log_select_member
  on public.rips_export_log for select
  to authenticated
  using (public.is_clinic_member(clinic_id));
-- No INSERT/UPDATE/DELETE policy — same convention as encounter_diagnoses/
-- encounter_services (RIPS #4): written only through the SECURITY DEFINER
-- RPC below, which does its own authorization check inline, never through
-- a direct table write the client could forge clinic_id/generated_by on.
grant select on public.rips_export_log to authenticated;

-- Role check is inline here (not a reusable is_clinic_admin() helper)
-- because this is the first place in the schema that needs "is this
-- caller specifically a clinic_admin", not just "a member" — matching
-- upsert_patient_clinical_encounter's own convention of checking
-- authorization inline inside the RPC rather than via a policy.
create function public.log_rips_export(
  p_period_year integer,
  p_period_month integer,
  p_patient_count integer,
  p_consultation_count integer,
  p_procedure_count integer
)
returns public.rips_export_log
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_result public.rips_export_log;
begin
  -- V1 has no multi-clinic membership (resolveClinicContext itself
  -- rejects a profile with more than one active membership) — a plain
  -- `limit 1` is safe, not an arbitrary pick among several.
  select clinic_id into v_clinic_id
  from public.clinic_memberships
  where profile_id = auth.uid() and role = 'clinic_admin' and status = 'active'
  limit 1;

  if v_clinic_id is null then
    raise exception 'not authorized to generate a RIPS export for this clinic' using errcode = '42501';
  end if;

  insert into public.rips_export_log (
    clinic_id, period_year, period_month, generated_by, patient_count, consultation_count, procedure_count
  )
  values (
    v_clinic_id, p_period_year, p_period_month, auth.uid(), p_patient_count, p_consultation_count, p_procedure_count
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.log_rips_export(integer, integer, integer, integer, integer) from public;
grant execute on function public.log_rips_export(integer, integer, integer, integer, integer) to authenticated;
