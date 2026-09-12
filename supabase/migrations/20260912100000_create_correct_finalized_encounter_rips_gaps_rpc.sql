-- Odentia Core — RIPS: narrow correction path for a FINALIZED atención's
-- own RIPS-blocking gaps (U09 incapacidad, vrServicio/"valor cobrado al
-- paciente" on a consultation).
--
-- Why this migration is unavoidable: upsert_patient_clinical_encounter
-- (see 20260910170000) explicitly returns the row UNCHANGED, as-is, the
-- moment finalized_at is already set — "return v_result;" with no write at
-- all. That's correct for real clinical documentation (a finalized
-- historia clínica must stay immutable), but it also means there is
-- currently NO write path whatsoever for fixing a genuinely missing
-- administrative/RIPS-only fact on an already-finalized encounter — not a
-- bug in that function, a real gap this task needs a new, separate, much
-- narrower RPC for. No direct table UPDATE from the app either: RLS on
-- patient_clinical_encounters/encounter_services stays deny-by-default for
-- `authenticated` (see the foundation RLS migration) — every write is a
-- controlled SECURITY DEFINER RPC, and this is no exception.
--
-- Deliberately NOT a general "edit a finalized encounter" tool:
--   - incapacity_code can only be set once (null -> a real LstSiNo code).
--     If it's already set, this raises rather than silently overwriting a
--     real clinical fact — "corrija la información FALTANTE", never
--     "reescriba una atención finalizada a discreción".
--   - Same rule per service: service_value can only be set once (null ->
--     a non-negative number), only on a service already classified
--     'consultation' by the CUPS catalog. valor_pago_moderador/concepto_
--     recaudo/etc. are untouched by this function on purpose — this task's
--     own bug (50000 typed into "Valor pago moderador" instead of "Valor
--     cobrado") is a real, separate concept (see export-generator.ts) and
--     is explicitly NOT auto-copied or auto-corrected here.
--
-- Permission model, deliberately DIFFERENT from
-- upsert_patient_clinical_encounter's is_active_clinical_professional()
-- gate: this is reached exclusively from /rips, which is Clinic Admin
-- only end-to-end (see rips/page.tsx's allowedRoles and every
-- export-actions.ts action's own requireClinicAdminContext() re-check) —
-- gating this the SAME way that screen already gates everything else
-- would make "Corregir" a dead end again for a Clinic Admin with no
-- professional_profile of her own (CLAUDE.md's own Primary Use Case: a
-- solo Clinic-Admin-Dentist DOES have one, but nothing about /rips
-- requires that). Requiring is_active_clinical_professional() here would
-- reopen exactly the "no acción segura para resolverlos" problem this
-- task exists to fix. Scope is intentionally narrow enough (a Sí/No flag
-- and a peso amount, never a diagnosis/treatment/procedure) that
-- clinic_admin-without-clinical-capacity is an acceptable, deliberate
-- widening for THESE TWO FIELDS ONLY — never treat this function's gate
-- as precedent for any other clinical write.
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
  select pce
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
