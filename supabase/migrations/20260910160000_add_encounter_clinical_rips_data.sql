-- Odentia Core — RIPS #4: diagnósticos CIE-10 + servicios CUPS realmente
-- ejecutados, por atención (encounter)
--
-- Datos y reglas verificadas leyendo el texto real del Documento Técnico 1
-- (Resolución 948 de 2026), secciones 4.2 (usuarios), 4.3.1 (consultas) y
-- 4.3.2 (procedimientos) — no asumidas. Ver el reporte de esta sesión para
-- la matriz completa campo RIPS → fuente Odentia.
--
-- PRINCIPIO: esto registra SERVICIOS REALMENTE EJECUTADOS durante una
-- atención ya ocurrida — nunca un Treatment Plan (lo que se propone) ni
-- `patient_clinical_encounter_procedures` (la lista de procedimientos en
-- texto libre que el consultorio ya usaba para su propio resumen clínico/
-- interno — sigue existiendo sin cambios, nunca es la fuente de RIPS).
--
-- ============================================================
-- 1. incapacidad (U09) — pertenece a LA ATENCIÓN, nunca al paciente
-- ============================================================
-- RIPS #3 dejó esto deliberadamente fuera de `patients` (ver ese informe,
-- Sección 16): "Identificador de la expedición de una incapacidad
-- soportada en LA ATENCIÓN EN SALUD que se reporta en RIPS" (texto
-- literal del campo U09) — es un hecho de la atención, no del paciente.
-- Catálogo oficial LstSiNo (RIPS 02E): code 01=SI, 02=NO, vía la columna
-- Extra_III:ListSINO10 (ver ese import). Nullable — ninguna atención
-- existente lo tiene, no se exige retroactivamente.
alter table public.patient_clinical_encounters
  add column incapacity_code text;

alter table public.patient_clinical_encounters
  add constraint patient_clinical_encounters_incapacity_code_length
    check (incapacity_code is null or char_length(incapacity_code) = 2);


