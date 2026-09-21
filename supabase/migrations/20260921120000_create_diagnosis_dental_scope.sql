-- Odentia Core — versioned, auditable replacement for the hardcoded
-- `{Z012} ∪ K00–K14` dental-priority range that lived in
-- catalog-data.ts's own isInDentalPriorityScope()/searchDiagnoses()
-- (Prompt Ninja "priorizar Z012 + K00–K14 en selector odontológico").
--
-- ONE thing only: which CIE-10 codes Odentia's own CIE-10 selector
-- prioritizes for dental search/navigation UX. This is NEVER:
--   - the only valid diagnoses in dentistry (the full catalog stays one
--     click/search away at all times — see "Todos los diagnósticos" and
--     the general/unrestricted searchDiagnosesAction, both untouched);
--   - a RIPS rule (export-readiness.ts/export-schema.ts never reference
--     this table, and never will — RIPS validates codDiagnosticoPrincipal
--     against diagnosis_catalog directly, exactly as before);
--   - a clinical recommendation;
--   - an automatic diagnosis of any kind.
-- `source` on every row says so explicitly ("Odentia dental search
-- scope" — never "Ministerio de Salud" or any official-sounding
-- provenance), so a future reader can never mistake this for an official
-- exhaustive list the way the hardcoded range's own comments already had
-- to repeatedly warn against.
--
-- No FK to diagnosis_catalog.id: that table's real key is
-- (classification_system, code, version_label) — the SAME code
-- legitimately appears in multiple rows across catalog versions/imports
-- (diagnosis_catalog_classification_code_version_key) — so a scope
-- classification is inherently about the CODE, not one specific
-- versioned row, same reasoning rips_reference_values already uses for
-- its own catalog_key/code pair (no FK into the versioned tables either).
-- Tenant-independent, same as diagnosis_catalog/cups_catalog/
-- rips_reference_values themselves: this is global reference data, never
-- clinic-scoped.
create table public.diagnosis_dental_scope (
  id uuid primary key default gen_random_uuid(),
  -- Free text, same convention as diagnosis_catalog.classification_system
  -- (never a hardcoded "CIE10" enum/table name — a future CIE-11 dental
  -- scope could reuse this same table without a structural migration).
  classification_system text not null default 'CIE10',
  code text not null,
  -- Explicit, human-readable provenance — never left implicit. Every row
  -- seeded by this migration carries the SAME value below, so a future
  -- reader (or a future, separately-provenanced addition, e.g. a real
  -- territorial catalog once one has a concrete, citable source) can
  -- always tell which batch/authority a given code's inclusion actually
  -- traces back to.
  source text not null,
  version_label text not null,
  status text not null default 'active' check (status in ('active', 'superseded', 'deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diagnosis_dental_scope_classification_code_version_key
    unique (classification_system, code, version_label)
);

create index diagnosis_dental_scope_active_idx
  on public.diagnosis_dental_scope (classification_system, code) where status = 'active';

create trigger set_updated_at
  before update on public.diagnosis_dental_scope
  for each row execute function public.set_updated_at();

alter table public.diagnosis_dental_scope enable row level security;

-- Same "*_select_authenticated" convention as diagnosis_catalog/
-- cups_catalog/rips_reference_values — global reference data, readable
-- by any authenticated user, never clinic-scoped. No INSERT/UPDATE/
-- DELETE grant to `authenticated`/`anon` at all — deny-by-default, same
-- as every other reference/catalog table; only migrations (running as
-- the table owner) ever write here, same convention diagnosis_catalog's
-- own CSV-import scripts already establish for that table (the service
-- role, never the app).
create policy diagnosis_dental_scope_select_authenticated
  on public.diagnosis_dental_scope for select
  to authenticated
  using (true);

grant select on public.diagnosis_dental_scope to authenticated;


-- ============================================================
-- Conservative initial seed — EXACTLY what Odentia's own hardcoded logic
-- already prioritized, migrated to data, nothing more:
--   - Z012 (Examen odontológico), if it exists as an active CIE10 row
--     today;
--   - every currently ACTIVE CIE10 code in [K00, K15) — the official WHO
--     block ("Enfermedades de la cavidad oral, glándulas salivales y
--     maxilares"), derived directly FROM diagnosis_catalog at migration
--     time (never a second, hand-typed code list that could drift from
--     what's actually active in the real catalog).
--
-- Deliberately NOT the broader ~28/~135-code territorial (Bogotá SDS)
-- list from prior audits — no sufficiently concrete, citable provenance
-- for each individual inclusion exists in this repo today. Start
-- conservative; widen later via a new, separately-provenanced migration/
-- data change, never by silently editing this one's own historical seed.
--
-- `on conflict do nothing` — a real, if currently theoretical,
-- idempotency guard (this migration only ever runs once in practice,
-- tracked by the schema_migrations history like any other) matching this
-- checkpoint's own explicit "seed idempotente/seguro" requirement.
insert into public.diagnosis_dental_scope (classification_system, code, source, version_label, status)
select
  'CIE10',
  dc.code,
  'Odentia dental search scope — UX navigation priority only, never an official/exhaustive Ministerio de Salud list, never a RIPS validation rule, never a clinical recommendation. Full CIE-10 catalog always remains separately reachable.',
  'odentia-dental-scope-v1',
  'active'
from public.diagnosis_catalog dc
where dc.classification_system = 'CIE10'
  and dc.status = 'active'
  and (dc.code = 'Z012' or (dc.code >= 'K00' and dc.code < 'K15'))
group by dc.code
on conflict (classification_system, code, version_label) do nothing;
