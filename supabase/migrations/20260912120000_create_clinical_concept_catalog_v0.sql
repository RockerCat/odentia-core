-- Odentia Core — Fase A1 del modelo clínico odontológico V0:
-- Concepto odontológico natural → Variante clínica → Mapping CUPS.
--
-- Alcance ESTRICTO de esta migración: crea únicamente la capa de
-- catálogo/dominio reutilizable en fases futuras. NO toca
-- encounter_services/encounter_diagnoses/patient_clinical_encounter_procedures/
-- patient_clinical_encounters/treatments/appointments, no introduce UI, no
-- cambia readiness ni el generador RIPS, y no crea "Especialidad → Servicio
-- RIPS" (eso queda para una fase posterior explícita). Cero cambio visible
-- para cualquier usuario real hoy — solo datos de dominio nuevos, vacíos de
-- consumidores todavía.
--
-- Decisión arquitectónica ya cerrada (ver el diseño previo de esta sesión):
-- encounter_services seguirá siendo, en fases posteriores, la ÚNICA
-- instancia real de "qué se realizó" — esta migración NO crea una tabla
-- "performed_concepts" ni ninguna otra instancia paralela. Solo catálogo.
--
-- Convenciones reutilizadas tal cual del resto del esquema RIPS
-- (cups_catalog/rips_reference_values, ver 20260910090000): id uuid,
-- status text con CHECK ('active'/'superseded'/'deprecated'),
-- valid_from/valid_to date, trigger set_updated_at ya existente, RLS
-- habilitado con SOLO una policy de SELECT para `authenticated` — sin
-- ninguna policy de INSERT/UPDATE/DELETE (deny-by-default, mismo patrón
-- que cups_catalog/diagnosis_catalog/rips_reference_values): este es un
-- catálogo global de Odentia, nunca editable desde un clinic_admin ni
-- desde el cliente — solo mediante una migración futura o un proceso
-- administrado con service_role.
--
-- rips_service_type NUNCA se duplica aquí: clinical_cups_mappings
-- referencia cups_catalog_id (una fila concreta y versionada del
-- catálogo oficial) y cualquier consumidor futuro lee
-- cups_catalog.rips_service_type mediante join — un solo origen de
-- verdad, nunca un segundo campo que pueda desincronizarse (el caso
-- 893106 de este mismo prompt, clasificado 'procedure' mientras 890322
-- es 'consultation' para el MISMO concepto padre "Control de
-- ortodoncia", es exactamente el escenario que esto previene: el tipo
-- vive en el mapping/CUPS, nunca se asume constante por concepto).
--
-- Nota de seguridad operativa: la auditoría de catálogo de esta sesión
-- encontró que `service_role` no tenía GRANT explícito sobre
-- public.specialties en este proyecto (permission denied 42501) pese a
-- que service_role normalmente bypassa RLS — por eso aquí se otorga
-- SELECT explícito también a service_role en las tres tablas nuevas,
-- además de a `authenticated`, en vez de asumir que el privilegio ya
-- existe implícitamente.

-- ============================================================
-- clinical_concepts — el catálogo cerrado de conceptos odontológicos
-- naturales (V0: exactamente los 8 de este prompt). `requires_specialty`
-- documenta que este concepto solo puede resolver un CUPS cuando se
-- conoce la especialidad del profesional (hoy: únicamente
-- "Consulta de especialidad") — es metadata descriptiva, no una regla
-- validada por constraint (validarla cruzando con clinical_cups_mappings
-- requeriría un trigger; se deja fuera deliberadamente en esta fase,
-- "no sobrediseñar" — la ausencia de mapping ya es, por diseño, un
-- estado válido "unresolved", nunca un error de integridad).
-- ============================================================

create table public.clinical_concepts (
  id uuid primary key default gen_random_uuid(),
  -- Identificador estable para código — el nombre visible (name) puede
  -- cambiar sin romper ningún mapping ni ninguna referencia futura desde
  -- encounter_services.
  slug text not null,
  name text not null,
  requires_specialty boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_concepts_slug_key unique (slug)
);

create trigger set_updated_at
  before update on public.clinical_concepts
  for each row execute function public.set_updated_at();

alter table public.clinical_concepts enable row level security;

create policy clinical_concepts_select_authenticated
  on public.clinical_concepts for select
  to authenticated
  using (true);

grant select on public.clinical_concepts to authenticated;
grant select on public.clinical_concepts to service_role;

