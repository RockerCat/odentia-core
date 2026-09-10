-- Odentia Core — RIPS #4B: fix a regression reintroduced by
-- 20260910160000_add_encounter_clinical_rips_data.sql
--
-- That migration's authoring process copied the procedures-replace query
-- from its ORIGINAL source (20260903120000_add_clinical_encounter_drafts_and_procedures.sql)
-- instead of from the already-fixed version
-- (20260904090500_fix_upsert_clinical_encounter_procedures_ordinality.sql),
-- silently reverting a real, previously-fixed bug — and then copied the
-- SAME broken pattern into the two new inserts (encounter_services,
-- encounter_diagnoses) written for this session.
--
-- The bug, exactly as 20260904090500 already documented: `jsonb_array_elements(x)
-- WITH ORDINALITY AS item` — a single bare alias — does NOT bind `item` to
-- the jsonb element. Postgres binds it to a RECORD combining the element
-- and the ordinality number together, so `item ->> 'key'` fails with
-- "42883: operator does not exist: record ->> unknown". The fix is the
-- same one already established: an explicit two-column list, `WITH
-- ORDINALITY AS t(item, ord)`.
--
-- Found by the RIPS #4B smoke test: calling upsert_patient_clinical_encounter
-- with a non-empty p_procedures/p_services/p_diagnoses array failed
-- immediately with exactly this error (confirmed directly against the
-- live remote database — `select item ->> 'name' from
-- jsonb_array_elements('[...]') with ordinality as item` reproduces it in
-- isolation). With all three arrays empty (the only shape any automated
-- test happened to exercise before this), jsonb_array_elements returns
-- zero rows and the broken expression never executes — no error, which is
-- exactly the same "went unnoticed" mechanism 20260904090500 already
-- described for the original occurrence of this bug.
--
-- CREATE OR REPLACE, not DROP + CREATE: the signature is unchanged from
-- 20260910160000 (still 13 arguments) — only three WITH ORDINALITY
-- clauses and their four `ordinality`-column references change. Nothing
-- else in the function body is touched.
create or replace function public.upsert_patient_clinical_encounter(
  p_patient_id uuid,
  p_occurred_at timestamptz,
  p_reason text,
  p_diagnosis text,
  p_treatment text,
  p_notes text,
  p_indications text,
  p_procedures jsonb,
  p_appointment_id uuid default null,
  p_finalize boolean default false,
  p_incapacity_code text default null,
  p_diagnoses jsonb default '[]'::jsonb,
  p_services jsonb default '[]'::jsonb
)
returns public.patient_clinical_encounters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_existing_id uuid;
  v_result public.patient_clinical_encounters;
  v_diag record;
  v_svc record;
  v_cups_service_type text;
  v_service_count integer;
  v_service_ids_by_sequence uuid[];
