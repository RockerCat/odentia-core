-- Odentia Core — RIPS Fase A2: Especialidad Odentia → Servicio RIPS
--
-- Alcance ESTRICTO de esta migración (ver auditoría A2 de esta sesión):
-- crea únicamente la infraestructura persistente de dos catálogos
-- pequeños y su seed de defaults. NO toca encounter_services,
-- appointments, patient_clinical_encounters, professional_profiles,
-- clinic_locations, treatments, clinical_concepts/variants/mappings
-- (A1), export-readiness ni el generador RIPS. Cero UI, cero consumo
-- desde una atención — eso queda para una fase posterior explícita.
--
-- ============================================================
-- DECISIÓN: dos tablas, no una con clinic_id nullable
-- ============================================================
-- La auditoría A2 pidió explícitamente separar "sugerencia global de
-- Odentia" de "configuración confirmada por una clínica" en DOS
-- entidades distintas, nunca una sola tabla donde clinic_id NULL
-- signifique "es un default". Una sugerencia global nunca debe poder
-- leerse ni confundirse con una confirmación administrativa real de una
-- clínica — separarlas en tablas distintas lo hace estructuralmente
-- imposible, no solo una convención de datos.
--
-- ============================================================
-- DECISIÓN: nivel clínica, no sede — mismo motivo que bloquea RIPS hoy
-- ============================================================
-- La auditoría A2 confirmó que professional_profiles NO está asociado a
-- una clinic_location, y que ningún appointment/encounter tiene FK
-- estructural a clinic_location (appointments.room es texto libre, no
-- una FK — ver export-readiness.ts, LOCATION_AMBIGUOUS). Configurar esto
-- a nivel sede hoy produciría configuración inconsumible: no hay forma
-- de determinar en qué sede ocurrió una atención concreta para aplicarla.
-- clinic_specialty_rips_services queda por tanto a nivel (clinic_id,
-- specialty_id) en V0. Esto podrá evolucionar a (clinic_location_id,
-- specialty_id) cuando exista una relación estructural encounter →
-- location — NO se resuelve ese gap en esta migración, y esta migración
-- deliberadamente NO agrega clinic_location_id a appointments/encounters
-- ni modifica LOCATION_AMBIGUOUS.
--
-- ============================================================
-- Integridad "la fila referenciada es realmente un Servicio RIPS"
-- ============================================================
-- rips_reference_values es una tabla genérica compartida por múltiples
-- catálogos pequeños (Sexo, Municipio, GrupoServicios, Servicios, ...) —
-- una FK plana hacia su `id` NO garantiza que la fila apuntada pertenezca
-- a catalog_key = 'Servicios' en vez de, por error, a otro catálogo.
-- Se reutiliza EXACTAMENTE el mismo patrón ya usado en este esquema para
-- el mismo problema (professional_profiles_membership_clinic_fk en el
-- foundation schema; clinical_cups_mappings_variant_concept_fk en A1):
-- una columna denormalizada con el valor esperado + una FK COMPUESTA
-- hacia (id, catalog_key), respaldada por un UNIQUE compuesto nuevo sobre
-- rips_reference_values. Esto hace estructuralmente imposible insertar
-- una fila que apunte a un id de rips_reference_values cuyo catalog_key
-- real no sea 'Servicios' — Postgres lo rechaza en el INSERT, no
-- depende de disciplina de aplicación ni de un trigger.
alter table public.rips_reference_values
  add constraint rips_reference_values_id_catalog_key_key
    unique (id, catalog_key);