-- ============================================================
-- clinical_concept_variants — solo existen cuando una diferencia clínica
-- real cambia el mapping regulatorio (ver auditoría: Extracción dental y
-- Tratamiento de conductos NO tienen variantes todavía porque sus
-- variantes reales dependen de hechos capturados en la atención —
-- dentición/técnica/inclusión/nº de raíces — que se modelarán en
-- encounter_services en una fase posterior, nunca aquí como catálogo
-- genérico).
--
-- `(id, concept_id)` UNIQUE existe únicamente para poder ser el destino
-- de la FK compuesta de clinical_cups_mappings de abajo (garantiza en la
-- base de datos que una variante nunca se asocie a un mapping de un
-- concepto distinto al suyo, sin necesitar un trigger).
-- ============================================================

create table public.clinical_concept_variants (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.clinical_concepts (id) on delete restrict,
  slug text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_concept_variants_concept_id_slug_key unique (concept_id, slug),
  constraint clinical_concept_variants_id_concept_id_key unique (id, concept_id)
);

create index clinical_concept_variants_concept_id_idx on public.clinical_concept_variants (concept_id);

create trigger set_updated_at
  before update on public.clinical_concept_variants
  for each row execute function public.set_updated_at();

alter table public.clinical_concept_variants enable row level security;

create policy clinical_concept_variants_select_authenticated
  on public.clinical_concept_variants for select
  to authenticated
  using (true);

grant select on public.clinical_concept_variants to authenticated;
grant select on public.clinical_concept_variants to service_role;

-- ============================================================
-- clinical_cups_mappings — (concepto [+ variante opcional] [+
-- especialidad opcional]) → una fila concreta y versionada de
-- cups_catalog. Nunca un CUPS de texto libre: cups_catalog_id es una FK
-- real, y solo puede apuntar a un código que YA existe en el catálogo
-- oficial importado — es estructuralmente imposible insertar aquí un
-- CUPS inventado.
--
-- Versionamiento: valid_from/valid_to/status siguen exactamente el
-- mismo patrón que cups_catalog/rips_reference_values. Un mapping nunca
-- se sobreescribe — cuando cambie (p. ej. el CUPS oficial se supersede),
-- la fila vieja pasa a status='superseded' (con su valid_to) y se
-- inserta una fila nueva 'active'; ninguna atención ya registrada se ve
-- afectada porque encounter_services (en la fase que la extienda)
-- guardará su propio snapshot, nunca una referencia viva reevaluada.
--
-- El índice único parcial de abajo impide dos mappings ACTIVOS
-- simultáneos para la misma combinación (concepto, variante-o-ninguna,
-- especialidad-o-ninguna) — usa un centinela vía coalesce() porque NULL
-- <> NULL en un UNIQUE normal de Postgres. No se modela solapamiento de
-- rangos de vigencia más allá de esto (deliberado — "no sobrediseñar
-- temporal overlap": con datos curados a mano y de baja frecuencia de
-- cambio, un mapping activo único por combinación ya cubre el caso real
-- que puede ocurrir).
-- ============================================================