begin
  select clinic_id into v_clinic_id from public.patients where id = p_patient_id;
  if v_clinic_id is null then
    raise exception 'patient not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  if p_incapacity_code is not null and not exists (
    select 1 from public.rips_reference_values
    where catalog_key = 'LstSiNo' and code = p_incapacity_code and status = 'active'
  ) then
    raise exception 'incapacity_code % does not exist in the official LstSiNo catalog', p_incapacity_code;
  end if;

  -- ---- Validate diagnoses before writing anything ----
  v_service_count := jsonb_array_length(coalesce(p_services, '[]'::jsonb));

  for v_diag in select * from jsonb_to_recordset(coalesce(p_diagnoses, '[]'::jsonb))
    as x(cie10_code text, role text, diagnosis_type_code text, service_sequence integer)
  loop
    if v_diag.role not in ('principal', 'related') then
      raise exception 'diagnosis role % is invalid (must be principal or related)', v_diag.role;
    end if;
    if v_diag.role = 'related' and v_diag.diagnosis_type_code is not null then
      raise exception 'diagnosis_type_code only applies to the principal diagnosis';
    end if;
    if not exists (
      select 1 from public.diagnosis_catalog
      where classification_system = 'CIE10' and code = v_diag.cie10_code and status = 'active'
    ) then
      raise exception 'cie10_code % does not exist in the official CIE10 catalog', v_diag.cie10_code;
    end if;
    if v_diag.diagnosis_type_code is not null and not exists (
      select 1 from public.rips_reference_values
      where catalog_key = 'RIPSTipoDiagnosticoPrincipalVersion2' and code = v_diag.diagnosis_type_code and status = 'active'
    ) then
      raise exception 'diagnosis_type_code % does not exist in the official RIPSTipoDiagnosticoPrincipalVersion2 catalog', v_diag.diagnosis_type_code;
    end if;
    if v_diag.service_sequence is not null and (v_diag.service_sequence < 0 or v_diag.service_sequence >= v_service_count) then
      raise exception 'service_sequence % is out of range for the % service(s) submitted', v_diag.service_sequence, v_service_count;
    end if;
  end loop;

  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_diagnoses, '[]'::jsonb)) as x(role text, service_sequence integer)
    where x.role = 'principal'
    group by coalesce(x.service_sequence, -1)
    having count(*) > 1
  ) then
    raise exception 'an encounter (or a specific service within it) can have at most one principal diagnosis';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_diagnoses, '[]'::jsonb)) as x(cie10_code text, service_sequence integer)
    group by coalesce(x.service_sequence, -1), x.cie10_code
    having count(*) > 1
  ) then
    raise exception 'the same cie10_code cannot be repeated twice within the same encounter/service scope';
  end if;

  -- ---- Validate services before writing anything ----
  for v_svc in select * from jsonb_to_recordset(coalesce(p_services, '[]'::jsonb)) as x(
    cups_code text, professional_profile_id uuid, via_ingreso_code text, modalidad_code text,
    grupo_servicios_code text, cod_servicio_code text, finalidad_code text, causa_motivo_code text,
    concepto_recaudo_code text
  )
  loop
    select rips_service_type into v_cups_service_type
    from public.cups_catalog where code = v_svc.cups_code and status = 'active';
    if v_cups_service_type is null then
      raise exception 'cups_code % does not exist in the official CUPS catalog', v_svc.cups_code;
    end if;

    if not exists (
      select 1 from public.professional_profiles where id = v_svc.professional_profile_id and clinic_id = v_clinic_id
    ) then
      raise exception 'professional_profile_id % does not belong to this clinic', v_svc.professional_profile_id;
    end if;

    if v_svc.via_ingreso_code is not null and v_cups_service_type <> 'procedure' then
      raise exception 'via_ingreso_code only applies to a procedure-classified service (cups_code %, classified as %)', v_svc.cups_code, v_cups_service_type;
    end if;
    if v_svc.causa_motivo_code is not null and v_cups_service_type <> 'consultation' then
      raise exception 'causa_motivo_code only applies to a consultation-classified service (cups_code %, classified as %)', v_svc.cups_code, v_cups_service_type;
    end if;

    if v_svc.via_ingreso_code is not null and not exists (
      select 1 from public.rips_reference_values
      where catalog_key = 'RIPSViaIngresoIPS' and code = v_svc.via_ingreso_code and status = 'active'
    ) then
      raise exception 'via_ingreso_code % does not exist in the official RIPSViaIngresoIPS catalog', v_svc.via_ingreso_code;
    end if;

    if v_svc.modalidad_code is not null and not exists (
      select 1 from public.rips_reference_values
      where catalog_key = 'ModalidadAtencion' and code = v_svc.modalidad_code and status = 'active'
    ) then
      raise exception 'modalidad_code % does not exist in the official ModalidadAtencion catalog', v_svc.modalidad_code;
    end if;

    if v_svc.grupo_servicios_code is not null and not exists (
      select 1 from public.rips_reference_values
      where catalog_key = 'GrupoServicios' and code = v_svc.grupo_servicios_code and status = 'active'
    ) then
      raise exception 'grupo_servicios_code % does not exist in the official GrupoServicios catalog', v_svc.grupo_servicios_code;
    end if;

    if v_svc.cod_servicio_code is not null and not exists (
      select 1 from public.rips_reference_values
      where catalog_key = 'Servicios' and code = v_svc.cod_servicio_code and status = 'active'
    ) then
      raise exception 'cod_servicio_code % does not exist in the official Servicios catalog', v_svc.cod_servicio_code;
    end if;

    if v_svc.finalidad_code is not null and not exists (
      select 1 from public.rips_reference_values
      where catalog_key = 'RIPSFinalidadConsultaVersion2' and code = v_svc.finalidad_code and status = 'active'
    ) then
      raise exception 'finalidad_code % does not exist in the official RIPSFinalidadConsultaVersion2 catalog', v_svc.finalidad_code;
    end if;

    if v_svc.causa_motivo_code is not null and not exists (
      select 1 from public.rips_reference_values
      where catalog_key = 'RIPSCausaExternaVersion2' and code = v_svc.causa_motivo_code and status = 'active'
    ) then
      raise exception 'causa_motivo_code % does not exist in the official RIPSCausaExternaVersion2 catalog', v_svc.causa_motivo_code;
    end if;

    if v_svc.concepto_recaudo_code is not null and not exists (
      select 1 from public.rips_reference_values
      where catalog_key = 'conceptoRecaudo' and code = v_svc.concepto_recaudo_code and status = 'active'
    ) then
      raise exception 'concepto_recaudo_code % does not exist in the official conceptoRecaudo catalog', v_svc.concepto_recaudo_code;
    end if;
  end loop;

  -- ---- Encounter row itself (unchanged) ----
  if p_appointment_id is not null then
    if not exists (
      select 1 from public.appointments
      where id = p_appointment_id and patient_id = p_patient_id and clinic_id = v_clinic_id
    ) then
      raise exception 'appointment does not match patient/clinic';
    end if;

    select id into v_existing_id
    from public.patient_clinical_encounters
    where appointment_id = p_appointment_id;
  end if;

  if v_existing_id is not null then
    select * into v_result from public.patient_clinical_encounters where id = v_existing_id;

    if v_result.finalized_at is not null then
      return v_result;
    end if;

    update public.patient_clinical_encounters
    set reason = p_reason,
        diagnosis = p_diagnosis,
        treatment = p_treatment,
        notes = p_notes,
        indications = p_indications,
        incapacity_code = p_incapacity_code,
        attended_by = auth.uid(),
        finalized_at = case when p_finalize then now() else null end
    where id = v_existing_id
    returning * into v_result;
  else
    begin
      insert into public.patient_clinical_encounters (
        clinic_id, patient_id, appointment_id, occurred_at, reason, diagnosis,
        treatment, notes, indications, incapacity_code, attended_by, finalized_at
      )
      values (
        v_clinic_id, p_patient_id, p_appointment_id, coalesce(p_occurred_at, now()),
        p_reason, p_diagnosis, p_treatment, p_notes, p_indications, p_incapacity_code, auth.uid(),
        case when p_finalize then now() else null end
      )
      returning * into v_result;
    exception
      when unique_violation then
        select id into v_existing_id
        from public.patient_clinical_encounters
        where appointment_id = p_appointment_id;

        select * into v_result from public.patient_clinical_encounters where id = v_existing_id;
        if v_result.finalized_at is null then
          update public.patient_clinical_encounters
          set reason = p_reason,
              diagnosis = p_diagnosis,
              treatment = p_treatment,
              notes = p_notes,
              indications = p_indications,
              incapacity_code = p_incapacity_code,
              attended_by = auth.uid(),
              finalized_at = case when p_finalize then now() else null end
          where id = v_existing_id
          returning * into v_result;
        end if;
    end;
  end if;

  -- ---- Replace procedures, services, then diagnoses atomically ----
  -- FIX (RIPS #4B): `with ordinality as t(item, ord)` — explicit
  -- two-column list — in all three inserts below, replacing the broken
  -- bare `as item` this migration originally shipped with. See this
  -- migration's own header comment.
  delete from public.patient_clinical_encounter_procedures where encounter_id = v_result.id;
  insert into public.patient_clinical_encounter_procedures (encounter_id, clinic_id, name, note, position)
  select v_result.id, v_clinic_id, item ->> 'name', item ->> 'note', ord - 1
  from jsonb_array_elements(coalesce(p_procedures, '[]'::jsonb)) with ordinality as t(item, ord)
  where coalesce(item ->> 'name', '') <> '';

  delete from public.encounter_services where encounter_id = v_result.id;
  with inserted_services as (
    insert into public.encounter_services (
      encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type, performed_at,
      service_value, via_ingreso_code, modalidad_code, grupo_servicios_code, cod_servicio_code,
      finalidad_code, causa_motivo_code, concepto_recaudo_code, valor_pago_moderador, sequence
    )
    select
      v_result.id, v_clinic_id,
      (item ->> 'professional_profile_id')::uuid,
      item ->> 'cups_code',
      (select cc.rips_service_type from public.cups_catalog cc where cc.code = item ->> 'cups_code' and cc.status = 'active'),
      coalesce((item ->> 'performed_at')::timestamptz, now()),
      coalesce(
        (item ->> 'service_value')::numeric,
        case
          when (select cc.rips_service_type from public.cups_catalog cc where cc.code = item ->> 'cups_code' and cc.status = 'active') = 'procedure'
          then 0
          else null
        end
      ),
      item ->> 'via_ingreso_code',
      item ->> 'modalidad_code',
      item ->> 'grupo_servicios_code',
      item ->> 'cod_servicio_code',
      item ->> 'finalidad_code',
      item ->> 'causa_motivo_code',
      item ->> 'concepto_recaudo_code',
      (item ->> 'valor_pago_moderador')::numeric,
      ord - 1
    from jsonb_array_elements(coalesce(p_services, '[]'::jsonb)) with ordinality as t(item, ord)
    returning id, sequence
  )
  select array_agg(id order by sequence) into v_service_ids_by_sequence from inserted_services;

  delete from public.encounter_diagnoses where encounter_id = v_result.id;
  insert into public.encounter_diagnoses (encounter_id, clinic_id, cie10_code, role, diagnosis_type_code, encounter_service_id, sequence)
  select
    v_result.id, v_clinic_id, item ->> 'cie10_code', item ->> 'role', item ->> 'diagnosis_type_code',
    case
      when item ->> 'service_sequence' is null then null
      else v_service_ids_by_sequence[((item ->> 'service_sequence')::integer) + 1]
    end,
    ord - 1
  from jsonb_array_elements(coalesce(p_diagnoses, '[]'::jsonb)) with ordinality as t(item, ord);

  return v_result;
end;
$$;

-- No revoke/grant needed: CREATE OR REPLACE keeps the same signature and
-- therefore the same already-correct grants from 20260910160000.