-- ============================================================
-- 1. specialty_rips_service_defaults — sugerencia GLOBAL de Odentia
-- ============================================================
-- Catálogo de dominio administrado por Odentia, nunca por una clínica:
-- mismo patrón exacto que clinical_concepts/clinical_cups_mappings (A1) —
-- RLS habilitado con SOLO una policy de SELECT para `authenticated`, sin
-- ninguna policy de INSERT/UPDATE/DELETE (deny-by-default). Editable
-- únicamente vía una migración futura o un proceso administrado con
-- service_role — nunca desde un clinic_admin ni desde el cliente.
--
-- Una fila aquí es una SUGERENCIA, nunca una confirmación administrativa
-- de ninguna clínica — ver clinic_specialty_rips_services más abajo para
-- la entidad que sí representa eso.
create table public.specialty_rips_service_defaults (
  id uuid primary key default gen_random_uuid(),
  specialty_id uuid not null references public.specialties (id) on delete restrict,
  rips_reference_value_id uuid not null,
  -- Denormalizado a propósito, solo para respaldar la FK compuesta de
  -- abajo — ver nota de integridad al inicio del archivo. Siempre
  -- 'Servicios': el CHECK lo fija, nunca queda a discreción del insert.
  rips_reference_value_catalog_key text not null default 'Servicios'
    check (rips_reference_value_catalog_key = 'Servicios'),
  valid_from date not null default current_date,
  valid_to date,
  status text not null default 'active' check (status in ('active', 'superseded', 'deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint specialty_rips_service_defaults_rips_reference_value_fk
    foreign key (rips_reference_value_id, rips_reference_value_catalog_key)
    references public.rips_reference_values (id, catalog_key)
    on delete restrict,
  constraint specialty_rips_service_defaults_valid_range
    check (valid_to is null or valid_to >= valid_from)
);
-- specialty_id restrict: mismo criterio que clinical_cups_mappings.specialty_id
-- (A1) — una especialidad en uso por un mapping regulatorio no debe poder
-- borrarse silenciosamente por cascada.

-- A lo sumo UN default activo por especialidad (no hay dimensión
-- variante/clínica aquí — es un catálogo global de una sola columna
-- funcional).
create unique index specialty_rips_service_defaults_active_unique_idx
  on public.specialty_rips_service_defaults (specialty_id)
  where status = 'active';

create index specialty_rips_service_defaults_rips_reference_value_id_idx
  on public.specialty_rips_service_defaults (rips_reference_value_id);

create trigger set_updated_at
  before update on public.specialty_rips_service_defaults
  for each row execute function public.set_updated_at();

alter table public.specialty_rips_service_defaults enable row level security;

create policy specialty_rips_service_defaults_select_authenticated
  on public.specialty_rips_service_defaults for select
  to authenticated
  using (true);
-- Sin policy de insert/update/delete — deny-by-default, mismo patrón que
-- clinical_concepts/clinical_cups_mappings/cups_catalog.

grant select on public.specialty_rips_service_defaults to authenticated;
-- service_role explícito: la auditoría de catálogo de A1 encontró que
-- service_role no tenía GRANT implícito sobre specialties en este
-- proyecto pese a bypassar RLS — se otorga aquí explícitamente por el
-- mismo motivo, sin asumir el privilegio por defecto.
grant select on public.specialty_rips_service_defaults to service_role;


-- ============================================================
-- 2. clinic_specialty_rips_services — configuración CONFIRMADA por UNA
--    clínica concreta
-- ============================================================
-- Significa explícitamente "esta clínica confirmó que esta especialidad
-- se reporta bajo este Servicio RIPS" — nunca una sugerencia. clinic_id
-- es NOT NULL a propósito (ver auditoría A2: "no permitir NULL como
-- forma de representar 'usa default'"). La AUSENCIA de una fila para
-- (clinic_id, specialty_id) significa "esta clínica todavía no ha
-- confirmado/configurado este Servicio RIPS" — nunca "usa el default".
-- Resolver ese fallback (leer specialty_rips_service_defaults cuando no
-- exista fila aquí) es responsabilidad de una fase de UI/consumo
-- posterior, no de esta tabla.
--
-- Sin política de INSERT/UPDATE/DELETE en esta fase (ver auditoría A2,
-- Sección Seguridad): todavía no existe UI de configuración ni RPC de
-- escritura — se prioriza seguridad sobre conveniencia, dejando
-- select-only hasta que una RPC/Server Action real (con su propia
-- validación de rol clinic_admin) se implemente junto a esa UI.
create table public.clinic_specialty_rips_services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  specialty_id uuid not null references public.specialties (id) on delete restrict,
  rips_reference_value_id uuid not null,
  rips_reference_value_catalog_key text not null default 'Servicios'
    check (rips_reference_value_catalog_key = 'Servicios'),
  valid_from date not null default current_date,
  valid_to date,
  status text not null default 'active' check (status in ('active', 'superseded', 'deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_specialty_rips_services_rips_reference_value_fk
    foreign key (rips_reference_value_id, rips_reference_value_catalog_key)
    references public.rips_reference_values (id, catalog_key)
    on delete restrict,
  constraint clinic_specialty_rips_services_valid_range
    check (valid_to is null or valid_to >= valid_from)
);
-- clinic_id cascade: es un registro de configuración operativa, no un
-- dato clínico — mismo criterio que clinic_memberships (foundation
-- schema): no tiene sentido una vez que la clínica ya no existe.
-- specialty_id restrict: mismo criterio que la tabla de defaults arriba.

-- A lo sumo UNA configuración activa por (clínica, especialidad) — nunca
-- dos Servicios RIPS activos simultáneamente para la misma combinación.
create unique index clinic_specialty_rips_services_active_unique_idx
  on public.clinic_specialty_rips_services (clinic_id, specialty_id)
  where status = 'active';

create index clinic_specialty_rips_services_clinic_id_idx
  on public.clinic_specialty_rips_services (clinic_id);
create index clinic_specialty_rips_services_rips_reference_value_id_idx
  on public.clinic_specialty_rips_services (rips_reference_value_id);

create trigger set_updated_at
  before update on public.clinic_specialty_rips_services
  for each row execute function public.set_updated_at();

alter table public.clinic_specialty_rips_services enable row level security;

-- Aislamiento multi-tenant vía el mismo helper ya usado en todo el
-- esquema (is_clinic_member — foundation RLS policies) — nunca un
-- framework de permisos nuevo. Una clínica jamás puede leer la
-- configuración de otra.
create policy clinic_specialty_rips_services_select_member
  on public.clinic_specialty_rips_services for select
  to authenticated
  using (public.is_clinic_member(clinic_id));
-- Sin política de insert/update/delete — ver nota de diseño arriba.

grant select on public.clinic_specialty_rips_services to authenticated;
grant select on public.clinic_specialty_rips_services to service_role;


-- ============================================================
-- Seed — las 6 sugerencias globales confirmadas por la auditoría A2.
-- Deliberadamente SIN fila para Cirugía oral y maxilofacial (más de una
-- posibilidad regulatoria), Implantología ni Estética dental (sin
-- Servicio RIPS propio confirmado) — quedan sin default por diseño,
-- nunca inventando una equivalencia (mismo principio que A1 aplicó a
-- specialty_consultation).
--
-- Fail-fast idéntico al bloque DO de A1: resuelve cada specialty_name y
-- cada código de Servicio explícitamente y aborta la migración completa
-- (revierte la transacción) si la especialidad no existe, o si el código
-- no tiene ninguna fila activa en rips_reference_values bajo
-- catalog_key='Servicios', o si tiene más de una (ambigüedad) — SELECT
-- ... INTO STRICT detecta ambos casos, a diferencia de un SELECT INTO
-- simple que dejaría pasar un NULL silencioso.
do $$
declare
  m record;
  v_specialty_id uuid;
  v_rips_reference_value_id uuid;
begin
  for m in
    select * from (
      values
        ('Odontología general', '334'),
        ('Endodoncia', '311'),
        ('Ortodoncia', '338'),
        ('Periodoncia', '343'),
        ('Rehabilitación oral', '347'),
        ('Odontopediatría', '396')
    ) as t (specialty_name, servicio_code)
  loop
    select s.id into v_specialty_id
    from public.specialties s
    where s.name = m.specialty_name;

    if v_specialty_id is null then
      raise exception 'specialty_rips_service_defaults seed: specialty_name "%" does not exist', m.specialty_name;
    end if;

    begin
      select rv.id into strict v_rips_reference_value_id
      from public.rips_reference_values rv
      where rv.catalog_key = 'Servicios'
        and rv.code = m.servicio_code
        and rv.status = 'active';
    exception
      when no_data_found then
        raise exception 'specialty_rips_service_defaults seed: Servicio code "%" has no active row in rips_reference_values (catalog_key=Servicios)', m.servicio_code;
      when too_many_rows then
        raise exception 'specialty_rips_service_defaults seed: Servicio code "%" matches more than one active row in rips_reference_values (catalog_key=Servicios)', m.servicio_code;
    end;

    insert into public.specialty_rips_service_defaults (specialty_id, rips_reference_value_id)
    select v_specialty_id, v_rips_reference_value_id
    where not exists (
      select 1 from public.specialty_rips_service_defaults existing
      where existing.specialty_id = v_specialty_id
        and existing.status = 'active'
    );
  end loop;
end;
$$;

-- Nota deliberada: esta migración NO inserta ninguna fila en
-- clinic_specialty_rips_services para ninguna clínica existente. Un
-- default global nunca se copia automáticamente a una clínica concreta
-- (no hay backfill, no hay trigger on-clinic-create) — "default != efectivo"
-- hasta que una clínica lo confirme explícitamente a través de una UI/RPC
-- futura, fuera del alcance de esta migración.
