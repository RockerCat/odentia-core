-- Odentia Core — RIPS Fase A3: primer consumo real del catálogo clínico
-- natural (A1) en encounter_services.
--
-- Alcance ESTRICTO: extiende encounter_services con un snapshot del
-- concepto/variante clínica natural elegido por el odontólogo, y extiende
-- upsert_patient_clinical_encounter (MISMA firma de 13 argumentos —
-- create or replace, no se toca ninguna migración aplicada) para
-- persistirlo. encounter_services sigue siendo la ÚNICA instancia
-- canónica de "qué servicio se realizó realmente" — no se crea ninguna
-- tabla performed_clinical_concepts paralela.
--
-- Compatibilidad: las 5 columnas nuevas son NULLABLE. Ninguna fila
-- histórica de encounter_services requiere backfill — un
-- clinical_concept_id NULL sigue siendo un estado válido ("servicio
-- registrado por CUPS manual, nunca vía un concepto clínico natural"),
-- nunca un error ni algo a reinterpretar retroactivamente.
--
-- clinical_concept_id/clinical_concept_variant_id son punteros al
-- catálogo A1 (clinical_concepts/clinical_concept_variants) — solo para
-- trazabilidad de qué concepto originó este servicio, nunca releídos en
-- caliente para reconstruir su nombre (por eso también se guardan
-- clinical_concept_name_snapshot/clinical_variant_name_snapshot: si el
-- nombre visible de un concepto cambia más adelante, un servicio ya
-- registrado sigue mostrando el nombre tal como el odontólogo lo vio al
-- registrarlo — mismo principio que ya justifica NO snapshotear
-- descripciones de CUPS/CIE10 en este mismo esquema, aplicado aquí a la
-- capa natural en vez de a la regulatoria).
--
-- mapping_status ('resolved' | 'unresolved') documenta si, en el momento
-- de guardar, existía un mapping CUPS activo (clinical_cups_mappings)
-- para el concepto/variante/especialidad elegidos. En este alcance (A3)
-- la UI SOLO ofrece conceptos/variantes cuya resolución V0 ya está
-- confirmada (ver el picker "¿Qué realizaste?"), así que la aplicación
-- nunca escribe 'unresolved' todavía — el valor queda modelado para una
-- fase futura que permita registrar un concepto sin CUPS resuelto (lo
-- cual hoy es estructuralmente imposible de todas formas: cups_code
-- sigue siendo NOT NULL en esta tabla).
--
-- ENDURECIMIENTO PRE-DB-PUSH (esta misma migración, todavía no aplicada):
-- además de "el concepto/variante existen y la variante pertenece al
-- concepto" (ya validado abajo), el RPC ahora también verifica, cuando
-- mapping_status = 'resolved', que el cups_code enviado sea EXACTAMENTE
-- el que clinical_cups_mappings resolvería para
-- (concept_id, variant_id, especialidad del professional_profile_id del
-- propio servicio) — con la MISMA precedencia específico-antes-que-
-- genérico que clinical-service-resolution.ts ya implementa en TS — y que
-- cada snapshot humano corresponda al nombre ACTUAL del concepto/variante
-- seleccionados en el momento de insertar (nunca releído después). Ningún
-- trigger: todo vive en el mismo upsert_patient_clinical_encounter, la
-- única vía de escritura de esta tabla. mapping_status='unresolved' sigue
-- sin ninguna validación estructural adicional — sigue siendo,
-- deliberadamente, un estado modelado para una fase futura, nunca
-- ejercitado por la aplicación hoy.

alter table public.encounter_services
  add column clinical_concept_id uuid references public.clinical_concepts (id) on delete restrict,
  add column clinical_concept_variant_id uuid,
  add column clinical_concept_name_snapshot text,
  add column clinical_variant_name_snapshot text,
  add column mapping_status text;

alter table public.encounter_services
  add constraint encounter_services_clinical_variant_concept_fk
    foreign key (clinical_concept_variant_id, clinical_concept_id)
    references public.clinical_concept_variants (id, concept_id);
-- MATCH SIMPLE (default de Postgres): si clinical_concept_variant_id es
-- NULL, la FK no se evalúa — exactamente el caso de un concepto sin
-- variante (p.ej. orthodontic_consultation). Mismo patrón que
-- clinical_cups_mappings_variant_concept_fk (A1).

-- Seis CHECK simples (sin joins) que juntas garantizan exactamente las
-- cuatro reglas esperadas:
--   concept NULL     → variant NULL, ambos snapshots NULL, mapping_status NULL
--   concept NOT NULL → concept snapshot NOT NULL/no-blank, mapping_status NOT NULL
--   variant NULL     → variant snapshot NULL
--   variant NOT NULL → variant snapshot NOT NULL/no-blank
-- La correspondencia real Concept/Variant/Specialty → CUPS (Gap 1, y la
-- correspondencia snapshot-texto-actual, Gap 2) requieren leer otras
-- tablas (clinical_concepts/clinical_concept_variants/
-- clinical_cups_mappings/professional_profiles) — eso vive en el RPC de
-- abajo, nunca en un CHECK ni en un trigger.
alter table public.encounter_services
  add constraint encounter_services_clinical_variant_requires_concept
    check (clinical_concept_id is not null or clinical_concept_variant_id is null),
  -- Existencia del snapshot en ambas direcciones a la vez ((a) = (b) es
  -- true tanto cuando ambos son NULL como cuando ambos son NOT NULL):
  -- concept NULL ⇔ concept snapshot NULL.
  add constraint encounter_services_clinical_concept_snapshot_presence
    check ((clinical_concept_id is null) = (clinical_concept_name_snapshot is null)),
  add constraint encounter_services_clinical_concept_snapshot_nonblank
    check (clinical_concept_name_snapshot is null or btrim(clinical_concept_name_snapshot) <> ''),
  -- Mismo patrón para la variante: variant NULL ⇔ variant snapshot NULL.
  add constraint encounter_services_clinical_variant_snapshot_presence
    check ((clinical_concept_variant_id is null) = (clinical_variant_name_snapshot is null)),
  add constraint encounter_services_clinical_variant_snapshot_nonblank
    check (clinical_variant_name_snapshot is null or btrim(clinical_variant_name_snapshot) <> ''),
  -- Mismo patrón para mapping_status: concept NULL ⇔ mapping_status NULL
  -- (nunca un concepto sin mapping_status, ni un mapping_status sin
  -- concepto — ver GAP 1/MAPPING_STATUS de este endurecimiento).
  add constraint encounter_services_mapping_status_presence
    check ((clinical_concept_id is null) = (mapping_status is null)),
  add constraint encounter_services_mapping_status_valid
    check (mapping_status is null or mapping_status in ('resolved', 'unresolved'));

create index encounter_services_clinical_concept_id_idx
  on public.encounter_services (clinical_concept_id)
  where clinical_concept_id is not null;


-- ============================================================
-- upsert_patient_clinical_encounter — CREATE OR REPLACE, misma firma de
-- 13 argumentos que 20260910170000 (última versión aplicada). Único
-- cambio real: el bloque de validación/insert de encounter_services
-- ahora también lee y valida clinical_concept_id/
-- clinical_concept_variant_id/clinical_concept_name_snapshot/
-- clinical_variant_name_snapshot/mapping_status desde cada item de
-- p_services. Todo lo demás (diagnósticos, procedimientos, el resto de
-- la validación/inserción de servicios) es EXACTAMENTE el cuerpo ya
-- aplicado — copiado tal cual, no reescrito, para no reintroducir
-- ninguna regresión ya corregida (ver el propio historial de este
-- archivo: RIPS #4A/#4B).
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
  v_cups_catalog_id uuid;
  v_specialty_id uuid;
  v_expected_cups_catalog_id uuid;
  v_expected_cups_code text;
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
  -- RIPS #A3: recordset extended with the 5 clinical-concept-snapshot
  -- fields (clinical_concept_id/clinical_concept_variant_id/
  -- clinical_concept_name_snapshot/clinical_variant_name_snapshot/
  -- mapping_status) — every field already present in 20260910170000
  -- keeps the exact same validation below, untouched.
  for v_svc in select * from jsonb_to_recordset(coalesce(p_services, '[]'::jsonb)) as x(
    cups_code text, professional_profile_id uuid, via_ingreso_code text, modalidad_code text,
    grupo_servicios_code text, cod_servicio_code text, finalidad_code text, causa_motivo_code text,
    concepto_recaudo_code text, clinical_concept_id uuid, clinical_concept_variant_id uuid,
    clinical_concept_name_snapshot text, clinical_variant_name_snapshot text, mapping_status text
  )
  loop
    -- v_cups_catalog_id captured alongside rips_service_type (was
    -- previously only looked up implicitly, twice, further down at INSERT
    -- time) — needed here as the GAP 1 hardening's own comparison target,
    -- and reused at INSERT time below instead of re-querying by code
    -- twice more.
    select id, rips_service_type into v_cups_catalog_id, v_cups_service_type
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

    -- ---- RIPS #A3: clinical concept snapshot validation ----
    -- Friendly, pre-insert errors (same style as every catalog check
    -- above) rather than relying only on the structural composite FK on
    -- encounter_services — that FK still exists and still rejects a
    -- mismatched pair at INSERT time as a last resort, but a plain
    -- foreign-key-violation message is not something to surface directly
    -- in a clinical form (see mapEncounterValidationError's own
    -- reasoning).
    if v_svc.clinical_concept_variant_id is not null and v_svc.clinical_concept_id is null then
      raise exception 'clinical_concept_variant_id requires clinical_concept_id';
    end if;

    if v_svc.mapping_status is not null and v_svc.clinical_concept_id is null then
      raise exception 'mapping_status requires clinical_concept_id';
    end if;

    if v_svc.mapping_status is not null and v_svc.mapping_status not in ('resolved', 'unresolved') then
      raise exception 'mapping_status % is invalid (must be resolved or unresolved)', v_svc.mapping_status;
    end if;

    -- GAP 2 (snapshot inicial): la comparación de nombre se hace en el
    -- MISMO exists() que ya validaba existencia/activo — nunca una
    -- segunda query. Esto es SOLO al insertar: una vez persistido, el
    -- snapshot es histórico y no se re-valida ni se re-resuelve en
    -- lecturas posteriores (ver el header comment de esta migración).
    if v_svc.clinical_concept_id is not null and not exists (
      select 1 from public.clinical_concepts
      where id = v_svc.clinical_concept_id and active and name = v_svc.clinical_concept_name_snapshot
    ) then
      raise exception 'clinical_concept_id % does not exist, is not active, or clinical_concept_name_snapshot does not match its current name', v_svc.clinical_concept_id;
    end if;

    if v_svc.clinical_concept_variant_id is not null and not exists (
      select 1 from public.clinical_concept_variants
      where id = v_svc.clinical_concept_variant_id and concept_id = v_svc.clinical_concept_id and active
        and name = v_svc.clinical_variant_name_snapshot
    ) then
      raise exception 'clinical_concept_variant_id % does not belong to clinical_concept_id %, is not active, or clinical_variant_name_snapshot does not match its current name', v_svc.clinical_concept_variant_id, v_svc.clinical_concept_id;
    end if;

    -- GAP 1 (Concepto/Variante/Especialidad ↔ CUPS): solo se valida
    -- cuando mapping_status = 'resolved' — 'unresolved' nunca ejercita
    -- ninguna validación estructural adicional (ver este migración's own
    -- header comment: no inventar una validación falsa para un estado que
    -- la aplicación ni siquiera escribe hoy).
    if v_svc.clinical_concept_id is not null and v_svc.mapping_status = 'resolved' then
      -- Especialidad SIEMPRE tomada del professional_profile_id del
      -- MISMO servicio (ya validado arriba que pertenece a esta clínica)
      -- — nunca por nombre, nunca por heurística.
      select pp.primary_specialty_id into v_specialty_id
      from public.professional_profiles pp
      where pp.id = v_svc.professional_profile_id;

      v_expected_cups_catalog_id := null;

      -- Paso 1: mapping específico de la especialidad del profesional,
      -- si tiene una. variant_id comparado con IS NOT DISTINCT FROM
      -- (NULL-safe): un concepto sin variante (variant_id NULL) debe
      -- poder machear la fila de mapping cuyo variant_id también es NULL,
      -- exactamente la misma semántica que
      -- clinical_cups_mappings_active_unique_idx (A1) ya usa via coalesce().
      if v_specialty_id is not null then
        select m.cups_catalog_id into v_expected_cups_catalog_id
        from public.clinical_cups_mappings m
        where m.concept_id = v_svc.clinical_concept_id
          and m.variant_id is not distinct from v_svc.clinical_concept_variant_id
          and m.specialty_id = v_specialty_id
          and m.status = 'active';
      end if;

      -- Paso 2: SOLO si no hay un mapping específico aplicable, cae al
      -- mapping genérico (specialty_id IS NULL) — jamás al revés: un
      -- genérico nunca se acepta como válido si ya existe uno específico
      -- para esta especialidad (aunque ese específico resuelva un CUPS
      -- distinto al enviado — eso es precisamente lo que la comparación
      -- de abajo rechaza).
      if v_expected_cups_catalog_id is null then
        select m.cups_catalog_id into v_expected_cups_catalog_id
        from public.clinical_cups_mappings m
        where m.concept_id = v_svc.clinical_concept_id
          and m.variant_id is not distinct from v_svc.clinical_concept_variant_id
          and m.specialty_id is null
          and m.status = 'active';
      end if;

      if v_expected_cups_catalog_id is null then
        raise exception 'clinical_concept_id % (variant %) has no active clinical_cups_mappings row to validate mapping_status=resolved', v_svc.clinical_concept_id, v_svc.clinical_concept_variant_id;
      end if;

      if v_expected_cups_catalog_id <> v_cups_catalog_id then
        select code into v_expected_cups_code from public.cups_catalog where id = v_expected_cups_catalog_id;
        raise exception 'cups_code % does not match the CUPS resolved by clinical_cups_mappings for this concept/variant/specialty (expected %)', v_svc.cups_code, v_expected_cups_code;
      end if;
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
      finalidad_code, causa_motivo_code, concepto_recaudo_code, valor_pago_moderador, sequence,
      clinical_concept_id, clinical_concept_variant_id, clinical_concept_name_snapshot,
      clinical_variant_name_snapshot, mapping_status
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
      ord - 1,
      (item ->> 'clinical_concept_id')::uuid,
      (item ->> 'clinical_concept_variant_id')::uuid,
      item ->> 'clinical_concept_name_snapshot',
      item ->> 'clinical_variant_name_snapshot',
      item ->> 'mapping_status'
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
