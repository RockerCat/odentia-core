-- Odentia Core — RIPS #3: identidad estructurada del paciente
--
-- Documento Técnico 1 (Resolución 948 de 2026), sección 4.2 DATOS
-- RELATIVOS A LOS USUARIOS — campos U01-U08 (U09 incapacidad
-- deliberadamente NO se modela aquí, ver src/features/rips/completeness.ts
-- para por qué: describe un hecho de la atención reportada, no un dato
-- estable del paciente). U11 codPaisOrigen tampoco es obligatorio de forma
-- incondicional en el propio texto del documento, así que se modela pero
-- no se exige para "completeness".
--
--   U01 TipoDocumentoIdentificacion (C, tamaño 2) -> document_type
--   U02 NumDocumentoIdentificacion  (C, tamaño 4-20) -> document_number
--   U03 tipoUsuario                 (C, tamaño 2) -> user_type_code
--   U04 fechaNacimiento             ya existe como patients.birth_date
--   U05 codSexo                     (C, tamaño 1) -> sex_code
--   U06 codPaisResidencia           (C, tamaño 3) -> country_of_residence_code
--   U07 codMunicipioResidencia      (C, tamaño 5, obligatorio si país=170) -> municipality_of_residence_code
--   U08 codZonaTerritorialResidencia(C, tamaño 2, obligatorio si país=170) -> residence_zone_code
--   U11 codPaisOrigen               (C, tamaño 3) -> country_of_origin_code
--
-- Todas nullable — ningún registro existente se rompe (ver este task's
-- Sección 12). document_id (el campo libre histórico, p.ej. "111" sin
-- tipo) se conserva SIN CAMBIOS y sigue siendo lo que ~15 pantallas ya
-- leen hoy (PDF, Portal, lista de pacientes, historia clínica, etc. — ver
-- el reporte de esta tarea para el inventario completo) — nunca se borra
-- ni se reescribe automáticamente aquí. Los dos pacientes reales
-- existentes tienen document_id puramente numérico (verificado antes de
-- escribir esta migración): se copia ese valor, sin reinterpretarlo, a
-- document_number (mismo valor, no una adivinanza), dejando document_type
-- en null — un paciente con document_number pero sin document_type es un
-- estado intermedio válido y esperado (ver el CHECK de abajo), reportado
-- como pendiente de completar, nunca inferido. A partir de ahora, el
-- formulario de creación/edición SÍ mantiene document_id sincronizado
-- ("TIPO NUMERO") cuando ambos campos estructurados están presentes — ver
-- src/features/patients/actions.ts — así ninguna de esas ~15 pantallas de
-- solo lectura necesita cambiar.

alter table public.patients
  add column document_type text,
  add column document_number text,
  add column sex_code text,
  add column user_type_code text,
  add column country_of_residence_code text,
  add column municipality_of_residence_code text,
  add column residence_zone_code text,
  add column country_of_origin_code text;

-- Un tipo sin número no tiene sentido; un número sin tipo (el estado de
-- migración de los 2 pacientes legacy de hoy) sí es válido temporalmente.
alter table public.patients
  add constraint patients_document_number_required_with_type
    check (document_number is not null or document_type is null);

alter table public.patients
  add constraint patients_document_type_length check (document_type is null or char_length(document_type) = 2);
alter table public.patients
  add constraint patients_sex_code_length check (sex_code is null or char_length(sex_code) = 1);
alter table public.patients
  add constraint patients_user_type_code_length check (user_type_code is null or char_length(user_type_code) = 2);
alter table public.patients
  add constraint patients_country_of_residence_code_length
    check (country_of_residence_code is null or char_length(country_of_residence_code) = 3);
alter table public.patients
  add constraint patients_country_of_origin_code_length
    check (country_of_origin_code is null or char_length(country_of_origin_code) = 3);
alter table public.patients
  add constraint patients_municipality_of_residence_code_length
    check (municipality_of_residence_code is null or char_length(municipality_of_residence_code) = 5);
