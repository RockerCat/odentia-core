-- Odentia Core — Infraestructura de catálogos oficiales RIPS
--
-- Segunda fase del feature P0 de RIPS (ver auditoría previa, sesión RIPS
-- 01): esta migración SOLO crea la infraestructura de catálogos
-- oficiales versionados (CUPS, diagnósticos CIE-10/11, y las tablas de
-- referencia pequeñas del Documento Técnico 1 — Sexo, Municipio,
-- ZonaVersion2, TipoNota, etc.). Deliberadamente NO toca patients,
-- profiles, professional_profiles, clinics, clinic_locations,
-- appointments, ni ninguna tabla clínica existente — esas integraciones
-- (encounter_diagnoses, encounter_services, patient_rips_data, el motor
-- RIPS) son prompts posteriores.
--
-- Ninguna fila de datos reales se siembra aquí (ver docs/rips-catalogs.md):
-- no se dispone todavía del archivo oficial de CUPS ni de las tablas de
-- referencia SISPRO en este entorno, y esta auditoría/implementación
-- tiene expresamente prohibido inventar códigos o copiar valores de
-- fuentes no oficiales (blogs, el JSON de ejemplo de la odontóloga, etc.).
-- Las tres tablas de catálogo (cups_catalog, diagnosis_catalog,
-- rips_reference_values) quedan vacías hasta que un operador humano
-- ejecute un importador real (scripts/rips-import-*.mjs) contra un
-- archivo oficial descargado y verificado.
--
-- Principio de diseño (ver auditoría, Sección 6/17): un catálogo global,
-- compartido por todas las clínicas, NUNCA lleva clinic_id — igual que
-- specialties (foundation schema). Escritura únicamente vía las
-- funciones import_rips_*_catalog de abajo, ejecutadas con la
-- service_role key (bypassa RLS) desde un script de importación
-- controlado — nunca desde el cliente, nunca desde una clínica. No se
-- agrega ninguna política de INSERT/UPDATE/DELETE para `authenticated`,
-- deliberadamente: mismo patrón "sin política = denegado por defecto"
-- que platform_roles ya usa para sus propias operaciones administrativas
-- excepcionales (ver foundation RLS migration). CLAUDE.md es explícito en
-- que Superadmin no tiene auth real todavía y no debe construirse sin
-- pedirlo — por eso, a diferencia de specialties (que sí tiene políticas
-- de insert/update gateadas por is_platform_superadmin()), estas tablas
-- no exponen NINGÚN camino de escritura vía la Data API en absoluto.

-- ============================================================
-- pg_trgm — búsqueda de texto razonable sobre descripciones largas
-- (CUPS/diagnósticos) sin introducir un motor de búsqueda aparte.
-- Extensión estándar de Postgres, ya soportada por Supabase.
-- ============================================================

create extension if not exists pg_trgm;


-- ============================================================
-- rips_catalog_imports — una fila por CADA ejecución de importador que
-- efectivamente creó/actualizó una versión de un catálogo. Es el
-- registro de procedencia/versión que responde "¿de qué resolución y
-- archivo salió este código?" y "¿qué versión estaba vigente en la
-- fecha X?" — ver auditoría Sección 5.
-- ============================================================

create type public.rips_catalog_import_status as enum ('active', 'superseded', 'failed');
-- 'failed' existe para que un futuro flujo pueda registrar un intento
-- fallido sin dejarlo indistinguible de un catálogo real (hoy los
-- importadores no insertan nada si fallan — ver scripts/rips-import-lib.mjs
-- — pero el valor queda modelado para cuando un flujo asíncrono/administrado
-- necesite reportar un fallo persistido).