-- ============================================================
-- 2. encounter_diagnoses — CIE-10 estructurado por atención
-- ============================================================
-- Documento Técnico 1: cada consulta/procedimiento tiene TÉCNICAMENTE sus
-- propios campos de diagnóstico (C10-C13 por consulta, P13/P14 por
-- procedimiento) — pero para una atención odontológica ambulatoria, un
-- único contexto diagnóstico por atención (no uno distinto por cada
-- servicio) es la simplificación correcta para este alcance: se modela
-- UNA lista de diagnósticos POR ENCOUNTER (no por servicio), reutilizada
-- al generar el JSON RIPS en cada consulta/procedimiento de esa misma
-- atención (RIPS #5, no implementado aquí). Documentado como decisión
-- explícita, no un descuido — ver el reporte de esta sesión.
--
-- diagnosis_type_code (C14 tipoDiagnosticoPrincipal — "si el diagnóstico
-- es confirmado o presuntivo") solo aplica al diagnóstico PRINCIPAL, un
-- concepto DISTINTO de `role` (que es la posición dentro de la atención,
-- no el estado clínico) — ver Sección 8 de este prompt. El CHECK de abajo
-- lo hace estructuralmente imposible de poblar en una fila 'related'.
create table public.encounter_diagnoses (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  cie10_code text not null,
  role text not null check (role in ('principal', 'related')),
  diagnosis_type_code text,
  sequence integer not null default 0,
  created_at timestamptz not null default now(),
  constraint encounter_diagnoses_encounter_clinic_fk
    foreign key (encounter_id, clinic_id)
    references public.patient_clinical_encounters (id, clinic_id)
    on delete cascade,
  constraint encounter_diagnoses_diagnosis_type_only_for_principal
    check (role = 'principal' or diagnosis_type_code is null),
  constraint encounter_diagnoses_diagnosis_type_code_length
    check (diagnosis_type_code is null or char_length(diagnosis_type_code) = 2)
);

-- "Máximo un diagnóstico principal" index moved below (after
-- encounter_services exists) — see RIPS #4A's
-- encounter_diagnoses_one_principal_per_scope for why the scope changed
-- from "per encounter" to "per encounter, or per specific service within
-- it" and why a plain unique index over a nullable column couldn't
-- express that.

-- "Unique CIE-10 per scope" index also moved below, same reason as the
-- principal-diagnosis index above: two DIFFERENT services within the same
-- encounter may legitimately share a CIE-10 code (e.g. two separate teeth
-- each independently diagnosed with the same condition, treated as two
-- distinct procedures) — an encounter-wide uniqueness would wrongly
-- reject that once diagnoses can be scoped per-service.

create index encounter_diagnoses_encounter_id_idx on public.encounter_diagnoses (encounter_id);

alter table public.encounter_diagnoses enable row level security;

create policy encounter_diagnoses_select_member
  on public.encounter_diagnoses for select
  to authenticated
  using (public.is_clinic_member(clinic_id));
-- Sin política de INSERT/UPDATE/DELETE — mismo patrón que
-- patient_clinical_encounter_procedures: solo se escribe a través de
-- upsert_patient_clinical_encounter() más abajo.
grant select on public.encounter_diagnoses to authenticated;


-- ============================================================
-- 3. encounter_services — CUPS realmente ejecutados durante la atención
-- ============================================================
-- Nombrada `encounter_services` (no `encounter_procedures`): CUPS incluye
-- tanto consultas como procedimientos, y ya existe la clasificación
-- oficial cups_catalog.rips_service_type — una sola tabla para ambos,
-- nunca dos tablas paralelas por tipo.
--
-- rips_service_type se SNAPSHOTEA en cada fila (no se re-deriva en cada
-- lectura desde cups_catalog): es la decisión estructural de si este
-- servicio pertenece a la sección "consultas" o "procedimientos" del RIPS
-- que se genere después — si SISPRO corrige la clasificación de un CUPS
-- más adelante, una atención ya registrada no debe cambiar de forma
-- retroactivamente bajo los pies de quien la registró. 'unknown' SÍ se
-- permite guardar (Sección 4 del prompt: nunca bloquear el registro
-- clínico por un vacío de clasificación regulatoria) — queda visible como
-- incompleto vía el completeness helper, nunca oculto ni adivinado.
--
-- NO se guarda snapshot de descripción CUPS/CIE10 (ver Sección 22 del
-- prompt): cups_catalog/diagnosis_catalog ya son catálogos versionados
-- (valid_from/valid_to/status, nunca borrados — ver RIPS 02/02E) y
-- catalog-data.ts ya sabe resolver "qué versión estaba vigente en la
-- fecha X" (findCupsByCode(code, onDate)/findDiagnosisByCode(...,
-- onDate)) — guardar además el texto sería duplicar sin necesidad lo que
-- ya es reconstruible exactamente a partir de encounter.occurred_at +
-- el propio catalog_key/code. Decisión documentada, no un descuido.
--
-- grupo_servicios_code/cod_servicio_code: CUPSGrServicios (~1.44M filas,
-- RIPS #3 §5bis) sigue sin importarse — se pidió evaluar en esta sesión
-- si es necesaria YA para evitar combinaciones inválidas (Sección 10 del
-- prompt). Decisión: NO. Se capturan estos dos campos como selección
-- manual validada cada uno contra SU PROPIO catálogo oficial
-- (GrupoServicios, 5 filas; Servicios, 157 filas, ya con parent_code →
-- GrupoServicios desde RIPS 02E) — exactamente igual de válido
-- regulatoriamente como campo por sí solo — pero SIN cruzar que la
-- combinación específica (este CUPS + este grupo + este servicio) sea la
-- oficialmente asociada en CUPSGrServicios. Ese cruce fino se difiere a
-- una fase de prevalidación RIPS (RIPS #5), evitando forzar un dataset de
-- 1.44M filas sin necesidad clínica inmediata para un piloto de
-- odontología ambulatoria.
create table public.encounter_services (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  professional_profile_id uuid not null,
  cups_code text not null,
  rips_service_type text not null check (rips_service_type in ('consultation', 'procedure', 'unknown')),
  performed_at timestamptz not null default now(),
  service_value numeric,
  -- P06 viaIngresoServicioSalud — SOLO existe para procedimientos en el
  -- Documento Técnico 1 (no hay campo equivalente para consultas).
  via_ingreso_code text,
  -- C05/P07 modalidadGrupoServicioTecSal — aplica a ambos tipos.
  modalidad_code text,
  -- C06/P08 grupoServicios / C07/P09 codServicio — ver nota arriba.
  grupo_servicios_code text,
  cod_servicio_code text,
  -- C08/P10 finalidadTecnologiaSalud — aplica a ambos (tabla unificada
  -- RIPSFinalidadConsultaVersion2, ver RIPS 02E).
  finalidad_code text,
  -- C09 causaMotivoAtencion — SOLO existe para consultas en el Documento
  -- Técnico 1 (no hay campo equivalente para procedimientos).
  causa_motivo_code text,
  -- C18/P17 conceptoRecaudo + C19/P18 valorPagoModerador — condicionales
  -- (solo régimen contributivo con copago/cuota moderadora, numeral 1.8
  -- del propio Documento Técnico 1) — nunca obligatorios aquí.
  concepto_recaudo_code text,
  valor_pago_moderador numeric,
  sequence integer not null default 0,
  created_at timestamptz not null default now(),
  constraint encounter_services_encounter_clinic_fk
    foreign key (encounter_id, clinic_id)
    references public.patient_clinical_encounters (id, clinic_id)
    on delete cascade,
  constraint encounter_services_professional_clinic_fk
    foreign key (professional_profile_id, clinic_id)
    references public.professional_profiles (id, clinic_id),
  constraint encounter_services_service_value_non_negative
    check (service_value is null or service_value >= 0),
  constraint encounter_services_valor_pago_moderador_non_negative
    check (valor_pago_moderador is null or valor_pago_moderador >= 0),
  -- RIPS #4A correction: field exclusivity by rips_service_type, enforced
  -- structurally (a real CHECK, not just RPC-level validation — Sección
  -- 21 "no dependas solo de la UI"). Verified directly against the
  -- Documento Técnico 1 field spec: P06 viaIngresoServicioSalud exists
  -- ONLY under 4.3.2 Procedimientos — no equivalent field is defined for
  -- Consultas — and C09 causaMotivoAtencion exists ONLY under 4.3.1
  -- Consultas — no equivalent field is defined for Procedimientos. Every
  -- other captured field (modalidad/grupoServicios/codServicio/finalidad/
  -- vrServicio/conceptoRecaudo/valorPagoModerador) is defined for BOTH
  -- sections under matching field ids (C05/P07, C06/P08, C07/P09, C08/P10,
  -- C17/P16, C18/P17, C19/P18 respectively) and so carries no exclusivity
  -- constraint here. An 'unknown'-classified service satisfies NEITHER
  -- `= 'procedure'` nor `= 'consultation'` below, so BOTH fields are
  -- blocked (must stay null) until the CUPS code is actually classified —
  -- correct, not an oversight: neither field can be known-correct for a
  -- service whose own consultation/procedure identity isn't resolved yet.
  constraint encounter_services_via_ingreso_only_for_procedure
    check (via_ingreso_code is null or rips_service_type = 'procedure'),
  constraint encounter_services_causa_motivo_only_for_consultation
    check (causa_motivo_code is null or rips_service_type = 'consultation'),
  -- Backing FK target for encounter_diagnoses.encounter_service_id below —
  -- lets that FK also guarantee the diagnosis's encounter_id agrees with
  -- the service's own encounter_id (the composite FK there references
  -- BOTH columns), never just trusting the pairing.
  constraint encounter_services_id_encounter_id_key unique (id, encounter_id)
);

create index encounter_services_encounter_id_idx on public.encounter_services (encounter_id);
create index encounter_services_professional_profile_id_idx on public.encounter_services (professional_profile_id);

alter table public.encounter_services enable row level security;

create policy encounter_services_select_member
  on public.encounter_services for select
  to authenticated
  using (public.is_clinic_member(clinic_id));
grant select on public.encounter_services to authenticated;


-- ============================================================
-- 3bis. encounter_diagnoses.encounter_service_id — RIPS #4A correction
-- ============================================================
-- Documento Técnico 1 actually carries diagnosis fields PER SERVICE
-- (C10-C13 per consulta, P13/P14 per procedimiento) — encounter_diagnoses
-- above deliberately models ONE SHARED list per encounter instead, as the
-- correct MVP simplification for the common dental case (one diagnostic
-- context covering the whole visit). Verified this does NOT lose real
-- information for two concrete scenarios asked about directly:
--
--   (a) one consultation + one procedure in the same encounter, same
--       diagnosis: fully representable — encounter_service_id stays
--       null, the single shared diagnosis list applies to both services
--       at JSON-generation time (RIPS #5, not implemented here).
--
--   (b) two procedures in the same encounter with DIFFERENT principal
--       diagnoses (e.g. two separate teeth, two unrelated conditions,
--       treated in one visit): NOT representable by an encounter-wide
--       "at most one principal" rule — that would force both procedures
--       to share a single principal diagnosis, silently misrepresenting
--       one of them. This is a real, clinically plausible case for a
--       dental visit, not a hypothetical — corrected here before
--       production rather than left as debt against real clinical data.
--
-- Minimal fix: an OPTIONAL scope column. NULL (the default, and the only
-- value the current UI ever writes) means "applies to the whole
-- encounter" — the common case stays exactly as simple as before. Set to
-- a specific encounter_services.id, a diagnosis instead applies ONLY to
-- that one service, letting two procedures in the same encounter carry
-- independent principal diagnoses when that's what actually happened.
-- Building the UI to assign a diagnosis to one specific service is
-- deliberately NOT part of this migration (see this task's own scope) —
-- this is the schema-level fix only, so a later UI addition needs no
-- further migration.
alter table public.encounter_diagnoses
  add column encounter_service_id uuid;

alter table public.encounter_diagnoses
  add constraint encounter_diagnoses_service_encounter_fk
    foreign key (encounter_service_id, encounter_id)
    references public.encounter_services (id, encounter_id)
    on delete cascade;

-- Max one principal per scope: per encounter as a whole (when
-- encounter_service_id is null) AND, independently, per specific service
-- (when set) — the sentinel keeps every NULL grouped together for
-- uniqueness purposes, since a plain unique index would otherwise treat
-- each NULL as distinct (Postgres's normal NULL-uniqueness semantics,
-- which is exactly the bug this sentinel avoids).
create unique index encounter_diagnoses_one_principal_per_scope
  on public.encounter_diagnoses (encounter_id, coalesce(encounter_service_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where role = 'principal';

-- Same scoping for "no duplicate CIE-10 code" — two DIFFERENT services in
-- the same encounter may legitimately share a code (see scenario (b)'s
-- own sibling case: two teeth, same diagnosis, two procedures), but the
-- SAME scope (the whole encounter, or one specific service) never should.
create unique index encounter_diagnoses_unique_code_per_scope
  on public.encounter_diagnoses (encounter_id, coalesce(encounter_service_id, '00000000-0000-0000-0000-000000000000'::uuid), cie10_code);


-- ============================================================
-- 4. upsert_patient_clinical_encounter — extendida con incapacidad,
-- diagnósticos y servicios (drop, no CREATE OR REPLACE: cambia la firma)
-- ============================================================
-- p_diagnoses: jsonb array de {"cie10_code": text, "role": "principal"|
-- "related", "diagnosis_type_code": text|null}. p_services: jsonb array
-- de {"cups_code": text, "professional_profile_id": uuid, "performed_at":
-- timestamptz|null, "service_value": numeric|null, "via_ingreso_code":
-- text|null, "modalidad_code": text|null, "grupo_servicios_code":
-- text|null, "cod_servicio_code": text|null, "finalidad_code": text|null,
-- "causa_motivo_code": text|null, "concepto_recaudo_code": text|null,
-- "valor_pago_moderador": numeric|null}. Ambos: pura forma de transporte
-- (igual que p_procedures ya existente), nunca almacenados como JSON —
-- se reemplaza el conjunto completo de cada tabla en cada llamada, mismo
-- patrón "replace-all" ya usado para patient_clinical_encounter_procedures
-- (la UI siempre edita el conjunto completo, nunca un parche parcial).
--
-- Validación server-side (Sección 21 del prompt) — imposible persistir:
-- CIE-10 inexistente, CUPS inexistente, segundo diagnóstico principal
-- (constraint), profesional de otra clínica (FK compuesta), código de
-- catálogo incorrecto para la columna (cada columna se valida contra SU
-- catalog_key fijo, nunca uno genérico — mismo patrón que RIPS #3).
drop function if exists public.upsert_patient_clinical_encounter(uuid, timestamptz, text, text, text, text, text, jsonb, uuid, boolean);

create function public.upsert_patient_clinical_encounter(
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
  -- service_sequence (optional, RIPS #4A) scopes a diagnosis to one
  -- specific service instead of the whole encounter — see the
  -- encounter_service_id column's own migration comment for why this is
  -- a position within THIS SAME p_services array, never a raw database
  -- id. "At most one principal" and "no duplicate CIE-10" must each be
  -- checked PER SCOPE (encounter-wide null scope, or each individual
  -- service_sequence) — never one global count — otherwise two
  -- procedures with two independently-valid principal diagnoses would be
  -- wrongly rejected (see that migration's own worked example).
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

  -- Grouped, scope-aware checks — mirrors exactly what
  -- encounter_diagnoses_one_principal_per_scope/_unique_code_per_scope
  -- enforce at the DB level, just checked here first for a clean
  -- exception instead of a raw constraint-violation error.
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

    -- RIPS #4A: field exclusivity by type, checked here for a friendly
    -- message — the real guarantee is the CHECK constraint on
    -- encounter_services itself (this pre-check can never be bypassed by
    -- a caller other than this RPC, since there is no other write path).
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

  -- ---- Encounter row itself (unchanged logic from the prior version) ----
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

  -- ---- Replace procedures (unchanged), services, then diagnoses atomically ----
  -- Services are replaced BEFORE diagnoses (order matters here, unlike
  -- before RIPS #4A): encounter_services rows are wholesale delete+
  -- reinserted every call (same "UI always sends the full current set"
  -- pattern as procedures), so they get FRESH ids on every save — a raw
  -- client-supplied encounter_service_id in p_diagnoses could never stay
  -- valid across saves, and worse, the ON DELETE CASCADE from
  -- encounter_diagnoses to encounter_services would silently wipe any
  -- scoped diagnosis on the very next draft save. Instead, a diagnosis
  -- that wants to scope itself to one specific service refers to it by
  -- `service_sequence` (its 0-based position in THIS SAME p_services
  -- array, matching that service's own `sequence` column) — resolved to
  -- the real, just-inserted encounter_services.id below, entirely within
  -- this one transaction. The current UI never sends service_sequence
  -- (always encounter-wide, service_sequence null) — this machinery
  -- exists so a future per-service-diagnosis UI needs no further
  -- migration, not because anything calls it today.
  delete from public.patient_clinical_encounter_procedures where encounter_id = v_result.id;
  insert into public.patient_clinical_encounter_procedures (encounter_id, clinic_id, name, note, position)
  select v_result.id, v_clinic_id, item ->> 'name', item ->> 'note', ordinality - 1
  from jsonb_array_elements(coalesce(p_procedures, '[]'::jsonb)) with ordinality as item
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
      -- Documento Técnico 1 P16: "Si el RIPS es sin Factura Electrónica de
      -- Venta FEV en salud, informar cero (0)" para PROCEDIMIENTOS — regla
      -- regulatoria explícita, no un default arbitrario. Las CONSULTAS
      -- (C17) exigen el valor efectivamente pagado por el paciente — sin
      -- una fuente automática todavía en Odentia, se deja tal cual venga
      -- (null si no se captura), reportado como gap real en completeness.
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
      ordinality - 1
    from jsonb_array_elements(coalesce(p_services, '[]'::jsonb)) with ordinality as item
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
    ordinality - 1
  from jsonb_array_elements(coalesce(p_diagnoses, '[]'::jsonb)) with ordinality as item;

  return v_result;
end;
$$;

revoke execute on function public.upsert_patient_clinical_encounter(
  uuid, timestamptz, text, text, text, text, text, jsonb, uuid, boolean, text, jsonb, jsonb
) from public;
grant execute on function public.upsert_patient_clinical_encounter(
  uuid, timestamptz, text, text, text, text, text, jsonb, uuid, boolean, text, jsonb, jsonb
) to authenticated;