alter table public.patients
  add constraint patients_residence_zone_code_length
    check (residence_zone_code is null or char_length(residence_zone_code) = 2);

-- Deterministic, safe backfill: copy the existing free-text document_id
-- into document_number ONLY where it's already unambiguously a bare
-- number (matches the 2 real rows in production today) — never guessed,
-- never touching document_id itself, never setting document_type.
update public.patients
set document_number = document_id
where document_number is null
  and document_id is not null
  and document_id ~ '^[0-9]{4,20}$';

-- One patient identity per (clinic, tipo, número) once both are known —
-- additive to, never replacing, the existing patients_clinic_id_document_id_key
-- on the legacy free-text column.
create unique index patients_clinic_id_document_type_number_key
  on public.patients (clinic_id, document_type, document_number)
  where document_type is not null and document_number is not null;


-- ============================================================
-- Server-side catalog validation — patients has no RLS INSERT/UPDATE RPC
-- layer (writes go directly through the Data API under
-- patients_insert_admin_or_assistant/patients_update_admin_or_assistant,
-- see the foundation RLS migration), so a BEFORE trigger is the only way
-- to guarantee every code column is checked against its OFFICIAL SISPRO
-- catalog server-side (this task's own Section 8), not just in a client
-- form. Each column is validated against exactly ONE fixed catalog_key —
-- never a generic "look up any catalog" check — so a code that happens to
-- exist in a different catalog (e.g. "01" is valid in both GrupoServicios
-- and ZonaVersion2) can never be silently accepted for the wrong column
-- (this task's own Section 7: no naive code-only matching across
-- catalogs).
-- ============================================================

create function public.validate_patient_rips_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.document_type is not null and not exists (
    select 1 from public.rips_reference_values
    where catalog_key = 'TipoDocumento' and code = new.document_type and status = 'active'
  ) then
    raise exception 'document_type % does not exist in the official TipoDocumento catalog', new.document_type;
  end if;

  if new.sex_code is not null and not exists (
    select 1 from public.rips_reference_values
    where catalog_key = 'SEXOconIndeterminado' and code = new.sex_code and status = 'active'
  ) then
    raise exception 'sex_code % does not exist in the official SEXOconIndeterminado catalog', new.sex_code;
  end if;

  if new.user_type_code is not null and not exists (
    select 1 from public.rips_reference_values
    where catalog_key = 'RIPSTipoUsuarioVersion2' and code = new.user_type_code and status = 'active'
  ) then
    raise exception 'user_type_code % does not exist in the official RIPSTipoUsuarioVersion2 catalog', new.user_type_code;
  end if;

  if new.country_of_residence_code is not null and not exists (
    select 1 from public.rips_reference_values
    where catalog_key = 'Pais' and code = new.country_of_residence_code and status = 'active'
  ) then
    raise exception 'country_of_residence_code % does not exist in the official Pais catalog', new.country_of_residence_code;
  end if;

  if new.country_of_origin_code is not null and not exists (
    select 1 from public.rips_reference_values
    where catalog_key = 'Pais' and code = new.country_of_origin_code and status = 'active'
  ) then
    raise exception 'country_of_origin_code % does not exist in the official Pais catalog', new.country_of_origin_code;
  end if;

  if new.municipality_of_residence_code is not null and not exists (
    select 1 from public.rips_reference_values
    where catalog_key = 'Municipio' and code = new.municipality_of_residence_code and status = 'active'
  ) then
    raise exception 'municipality_of_residence_code % does not exist in the official Municipio catalog', new.municipality_of_residence_code;
  end if;

  if new.residence_zone_code is not null and not exists (
    select 1 from public.rips_reference_values
    where catalog_key = 'ZonaVersion2' and code = new.residence_zone_code and status = 'active'
  ) then
    raise exception 'residence_zone_code % does not exist in the official ZonaVersion2 catalog', new.residence_zone_code;
  end if;

  return new;
end;
$$;

create trigger validate_patient_rips_identity
  before insert or update on public.patients
  for each row execute function public.validate_patient_rips_identity();