create table public.rips_catalog_imports (
  id uuid primary key default gen_random_uuid(),
  -- Identifica el catálogo: 'CUPS', 'CIE10', 'CIE11', o el nombre EXACTO
  -- de la tabla de referencia SISPRO ('Sexo', 'Municipio',
  -- 'RIPSTipoUsuarioVersion2', 'ZonaVersion2', 'TipoNota', ...…). Texto
  -- libre, NO un enum: el Documento Técnico 1 puede referenciar más
  -- tablas de las que esta migración enumera en su documentación — ver
  -- docs/rips-catalogs.md — y un enum obligaría a una migración de
  -- schema cada vez que aparezca una tabla de referencia nueva.
  catalog_key text not null,
  -- Etiqueta de versión tal como la identifica la fuente oficial (p.ej.
  -- '2026' para CUPS/Resolución 2706 de 2025, o 'v001-2026-06-04' para
  -- una versión del Documento Técnico 1). Texto libre y significativo
  -- para humanos, no un número correlativo interno.
  version_label text not null,
  authority text not null default 'Ministerio de Salud y Protección Social',
  source_resolution text,
  source_document text,
  source_url text,
  source_file_name text,
  -- sha256 hexadecimal del archivo fuente original, calculado por el
  -- importador antes de parsear — permite confirmar más adelante que un
  -- reimport partió exactamente del mismo archivo.
  source_checksum text,
  source_published_at date,
  valid_from date not null,
  valid_to date,
  status public.rips_catalog_import_status not null default 'active',
  row_count integer not null default 0,
  -- Quién/qué ejecutó la importación (p.ej. 'cli:rips-import-cups.mjs').
  -- Texto libre, no un profile_id: un importador corre con la
  -- service_role key, fuera de cualquier sesión de auth.uid() real.
  imported_by text not null default 'cli',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rips_catalog_imports_catalog_key_version_label_key unique (catalog_key, version_label),
  constraint rips_catalog_imports_valid_range check (valid_to is null or valid_to >= valid_from)
);
-- A lo sumo UNA versión 'active' por catálogo a la vez — la vigencia
-- histórica de versiones anteriores se conserva vía status='superseded' +
-- valid_to, nunca borrando la fila (ver auditoría Sección 18/Sección 14
-- de este prompt: "no sobrescribas historia irreversiblemente").
create unique index rips_catalog_imports_one_active_per_catalog
  on public.rips_catalog_imports (catalog_key)
  where status = 'active';

create index rips_catalog_imports_catalog_key_idx on public.rips_catalog_imports (catalog_key);

create trigger set_updated_at
  before update on public.rips_catalog_imports
  for each row execute function public.set_updated_at();

alter table public.rips_catalog_imports enable row level security;

-- Lectura: cualquier usuario autenticado puede ver de qué fuente/versión
-- salió un catálogo (información de procedencia, no un dato clínico ni
-- de negocio sensible). Sin políticas de insert/update/delete — ver nota
-- de diseño al inicio del archivo.
create policy rips_catalog_imports_select_authenticated
  on public.rips_catalog_imports for select
  to authenticated
  using (true);

grant select on public.rips_catalog_imports to authenticated;


-- ============================================================
-- cups_catalog — Clasificación Única de Procedimientos en Salud.
-- Tabla especializada (no la genérica rips_reference_values): volumen
-- (~13.640 códigos vigentes, Resolución 2706 de 2025) y necesidad de
-- búsqueda textual/por código propia justifican una tabla dedicada — ver
-- auditoría Sección 11 y este prompt, Sección 7.
-- ============================================================

