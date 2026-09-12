-- Odentia Core — RIPS: fix a 22P02 runtime error in
-- correct_finalized_encounter_rips_gaps (created by 20260912100000, already
-- applied to the remote database and left UNTOUCHED by this migration).
--
-- Real failure observed during the smoke test:
--   code: 22P02
--   message: invalid input syntax for type uuid: "(30f5223d-...,...)"
--
-- Root cause: the function's current, applied body loads v_encounter
-- (declared as the composite `public.patient_clinical_encounters`) as the
-- SOLE INTO target with:
--   select pce
--   into v_encounter
--   from public.patient_clinical_encounters pce
--   where pce.id = p_encounter_id;
-- `select pce` (the bare row alias, not `pce.*`) is itself a single
-- composite VALUE, not "load every column of pce" — when the INTO target
-- is a matching composite variable, PL/pgSQL instead tries to coerce that
-- single value into v_encounter's FIRST column (uuid), producing exactly
-- this 22P02 on the row's whole "(uuid,uuid,...)" text representation.
-- `select pce.*` is the correct form for "load every column of pce into
-- this one composite variable" — the multi-item-INTO restriction that
-- required avoiding `pce.*` in the first place
-- ("record variable cannot be part of multiple-item INTO list") only
-- applies when a row/composite wildcard shares an INTO list with another,
-- separate target; it's fine (and required) as the SOLE target here.
--
-- CREATE OR REPLACE, not DROP + CREATE: signature (uuid, text, jsonb) is
-- unchanged — only the initial v_encounter load changes; every other
-- statement (clinic_id lookup, finalized check, clinic_admin authorization,
-- LstSiNo validation, incapacity_code/service_value null->value guards,
-- consultation-only guard, the two updates, and the final return) is
-- copied verbatim from the currently-applied function body.
create or replace function public.correct_finalized_encounter_rips_gaps(
  p_encounter_id uuid,
  p_incapacity_code text default null,
  p_service_corrections jsonb default '[]'::jsonb
)
returns public.patient_clinical_encounters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_encounter public.patient_clinical_encounters;
  v_corr record;
  v_current_value numeric;
  v_rips_type text;
  v_owning_encounter uuid;
begin
  select pce.*
  into v_encounter
  from public.patient_clinical_encounters pce
  where pce.id = p_encounter_id;

  if not found then
    raise exception 'encounter not found';
  end if;

  select p.clinic_id
  into v_clinic_id
  from public.patients p
  where p.id = v_encounter.patient_id;

  if v_clinic_id is null then
    raise exception 'encounter not found';
  end if;

  if v_encounter.finalized_at is null then
    raise exception 'encounter is not finalized yet — use upsert_patient_clinical_encounter instead';
  end if;

  if not exists (
    select 1 from public.clinic_memberships
    where clinic_id = v_clinic_id
      and profile_id = auth.uid()
      and status = 'active'
      and role = 'clinic_admin'
  ) then
    raise exception 'not authorized to correct RIPS data for this clinic' using errcode = '42501';
  end if;

  if p_incapacity_code is not null then
    if v_encounter.incapacity_code is not null then
      raise exception 'incapacity_code is already set for this encounter — this function only fills a missing value';
    end if;
    if not exists (
      select 1 from public.rips_reference_values
      where catalog_key = 'LstSiNo' and code = p_incapacity_code and status = 'active'
    ) then
      raise exception 'incapacity_code % does not exist in the official LstSiNo catalog', p_incapacity_code;
    end if;

    update public.patient_clinical_encounters
    set incapacity_code = p_incapacity_code
    where id = p_encounter_id
    returning * into v_encounter;
  end if;

  for v_corr in select * from jsonb_to_recordset(coalesce(p_service_corrections, '[]'::jsonb))
    as x(service_id uuid, service_value numeric)
  loop
    select es.service_value, es.rips_service_type, es.encounter_id
      into v_current_value, v_rips_type, v_owning_encounter
    from public.encounter_services es
    where es.id = v_corr.service_id;

    if v_owning_encounter is null or v_owning_encounter <> p_encounter_id then
      raise exception 'service % does not belong to this encounter', v_corr.service_id;
    end if;
    if v_rips_type <> 'consultation' then
      raise exception 'service_value corrections only apply to a consultation-classified service (service %)', v_corr.service_id;
    end if;
    if v_current_value is not null then
      raise exception 'service_value is already set for service % — this function only fills a missing value', v_corr.service_id;
    end if;
    if v_corr.service_value is null or v_corr.service_value < 0 then
      raise exception 'service_value must be a non-negative number (service %)', v_corr.service_id;
    end if;

    update public.encounter_services
    set service_value = v_corr.service_value
    where id = v_corr.service_id;
  end loop;

  select * into v_encounter from public.patient_clinical_encounters where id = p_encounter_id;
  return v_encounter;
end;
$$;

revoke execute on function public.correct_finalized_encounter_rips_gaps(uuid, text, jsonb) from public;
grant execute on function public.correct_finalized_encounter_rips_gaps(uuid, text, jsonb) to authenticated;