create table public.clinical_cups_mappings (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.clinical_concepts (id) on delete restrict,
  variant_id uuid references public.clinical_concept_variants (id) on delete restrict,
  specialty_id uuid references public.specialties (id) on delete restrict,
  cups_catalog_id uuid not null references public.cups_catalog (id) on delete restrict,
  valid_from date not null default current_date,
  valid_to date,
  status text not null default 'active' check (status in ('active', 'superseded', 'deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Garantiza en la base de datos que variant_id, cuando no es null,
  -- pertenece realmente a concept_id — MATCH SIMPLE (el default de
  -- Postgres) omite la verificación por completo cuando variant_id es
  -- null, que es exactamente el caso de un mapping directo concepto→CUPS
  -- sin variante.
  constraint clinical_cups_mappings_variant_concept_fk
    foreign key (variant_id, concept_id) references public.clinical_concept_variants (id, concept_id),
  constraint clinical_cups_mappings_valid_range check (valid_to is null or valid_to >= valid_from)
);

create index clinical_cups_mappings_concept_id_idx on public.clinical_cups_mappings (concept_id);
create index clinical_cups_mappings_variant_id_idx on public.clinical_cups_mappings (variant_id) where variant_id is not null;
create index clinical_cups_mappings_specialty_id_idx on public.clinical_cups_mappings (specialty_id) where specialty_id is not null;
create index clinical_cups_mappings_cups_catalog_id_idx on public.clinical_cups_mappings (cups_catalog_id);

create unique index clinical_cups_mappings_active_unique_idx
  on public.clinical_cups_mappings (
    concept_id,
    coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(specialty_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'active';

create trigger set_updated_at
  before update on public.clinical_cups_mappings
  for each row execute function public.set_updated_at();

alter table public.clinical_cups_mappings enable row level security;

create policy clinical_cups_mappings_select_authenticated
  on public.clinical_cups_mappings for select
  to authenticated
  using (true);

grant select on public.clinical_cups_mappings to authenticated;
grant select on public.clinical_cups_mappings to service_role;

-- ============================================================
-- Seed V0 — exactamente los 8 conceptos de este prompt. "Chequeo
-- general" NO se crea (decisión ya cerrada: converge en Primera
-- consulta/Control de "Consulta de odontología general").
-- ============================================================

insert into public.clinical_concepts (slug, name, requires_specialty)
select v.slug, v.name, v.requires_specialty
from (
  values
    ('general_consultation', 'Consulta de odontología general', false),
    ('specialty_consultation', 'Consulta de especialidad', true),
    ('dental_cleaning', 'Limpieza dental', false),
    ('teeth_whitening', 'Blanqueamiento dental', false),
    ('tooth_extraction', 'Extracción dental', false),
    ('root_canal', 'Tratamiento de conductos', false),
    ('orthodontic_consultation', 'Consulta de ortodoncia', false),
    ('orthodontic_followup', 'Control de ortodoncia', false)
) as v (slug, name, requires_specialty)
on conflict (slug) do nothing;

-- Variantes V0 — únicamente donde la auditoría de catálogo demostró que
-- cambian el mapping. tooth_extraction/root_canal quedan sin variantes
-- por instrucción explícita (sus variantes reales dependen de hechos
-- clínicos que aún no existen como columnas — fase posterior).
insert into public.clinical_concept_variants (concept_id, slug, name)
select c.id, v.variant_slug, v.variant_name
from public.clinical_concepts c
join (
  values
    ('general_consultation', 'first_visit', 'Primera vez'),
    ('general_consultation', 'follow_up', 'Control'),
    ('specialty_consultation', 'first_visit', 'Primera vez'),
    ('specialty_consultation', 'follow_up', 'Control'),
    ('dental_cleaning', 'prophylaxis', 'Profilaxis / pulido'),
    ('dental_cleaning', 'supragingival_scaling', 'Detartraje supragingival'),
    ('dental_cleaning', 'subgingival_scaling', 'Detartraje subgingival'),
    ('teeth_whitening', 'extrinsic', 'Extrínseco'),
    ('orthodontic_followup', 'assessment_only', 'Solo valoración'),
    ('orthodontic_followup', 'appliance_adjustment', 'Ajuste de aparatología')
) as v (concept_slug, variant_slug, variant_name) on v.concept_slug = c.slug
on conflict (concept_id, slug) do nothing;

-- Mappings CUPS confirmados por la auditoría de catálogo (ningún código
-- aquí fue inventado — todos verificados en vivo contra cups_catalog
-- antes de escribir esta migración).
--
-- Fail-fast deliberado: un LEFT JOIN hacia clinical_concept_variants o
-- specialties, seguido de insertar directamente el id resultante, dejaría
-- que un typo en variant_slug/specialty_name (o una fila realmente
-- faltante) se convierta silenciosamente en NULL — y como ambas columnas
-- son nullable, eso produciría un mapping SEMÁNTICAMENTE INCORRECTO pero
-- perfectamente válido para la base de datos (ej.: specialty_consultation
-- + Primera vez sin especialidad → apuntando al CUPS de Endodoncia). Este
-- bloque PL/pgSQL anónimo (DO — no crea función ni trigger permanente,
-- se ejecuta una sola vez durante esta migración y no deja rastro en el
-- catálogo) resuelve cada referencia explícitamente y aborta la
-- migración completa (RAISE EXCEPTION revierte la transacción) si:
--   - concept_slug no existe;
--   - variant_slug no es NULL pero esa variante no existe para ese
--     concepto exacto;
--   - specialty_name no es NULL pero esa especialidad no existe;
--   - cups_code no tiene ninguna fila 'active' en cups_catalog, o tiene
--     más de una (ambigüedad) — usando SELECT ... INTO STRICT, que sí
--     detecta ambigüedad (a diferencia de SELECT ... INTO simple), ya
--     que cups_catalog solo garantiza unicidad por (code, version_label),
--     nunca por code a solas.
-- variant_id/specialty_id solo se guardan NULL cuando el propio input
-- (variant_slug/specialty_name) ya era NULL — nunca como resultado de una
-- búsqueda fallida.
do $$
declare
  m record;
  v_concept_id uuid;
  v_variant_id uuid;
  v_specialty_id uuid;
  v_cups_catalog_id uuid;
begin
  for m in
    select * from (
      values
        -- Consulta de odontología general
        ('general_consultation', 'first_visit', null::text, '890203'),
        ('general_consultation', 'follow_up', null::text, '890303'),
        -- Consulta de especialidad — solo las 4 especialidades
        -- confirmadas por la auditoría (Endodoncia, Odontopediatría,
        -- Periodoncia, Ortodoncia). NO se crea mapping para el resto de
        -- specialties (Rehabilitación oral, Cirugía oral y maxilofacial,
        -- Implantología, Estética dental) — quedan "unresolved" por
        -- diseño hasta que una fase futura los confirme.
        ('specialty_consultation', 'first_visit', 'Endodoncia', '890218'),
        ('specialty_consultation', 'follow_up', 'Endodoncia', '890318'),
        ('specialty_consultation', 'first_visit', 'Odontopediatría', '890220'),
        ('specialty_consultation', 'follow_up', 'Odontopediatría', '890320'),
        ('specialty_consultation', 'first_visit', 'Periodoncia', '890221'),
        ('specialty_consultation', 'follow_up', 'Periodoncia', '890321'),
        ('specialty_consultation', 'first_visit', 'Ortodoncia', '890222'),
        ('specialty_consultation', 'follow_up', 'Ortodoncia', '890322'),
        -- Limpieza dental
        ('dental_cleaning', 'prophylaxis', null::text, '997001'),
        ('dental_cleaning', 'supragingival_scaling', null::text, '997301'),
        ('dental_cleaning', 'subgingival_scaling', null::text, '240201'),
        -- Blanqueamiento dental (solo extrínseco en V0 — el intrínseco
        -- por causa endodóntica, 237901, queda fuera de la ruta feliz
        -- inicial por instrucción explícita)
        ('teeth_whitening', 'extrinsic', null::text, '237903'),
        -- Ortodoncia como concepto propio (distinto de "Consulta de
        -- especialidad" — Ortodoncia ya tenía sus dos conceptos
        -- dedicados en el catálogo V0 original, ambos mapeos coexisten
        -- intencionalmente)
        ('orthodontic_consultation', null::text, null::text, '890222'),
        ('orthodontic_followup', 'assessment_only', null::text, '890322'),
        ('orthodontic_followup', 'appliance_adjustment', null::text, '893106')
    ) as t (concept_slug, variant_slug, specialty_name, cups_code)
  loop
    select c.id into v_concept_id
    from public.clinical_concepts c
    where c.slug = m.concept_slug;

    if v_concept_id is null then
      raise exception 'clinical_cups_mappings seed: concept_slug "%" does not exist', m.concept_slug;
    end if;

    if m.variant_slug is null then
      v_variant_id := null;
    else
      select v.id into v_variant_id
      from public.clinical_concept_variants v
      where v.concept_id = v_concept_id and v.slug = m.variant_slug;

      if v_variant_id is null then
        raise exception 'clinical_cups_mappings seed: variant_slug "%" does not exist for concept "%"', m.variant_slug, m.concept_slug;
      end if;
    end if;

    if m.specialty_name is null then
      v_specialty_id := null;
    else
      select s.id into v_specialty_id
      from public.specialties s
      where s.name = m.specialty_name;

      if v_specialty_id is null then
        raise exception 'clinical_cups_mappings seed: specialty_name "%" does not exist', m.specialty_name;
      end if;
    end if;

    begin
      select cc.id into strict v_cups_catalog_id
      from public.cups_catalog cc
      where cc.code = m.cups_code and cc.status = 'active';
    exception
      when no_data_found then
        raise exception 'clinical_cups_mappings seed: cups code "%" has no active row in cups_catalog', m.cups_code;
      when too_many_rows then
        raise exception 'clinical_cups_mappings seed: cups code "%" matches more than one active row in cups_catalog', m.cups_code;
    end;

    insert into public.clinical_cups_mappings (concept_id, variant_id, specialty_id, cups_catalog_id)
    select v_concept_id, v_variant_id, v_specialty_id, v_cups_catalog_id
    where not exists (
      select 1 from public.clinical_cups_mappings existing
      where existing.concept_id = v_concept_id
        and existing.variant_id is not distinct from v_variant_id
        and existing.specialty_id is not distinct from v_specialty_id
        and existing.status = 'active'
    );
  end loop;
end;
$$;