create table public.cups_catalog (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.rips_catalog_imports (id) on delete restrict,
  code text not null,
  -- Denormalizado desde rips_catalog_imports.version_label — permite
  -- filtrar "códigos vigentes hoy" con un solo índice, sin join, igual
  -- que el patrón ya usado en este esquema (p.ej.
  -- professional_profiles.clinic_id denormalizado desde
  -- clinic_memberships — ver foundation schema).
  version_label text not null,
  description text not null,
  -- Tal como los provea la fuente oficial — nombres exactos del archivo
  -- CUPS a confirmar cuando se disponga de él (ver docs/rips-catalogs.md).
  chapter text,
  section text,
  category text,
  -- Clasificación RIPS consulta-vs-procedimiento — ver auditoría Sección
  -- 12 (CUPS 890304, oficialmente una consulta, apareció mal clasificado
  -- como procedimiento en el archivo de referencia de la odontóloga).
  -- Deliberadamente 'unknown' por defecto: SOLO se marca
  -- 'consultation'/'procedure' cuando el importador puede derivarlo de
  -- estructura oficial confirmada (ver rips_service_type_source), NUNCA
  -- por heurística de texto sobre la descripción — ver Sección 9 de este
  -- prompt.
  rips_service_type text not null default 'unknown'
    check (rips_service_type in ('consultation', 'procedure', 'unknown')),
  -- Documenta LA REGLA/FUENTE usada para derivar rips_service_type en
  -- esta fila cuando no es 'unknown' (p.ej. "capítulo oficial CUPS '89 —
  -- Consulta y atención', confirmado en <archivo/columna>, Resolución
  -- 2706 de 2025") — nunca vacío si rips_service_type ya no es
  -- 'unknown', para que la clasificación sea siempre trazable y
  -- auditable, nunca una afirmación sin respaldo.
  rips_service_type_source text,
  metadata jsonb not null default '{}'::jsonb,
  valid_from date not null,
  valid_to date,
  status text not null default 'active' check (status in ('active', 'superseded', 'deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cups_catalog_code_version_label_key unique (code, version_label),
  constraint cups_catalog_rips_service_type_source_required
    check (rips_service_type = 'unknown' or rips_service_type_source is not null),
  constraint cups_catalog_valid_range check (valid_to is null or valid_to >= valid_from)
);

create index cups_catalog_import_id_idx on public.cups_catalog (import_id);
create index cups_catalog_code_idx on public.cups_catalog (code);
create index cups_catalog_active_idx on public.cups_catalog (code) where status = 'active';
create index cups_catalog_description_trgm_idx
  on public.cups_catalog using gin (description gin_trgm_ops);

create trigger set_updated_at
  before update on public.cups_catalog
  for each row execute function public.set_updated_at();

alter table public.cups_catalog enable row level security;

create policy cups_catalog_select_authenticated
  on public.cups_catalog for select
  to authenticated
  using (true);

grant select on public.cups_catalog to authenticated;


-- ============================================================
-- diagnosis_catalog — diagnósticos codificados (CIE-10 hoy, CIE-11 ya
-- confirmado como campo paralelo activo en el Documento Técnico 1
-- vigente — ver auditoría Sección 6/10). `classification_system` es un
-- texto libre, no un nombre de tabla ni un enum — el propio prompt de
-- auditoría advirtió explícitamente no amarrar el diseño a "cie10" como
-- nombre eterno de columna/tabla, precisamente porque ambas
-- clasificaciones conviven hoy y una tercera podría aparecer en el
-- futuro sin requerir una migración estructural.
-- ============================================================

create table public.diagnosis_catalog (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.rips_catalog_imports (id) on delete restrict,
  -- 'CIE10' | 'CIE11' | una clasificación futura — texto libre a
  -- propósito (ver comentario de la tabla).
  classification_system text not null,
  code text not null,
  version_label text not null,
  description text not null,
  chapter text,
  category text,
  metadata jsonb not null default '{}'::jsonb,
  valid_from date not null,
  valid_to date,
  status text not null default 'active' check (status in ('active', 'superseded', 'deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diagnosis_catalog_classification_code_version_key
    unique (classification_system, code, version_label),
  constraint diagnosis_catalog_valid_range check (valid_to is null or valid_to >= valid_from)
);

create index diagnosis_catalog_import_id_idx on public.diagnosis_catalog (import_id);
create index diagnosis_catalog_classification_code_idx
  on public.diagnosis_catalog (classification_system, code);
create index diagnosis_catalog_active_idx
  on public.diagnosis_catalog (classification_system, code) where status = 'active';
create index diagnosis_catalog_description_trgm_idx
  on public.diagnosis_catalog using gin (description gin_trgm_ops);

create trigger set_updated_at
  before update on public.diagnosis_catalog
  for each row execute function public.set_updated_at();

alter table public.diagnosis_catalog enable row level security;

create policy diagnosis_catalog_select_authenticated
  on public.diagnosis_catalog for select
  to authenticated
  using (true);

grant select on public.diagnosis_catalog to authenticated;


-- ============================================================
-- rips_reference_values — catálogos pequeños del Documento Técnico 1
-- (Sexo, Pais, Municipio, ZonaVersion2, TipoIdPISIS,
-- RIPSTipoUsuarioVersion2, LstSiNo, TipoNota, GrupoServicios, Servicios,
-- RIPSFinalidadConsultaVersion2, vías de ingreso, modalidades, conceptos
-- de recaudo, causas/motivos, y cualquier otra tabla que el documento
-- oficial exija — ver auditoría Sección 6). UNA tabla genérica, no una
-- tabla por catálogo: evita crear quince tablas casi vacías para
-- catálogos de 2-20 valores cada uno (ver este prompt, Sección 7).
-- catalog_key identifica cuál de esas tablas es cada fila; se documentan
-- los valores conocidos en docs/rips-catalogs.md, pero la columna es
-- texto libre a propósito — el Documento Técnico 1 puede referenciar más
-- tablas de las identificadas hasta ahora.
-- ============================================================

create table public.rips_reference_values (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.rips_catalog_imports (id) on delete restrict,
  catalog_key text not null,
  code text not null,
  label text not null,
  -- Jerarquía oficial cuando la fuente la contiene — hoy el único caso
  -- confirmado es Municipio → Departamento (ver auditoría Sección 10).
  -- Deliberadamente SIN foreign key hacia otra fila de esta misma tabla:
  -- no se confirmó todavía la forma exacta en que SISPRO publica el
  -- catálogo de Departamento por separado (¿catalog_key propio, o
  -- columna embebida en el archivo de Municipio?) — ver
  -- docs/rips-catalogs.md. Queda como texto plano hasta confirmarlo con
  -- el archivo oficial real, en vez de inventar una relación que
  -- después haya que deshacer.
  parent_code text,
  version_label text not null,
  metadata jsonb not null default '{}'::jsonb,
  valid_from date not null,
  valid_to date,
  status text not null default 'active' check (status in ('active', 'superseded', 'deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rips_reference_values_catalog_code_version_key
    unique (catalog_key, code, version_label),
  constraint rips_reference_values_valid_range check (valid_to is null or valid_to >= valid_from)
);

create index rips_reference_values_import_id_idx on public.rips_reference_values (import_id);
create index rips_reference_values_catalog_key_code_idx
  on public.rips_reference_values (catalog_key, code);
create index rips_reference_values_catalog_key_active_idx
  on public.rips_reference_values (catalog_key, code) where status = 'active';
create index rips_reference_values_parent_code_idx
  on public.rips_reference_values (catalog_key, parent_code)
  where parent_code is not null;

create trigger set_updated_at
  before update on public.rips_reference_values
  for each row execute function public.set_updated_at();

alter table public.rips_reference_values enable row level security;

create policy rips_reference_values_select_authenticated
  on public.rips_reference_values for select
  to authenticated
  using (true);

grant select on public.rips_reference_values to authenticated;


-- ============================================================
-- Funciones de importación — el ÚNICO camino de escritura para estas
-- cuatro tablas. `security invoker` (no `definer`): el llamador real es
-- siempre la service_role key desde un script de importación (ver
-- scripts/rips-import-*.mjs), que ya tiene privilegios completos de
-- postgres/service_role — no hay ninguna escalada de privilegio que
-- resolver aquí, a diferencia de p.ej. upsert_patient_clinical_encounter
-- (que sí necesita `definer` porque un `authenticated` normal no tiene
-- privilegio de escritura directo sobre esa tabla). Sin GRANT EXECUTE a
-- `authenticated` en absoluto: estas funciones nunca deben ser
-- invocables desde la Data API por un usuario normal — ver Sección 21 de
-- este prompt ("SECURITY INVOKER por defecto; DEFINER solo si realmente
-- es necesario").
--
-- Cada función:
--   1. valida version_label/valid_from/p_rows;
--   2. detecta códigos duplicados DENTRO del payload y aborta si los hay
--      (nunca deja una importación parcial — todo corre en una sola
--      transacción implícita de PL/pgSQL: cualquier excepción revierte
--      TODO lo que la función llevaba hecho, incluida la fila de
--      rips_catalog_imports);
--   3. si el catálogo ya tenía otra versión 'active', la marca
--      'superseded' (a ella y a sus filas hijas) ANTES de insertar la
--      nueva como 'active' — evita una violación transitoria del índice
--      único parcial "una activa por catálogo";
--   4. hace upsert idempotente por (code, version_label) — reimportar el
--      MISMO archivo/versión dos veces dej a la base en el mismo estado
--      (ver Sección 13 de este prompt);
--   5. devuelve un resumen (inserted/updated/total) para que el script
--      de Node lo imprima.
-- ============================================================

create function public.import_rips_cups_catalog(
  p_version_label text,
  p_valid_from date,
  p_rows jsonb,
  p_valid_to date default null,
  p_authority text default 'Ministerio de Salud y Protección Social',
  p_source_resolution text default null,
  p_source_document text default null,
  p_source_url text default null,
  p_source_file_name text default null,
  p_source_checksum text default null,
  p_source_published_at date default null,
  p_imported_by text default 'cli',
  p_notes text default null
)
returns table (import_id uuid, inserted_count integer, updated_count integer, total_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import_id uuid;
  v_dupes text;
  v_row_count integer;
  v_inserted integer;
  v_updated integer;
begin
  if p_version_label is null or btrim(p_version_label) = '' then
    raise exception 'p_version_label must not be empty';
  end if;
  if p_valid_from is null then
    raise exception 'p_valid_from must not be null';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'p_rows must be a non-empty JSON array';
  end if;

  -- Cada elemento debe traer al menos code y description.
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where coalesce(r ->> 'code', '') = '' or coalesce(r ->> 'description', '') = ''
  ) then
    raise exception 'every row must have a non-empty code and description';
  end if;

  select string_agg(distinct code, ', ') into v_dupes
  from (
    select r ->> 'code' as code
    from jsonb_array_elements(p_rows) r
    group by r ->> 'code'
    having count(*) > 1
  ) d;
  if v_dupes is not null then
    raise exception 'duplicate codes found in import payload: %', v_dupes;
  end if;

  v_row_count := jsonb_array_length(p_rows);

  -- Paso 3: cerrar cualquier OTRA versión activa de este catálogo antes
  -- de activar la nueva (o de re-confirmar la misma), para no violar
  -- transitoriamente el índice único parcial "una activa por catálogo".
  update public.rips_catalog_imports
  set status = 'superseded',
      valid_to = coalesce(valid_to, p_valid_from - 1)
  where catalog_key = 'CUPS'
    and version_label <> p_version_label
    and status = 'active';

  update public.cups_catalog
  set status = 'superseded',
      valid_to = coalesce(valid_to, p_valid_from - 1)
  where version_label <> p_version_label
    and status = 'active';

  insert into public.rips_catalog_imports (
    catalog_key, version_label, authority, source_resolution, source_document,
    source_url, source_file_name, source_checksum, source_published_at,
    valid_from, valid_to, status, row_count, imported_by, notes
  ) values (
    'CUPS', p_version_label, p_authority, p_source_resolution, p_source_document,
    p_source_url, p_source_file_name, p_source_checksum, p_source_published_at,
    p_valid_from, p_valid_to, 'active', v_row_count, p_imported_by, p_notes
  )
  on conflict (catalog_key, version_label) do update set
    authority = excluded.authority,
    source_resolution = excluded.source_resolution,
    source_document = excluded.source_document,
    source_url = excluded.source_url,
    source_file_name = excluded.source_file_name,
    source_checksum = excluded.source_checksum,
    source_published_at = excluded.source_published_at,
    valid_from = excluded.valid_from,
    valid_to = excluded.valid_to,
    status = 'active',
    row_count = excluded.row_count,
    imported_by = excluded.imported_by,
    notes = excluded.notes
  returning id into v_import_id;

  with upserted as (
    insert into public.cups_catalog (
      import_id, code, version_label, description, chapter, section, category,
      rips_service_type, rips_service_type_source, metadata, valid_from, valid_to, status
    )
    select
      v_import_id,
      r ->> 'code',
      p_version_label,
      r ->> 'description',
      r ->> 'chapter',
      r ->> 'section',
      r ->> 'category',
      coalesce(r ->> 'rips_service_type', 'unknown'),
      r ->> 'rips_service_type_source',
      coalesce(r -> 'metadata', '{}'::jsonb),
      p_valid_from,
      p_valid_to,
      'active'
    from jsonb_array_elements(p_rows) r
    on conflict (code, version_label) do update set
      import_id = excluded.import_id,
      description = excluded.description,
      chapter = excluded.chapter,
      section = excluded.section,
      category = excluded.category,
      rips_service_type = excluded.rips_service_type,
      rips_service_type_source = excluded.rips_service_type_source,
      metadata = excluded.metadata,
      valid_from = excluded.valid_from,
      valid_to = excluded.valid_to,
      status = 'active'
    returning (xmax = 0) as is_insert
  )
  select
    count(*) filter (where is_insert),
    count(*) filter (where not is_insert)
  into v_inserted, v_updated
  from upserted;

  return query select v_import_id, v_inserted, v_updated, v_row_count;
end;
$$;

revoke execute on function public.import_rips_cups_catalog(
  text, date, jsonb, date, text, text, text, text, text, text, date, text, text
) from public;
-- EXECUTE explícito a `service_role` — nunca asumido. `service_role` es
-- miembro implícito de PUBLIC igual que cualquier otro rol, así que el
-- revoke de arriba también le habría quitado el privilegio que recibía
-- por defecto al crear la función; este grant se lo restituye de forma
-- explícita y auditable, sin depender de qué privilegios por defecto
-- tenga configurados un proyecto Supabase en particular. Sin grant a
-- `authenticated`/`anon`: solo invocable con la service_role key, desde
-- el importador.
grant execute on function public.import_rips_cups_catalog(
  text, date, jsonb, date, text, text, text, text, text, text, date, text, text
) to service_role;


create function public.import_rips_diagnosis_catalog(
  p_classification_system text,
  p_version_label text,
  p_valid_from date,
  p_rows jsonb,
  p_valid_to date default null,
  p_authority text default 'Ministerio de Salud y Protección Social',
  p_source_resolution text default null,
  p_source_document text default null,
  p_source_url text default null,
  p_source_file_name text default null,
  p_source_checksum text default null,
  p_source_published_at date default null,
  p_imported_by text default 'cli',
  p_notes text default null
)
returns table (import_id uuid, inserted_count integer, updated_count integer, total_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_catalog_key text;
  v_import_id uuid;
  v_dupes text;
  v_row_count integer;
  v_inserted integer;
  v_updated integer;
begin
  if p_classification_system is null or btrim(p_classification_system) = '' then
    raise exception 'p_classification_system must not be empty';
  end if;
  if p_version_label is null or btrim(p_version_label) = '' then
    raise exception 'p_version_label must not be empty';
  end if;
  if p_valid_from is null then
    raise exception 'p_valid_from must not be null';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'p_rows must be a non-empty JSON array';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where coalesce(r ->> 'code', '') = '' or coalesce(r ->> 'description', '') = ''
  ) then
    raise exception 'every row must have a non-empty code and description';
  end if;

  select string_agg(distinct code, ', ') into v_dupes
  from (
    select r ->> 'code' as code
    from jsonb_array_elements(p_rows) r
    group by r ->> 'code'
    having count(*) > 1
  ) d;
  if v_dupes is not null then
    raise exception 'duplicate codes found in import payload: %', v_dupes;
  end if;

  -- catalog_key en rips_catalog_imports namespacea por clasificación
  -- (p.ej. 'CIE10', 'CIE11') — cada una versiona de forma independiente,
  -- coherente con que conviven simultáneamente en el Documento Técnico 1
  -- vigente, no una reemplaza a la otra.
  v_catalog_key := p_classification_system;
  v_row_count := jsonb_array_length(p_rows);

  update public.rips_catalog_imports
  set status = 'superseded',
      valid_to = coalesce(valid_to, p_valid_from - 1)
  where catalog_key = v_catalog_key
    and version_label <> p_version_label
    and status = 'active';

  update public.diagnosis_catalog
  set status = 'superseded',
      valid_to = coalesce(valid_to, p_valid_from - 1)
  where classification_system = p_classification_system
    and version_label <> p_version_label
    and status = 'active';

  insert into public.rips_catalog_imports (
    catalog_key, version_label, authority, source_resolution, source_document,
    source_url, source_file_name, source_checksum, source_published_at,
    valid_from, valid_to, status, row_count, imported_by, notes
  ) values (
    v_catalog_key, p_version_label, p_authority, p_source_resolution, p_source_document,
    p_source_url, p_source_file_name, p_source_checksum, p_source_published_at,
    p_valid_from, p_valid_to, 'active', v_row_count, p_imported_by, p_notes
  )
  on conflict (catalog_key, version_label) do update set
    authority = excluded.authority,
    source_resolution = excluded.source_resolution,
    source_document = excluded.source_document,
    source_url = excluded.source_url,
    source_file_name = excluded.source_file_name,
    source_checksum = excluded.source_checksum,
    source_published_at = excluded.source_published_at,
    valid_from = excluded.valid_from,
    valid_to = excluded.valid_to,
    status = 'active',
    row_count = excluded.row_count,
    imported_by = excluded.imported_by,
    notes = excluded.notes
  returning id into v_import_id;

  with upserted as (
    insert into public.diagnosis_catalog (
      import_id, classification_system, code, version_label, description, chapter, category,
      metadata, valid_from, valid_to, status
    )
    select
      v_import_id,
      p_classification_system,
      r ->> 'code',
      p_version_label,
      r ->> 'description',
      r ->> 'chapter',
      r ->> 'category',
      coalesce(r -> 'metadata', '{}'::jsonb),
      p_valid_from,
      p_valid_to,
      'active'
    from jsonb_array_elements(p_rows) r
    on conflict (classification_system, code, version_label) do update set
      import_id = excluded.import_id,
      description = excluded.description,
      chapter = excluded.chapter,
      category = excluded.category,
      metadata = excluded.metadata,
      valid_from = excluded.valid_from,
      valid_to = excluded.valid_to,
      status = 'active'
    returning (xmax = 0) as is_insert
  )
  select
    count(*) filter (where is_insert),
    count(*) filter (where not is_insert)
  into v_inserted, v_updated
  from upserted;

  return query select v_import_id, v_inserted, v_updated, v_row_count;
end;
$$;

revoke execute on function public.import_rips_diagnosis_catalog(
  text, text, date, jsonb, date, text, text, text, text, text, text, date, text, text
) from public;
grant execute on function public.import_rips_diagnosis_catalog(
  text, text, date, jsonb, date, text, text, text, text, text, text, date, text, text
) to service_role;


create function public.import_rips_reference_values(
  p_catalog_key text,
  p_version_label text,
  p_valid_from date,
  p_rows jsonb,
  p_valid_to date default null,
  p_authority text default 'Ministerio de Salud y Protección Social',
  p_source_resolution text default null,
  p_source_document text default null,
  p_source_url text default null,
  p_source_file_name text default null,
  p_source_checksum text default null,
  p_source_published_at date default null,
  p_imported_by text default 'cli',
  p_notes text default null
)
returns table (import_id uuid, inserted_count integer, updated_count integer, total_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import_id uuid;
  v_dupes text;
  v_row_count integer;
  v_inserted integer;
  v_updated integer;
begin
  if p_catalog_key is null or btrim(p_catalog_key) = '' then
    raise exception 'p_catalog_key must not be empty';
  end if;
  if p_version_label is null or btrim(p_version_label) = '' then
    raise exception 'p_version_label must not be empty';
  end if;
  if p_valid_from is null then
    raise exception 'p_valid_from must not be null';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'p_rows must be a non-empty JSON array';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where coalesce(r ->> 'code', '') = '' or coalesce(r ->> 'label', '') = ''
  ) then
    raise exception 'every row must have a non-empty code and label';
  end if;

  select string_agg(distinct code, ', ') into v_dupes
  from (
    select r ->> 'code' as code
    from jsonb_array_elements(p_rows) r
    group by r ->> 'code'
    having count(*) > 1
  ) d;
  if v_dupes is not null then
    raise exception 'duplicate codes found in import payload: %', v_dupes;
  end if;

  v_row_count := jsonb_array_length(p_rows);

  update public.rips_catalog_imports
  set status = 'superseded',
      valid_to = coalesce(valid_to, p_valid_from - 1)
  where catalog_key = p_catalog_key
    and version_label <> p_version_label
    and status = 'active';

  update public.rips_reference_values
  set status = 'superseded',
      valid_to = coalesce(valid_to, p_valid_from - 1)
  where catalog_key = p_catalog_key
    and version_label <> p_version_label
    and status = 'active';

  insert into public.rips_catalog_imports (
    catalog_key, version_label, authority, source_resolution, source_document,
    source_url, source_file_name, source_checksum, source_published_at,
    valid_from, valid_to, status, row_count, imported_by, notes
  ) values (
    p_catalog_key, p_version_label, p_authority, p_source_resolution, p_source_document,
    p_source_url, p_source_file_name, p_source_checksum, p_source_published_at,
    p_valid_from, p_valid_to, 'active', v_row_count, p_imported_by, p_notes
  )
  on conflict (catalog_key, version_label) do update set
    authority = excluded.authority,
    source_resolution = excluded.source_resolution,
    source_document = excluded.source_document,
    source_url = excluded.source_url,
    source_file_name = excluded.source_file_name,
    source_checksum = excluded.source_checksum,
    source_published_at = excluded.source_published_at,
    valid_from = excluded.valid_from,
    valid_to = excluded.valid_to,
    status = 'active',
    row_count = excluded.row_count,
    imported_by = excluded.imported_by,
    notes = excluded.notes
  returning id into v_import_id;

  with upserted as (
    insert into public.rips_reference_values (
      import_id, catalog_key, code, label, parent_code, version_label, metadata,
      valid_from, valid_to, status
    )
    select
      v_import_id,
      p_catalog_key,
      r ->> 'code',
      r ->> 'label',
      r ->> 'parent_code',
      p_version_label,
      coalesce(r -> 'metadata', '{}'::jsonb),
      p_valid_from,
      p_valid_to,
      'active'
    from jsonb_array_elements(p_rows) r
    on conflict (catalog_key, code, version_label) do update set
      import_id = excluded.import_id,
      label = excluded.label,
      parent_code = excluded.parent_code,
      metadata = excluded.metadata,
      valid_from = excluded.valid_from,
      valid_to = excluded.valid_to,
      status = 'active'
    returning (xmax = 0) as is_insert
  )
  select
    count(*) filter (where is_insert),
    count(*) filter (where not is_insert)
  into v_inserted, v_updated
  from upserted;

  return query select v_import_id, v_inserted, v_updated, v_row_count;
end;
$$;

revoke execute on function public.import_rips_reference_values(
  text, text, date, jsonb, date, text, text, text, text, text, text, date, text, text
) from public;
grant execute on function public.import_rips_reference_values(
  text, text, date, jsonb, date, text, text, text, text, text, text, date, text, text
) to service_role;

-- NOTA (revisión RIPS 02A): una versión anterior de esta migración se
-- apoyaba en los privilegios por defecto que Supabase asigna a
-- `service_role`, sin un GRANT EXECUTE explícito — un supuesto razonable
-- pero no verificado en vivo. Las tres funciones de arriba ahora otorgan
-- EXECUTE a `service_role` explícitamente, eliminando esa dependencia de
-- un comportamiento por defecto no confirmado en esta sesión (sin
-- Docker/psql/proyecto Supabase real disponibles — ver el reporte de
-- revisión RIPS 02A).
