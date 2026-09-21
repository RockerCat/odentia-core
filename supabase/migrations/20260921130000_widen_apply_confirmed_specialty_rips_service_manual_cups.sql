-- Odentia Core — RIPS: extend apply_confirmed_specialty_rips_service_to_encounter()
-- (A4B, 20260917110000) to also correct a MANUAL-CUPS service on an
-- already-finalized encounter, not only a concept-based one.
--
-- Context: real-clinical-encounter-screen.tsx's manual-CUPS addService()
-- now resolves Grupo/Servicio the exact same way addConceptService()
-- always has — resolveClinicSpecialtyRipsService, keyed only by the
-- attending professional's specialty, never clinical_concept_id — and
-- export-readiness.ts's RIPS_SERVICE_CONFIGURATION_MISSING now fires for
-- ANY service still missing cod_servicio_code, regardless of
-- clinical_concept_id. This RPC's own eligibility WHERE clause is the one
-- remaining place that still assumed "only a concept-based service can
-- have this gap" (`es.clinical_concept_id is not null`) — a historical
-- manual-CUPS row missing Grupo/Servicio was therefore permanently stuck
-- with no correction path at all, even after this same clinic later
-- confirmed the specialty's Servicio RIPS. This migration removes that
-- one condition; every other rule (fail-closed atomicity, Case A/B/C
-- resolution, audit trail, authorization) is unchanged verbatim.
create or replace function public.apply_confirmed_specialty_rips_service_to_encounter(p_encounter_id uuid)
returns table (
  encounter_id uuid,
  updated_count integer,
  updated_service_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_encounter public.patient_clinical_encounters;
  v_service record;
  v_specialty_id uuid;
  v_servicio record;
  v_grupo_exists boolean;
  v_updated_ids uuid[] := '{}';
  v_updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'apply_confirmed_specialty_rips_service_to_encounter requires an authenticated session';
  end if;

  select * into v_encounter
  from public.patient_clinical_encounters
  where id = p_encounter_id;

  if v_encounter.id is null then
    raise exception 'encounter not found';
  end if;

  -- clinic_id comes ONLY from the encounter's own row — never a client
  -- parameter (this function has no such parameter at all).
  if not exists (
    select 1 from public.clinic_memberships
    where clinic_id = v_encounter.clinic_id
      and profile_id = auth.uid()
      and status = 'active'
      and role = 'clinic_admin'
  ) then
    raise exception 'only an active clinic_admin can apply this correction' using errcode = '42501';
  end if;

  if v_encounter.finalized_at is null then
    raise exception 'this correction only applies to a finalized encounter' using errcode = '22023';
  end if;

  -- Eligibility matches RIPS_SERVICE_CONFIGURATION_MISSING's own condition
  -- EXACTLY (export-readiness.ts: `!service.codServicioCode`, no longer
  -- conditioned on clinicalConceptId — see this migration's own header):
  -- cod_servicio_code is null, regardless of whether grupo_servicios_code
  -- already has a value, and regardless of whether the service came from
  -- the concept picker or manual CUPS search.
  for v_service in
    select es.id, es.professional_profile_id, es.grupo_servicios_code, es.cod_servicio_code
    from public.encounter_services es
    where es.encounter_id = p_encounter_id
      and es.cod_servicio_code is null
    for update
  loop
    select pp.primary_specialty_id into v_specialty_id
    from public.professional_profiles pp
    where pp.id = v_service.professional_profile_id;

    if v_specialty_id is null then
      raise exception 'service % has no resolvable specialty for its attending professional', v_service.id
        using errcode = '22023';
    end if;

    select rv.code, rv.parent_code
    into v_servicio
    from public.clinic_specialty_rips_services csrs
    join public.rips_reference_values rv
      on rv.id = csrs.rips_reference_value_id
      and rv.catalog_key = 'Servicios'
      and rv.status = 'active'
    where csrs.clinic_id = v_encounter.clinic_id
      and csrs.specialty_id = v_specialty_id
      and csrs.status = 'active';

    if v_servicio.code is null then
      raise exception 'no confirmed and active Servicio RIPS exists for this encounter''s specialty in this clinic — confirm it in Clínica first'
        using errcode = '22023';
    end if;

    if v_servicio.parent_code is null then
      raise exception 'confirmed Servicio % has no Grupo de servicios in the official catalog', v_servicio.code
        using errcode = '22023';
    end if;

    select exists (
      select 1 from public.rips_reference_values
      where catalog_key = 'GrupoServicios' and code = v_servicio.parent_code and status = 'active'
    ) into v_grupo_exists;

    if not v_grupo_exists then
      raise exception 'Grupo de servicios % is not an active row in the official catalog', v_servicio.parent_code
        using errcode = '22023';
    end if;

    -- Case B conflict check — this service already has a frozen Grupo
    -- (grupo_servicios_code is not null) that DISAGREES with the Grupo
    -- the confirmed configuration derives. Never silently overwrite a
    -- historical value, never complete only the Servicio and leave an
    -- inconsistent Grupo/Servicio pair, and never let this be a partial
    -- correction of the encounter — RAISE here rolls back this entire
    -- call, including any earlier iteration's already-applied UPDATE/audit
    -- INSERT (see this function's own header comment on atomicity).
    if v_service.grupo_servicios_code is not null and v_service.grupo_servicios_code <> v_servicio.parent_code then
      raise exception
        'service % already has Grupo de servicios % frozen, which does not match the Grupo (%) derived from the clinic''s confirmed configuration — refusing to overwrite a historical value',
        v_service.id, v_service.grupo_servicios_code, v_servicio.parent_code
        using errcode = '22023';
    end if;

    insert into public.encounter_service_rips_corrections (
      encounter_service_id, clinic_id,
      previous_grupo_servicios_code, previous_cod_servicio_code,
      new_grupo_servicios_code, new_cod_servicio_code,
      corrected_by
    ) values (
      v_service.id, v_encounter.clinic_id,
      v_service.grupo_servicios_code, v_service.cod_servicio_code,
      v_servicio.parent_code, v_servicio.code,
      auth.uid()
    );

    -- Same eligibility guard as the initial select, restated in the
    -- UPDATE's own WHERE clause — defense in depth against a concurrent
    -- writer between that select and this update (the FOR UPDATE lock
    -- above already prevents it in practice, this is the second,
    -- structural line of defense). cod_servicio_code must still be null;
    -- grupo_servicios_code must be either null (Case A) or already equal
    -- to the value being written (Case B, already proven above) — never
    -- overwrites a frozen Grupo with a different one.
    update public.encounter_services
    set grupo_servicios_code = v_servicio.parent_code,
        cod_servicio_code = v_servicio.code
    where id = v_service.id
      and cod_servicio_code is null
      and (grupo_servicios_code is null or grupo_servicios_code = v_servicio.parent_code);

    v_updated_ids := array_append(v_updated_ids, v_service.id);
    v_updated_count := v_updated_count + 1;
  end loop;

  return query select p_encounter_id, v_updated_count, v_updated_ids;
end;
$$;
