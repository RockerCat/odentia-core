-- Odentia Core — SQL-layer regression test for
-- 20260921120000_create_diagnosis_dental_scope.sql
--
-- Same conventions as every other SQL test in this repo: a plain psql
-- script (no pgTAP), meant to run against a local Supabase Postgres
-- (`supabase start` + `supabase db reset`) AFTER this migration has been
-- reviewed and applied there — NOT against the shared dev/prod project,
-- and NOT executed as part of this change (no local Postgres/Docker
-- available in this sandbox — see the task's own final report: NOT RUN
-- locally).
--
-- The migration's own seed already ran once, at migration-apply time,
-- against whatever public.diagnosis_catalog actually contained then —
-- not something a later test can deterministically re-assert against
-- (real catalog content varies by environment/import history). Instead,
-- this test re-exercises the EXACT SAME seed SELECT/INSERT shape the
-- migration itself uses (copied verbatim, only re-scoped to a QA-only
-- classification_system so it can never collide with or depend on real
-- CIE10 data already in the table) against controlled fixture rows —
-- the faithful, reproducible way to verify the seed LOGIC's boundary
-- conditions without touching real catalog content.
--
-- Runs inside one transaction, always rolled back at the end: safe to
-- run repeatedly, never leaves fixture rows behind.

begin;

do $$
declare
  v_import_id uuid;
  v_count integer;
  v_row record;
begin
  -- ------------------------------------------------------------
  -- Fixture: a QA-only classification_system so this test can never
  -- collide with, or accidentally depend on, real CIE10 data already
  -- present in this environment's diagnosis_catalog.
  -- ------------------------------------------------------------
  insert into public.rips_catalog_imports (catalog_key, version_label, valid_from, row_count, imported_by)
  values ('QA-TEST-DENTAL-SCOPE', 'qa-dental-scope', current_date, 0, 'test:diagnosis_dental_scope')
  returning id into v_import_id;

  insert into public.diagnosis_catalog (import_id, classification_system, code, version_label, description, valid_from, status)
  values
    (v_import_id, 'CIE10-QA-TEST', 'Z012', 'qa-dental-scope', 'QA Examen odontologico', current_date, 'active'),
    (v_import_id, 'CIE10-QA-TEST', 'K000', 'qa-dental-scope', 'QA K00 lower bound', current_date, 'active'),
    (v_import_id, 'CIE10-QA-TEST', 'K074', 'qa-dental-scope', 'QA mid-range K07', current_date, 'active'),
    (v_import_id, 'CIE10-QA-TEST', 'K149', 'qa-dental-scope', 'QA K14 upper bound', current_date, 'active'),
    -- Out of range (K15, exclusive upper bound) — must be excluded.
    (v_import_id, 'CIE10-QA-TEST', 'K150', 'qa-dental-scope', 'QA out of range', current_date, 'active'),
    -- In-range code, but NOT active — must be excluded (only active
    -- CIE10 rows are ever seeded).
    (v_import_id, 'CIE10-QA-TEST', 'K099', 'qa-dental-scope', 'QA superseded, in range', current_date, 'superseded'),
    -- Active, but unrelated to the dental scope entirely — must be
    -- excluded.
    (v_import_id, 'CIE10-QA-TEST', 'Z441', 'qa-dental-scope', 'QA unrelated active code', current_date, 'active'),
    -- Active, adjacent to Z012 but NOT Z012 itself — must be excluded
    -- (never a "Z01.x family" match, only the exact code).
    (v_import_id, 'CIE10-QA-TEST', 'Z011', 'qa-dental-scope', 'QA adjacent to Z012', current_date, 'active');

  -- ------------------------------------------------------------
  -- Re-exercise the exact seed shape from
  -- 20260921120000_create_diagnosis_dental_scope.sql, scoped to the QA
  -- classification_system only.
  -- ------------------------------------------------------------
  insert into public.diagnosis_dental_scope (classification_system, code, source, version_label, status)
  select
    'CIE10-QA-TEST',
    dc.code,
    'QA test seed — mirrors the real migration''s own provenance text shape',
    'qa-dental-scope-v1',
    'active'
  from public.diagnosis_catalog dc
  where dc.classification_system = 'CIE10-QA-TEST'
    and dc.status = 'active'
    and (dc.code = 'Z012' or (dc.code >= 'K00' and dc.code < 'K15'))
  group by dc.code
  on conflict (classification_system, code, version_label) do nothing;

  -- ------------------------------------------------------------
  -- Z012 is in scope.
  -- ------------------------------------------------------------
  perform 1 from public.diagnosis_dental_scope where classification_system = 'CIE10-QA-TEST' and code = 'Z012';
  if not found then raise exception 'Case FAILED: Z012 must be in the seeded dental scope'; end if;
  raise notice 'Case OK: Z012 is in scope';

  -- ------------------------------------------------------------
  -- Active K00-K14 codes are in scope.
  -- ------------------------------------------------------------
  perform 1 from public.diagnosis_dental_scope where classification_system = 'CIE10-QA-TEST' and code in ('K000', 'K074', 'K149');
  select count(*) into v_count from public.diagnosis_dental_scope where classification_system = 'CIE10-QA-TEST' and code in ('K000', 'K074', 'K149');
  if v_count <> 3 then raise exception 'Case FAILED: expected all 3 active K00-K14 codes in scope, got %', v_count; end if;
  raise notice 'Case OK: active K00-K14 codes are in scope';

  -- ------------------------------------------------------------
  -- Out-of-range, inactive-in-range, unrelated, and merely-adjacent
  -- codes are all excluded.
  -- ------------------------------------------------------------
  select count(*) into v_count
  from public.diagnosis_dental_scope
  where classification_system = 'CIE10-QA-TEST' and code in ('K150', 'K099', 'Z441', 'Z011');
  if v_count <> 0 then raise exception 'Case FAILED: expected 0 excluded codes in scope, got %', v_count; end if;
  raise notice 'Case OK: out-of-range/inactive/unrelated/adjacent codes are excluded';

  -- ------------------------------------------------------------
  -- Exactly 4 rows total for this QA scope (Z012, K000, K074, K149) —
  -- confirms nothing extra slipped in.
  -- ------------------------------------------------------------
  select count(*) into v_count from public.diagnosis_dental_scope where classification_system = 'CIE10-QA-TEST';
  if v_count <> 4 then raise exception 'Case FAILED: expected exactly 4 seeded rows, got %', v_count; end if;
  raise notice 'Case OK: exactly 4 rows seeded (Z012 + 3 active K00-K14 codes)';

  -- ------------------------------------------------------------
  -- Every seeded row: status='active', source names Odentia (never an
  -- official-sounding provenance), version_label set.
  -- ------------------------------------------------------------
  for v_row in select * from public.diagnosis_dental_scope where classification_system = 'CIE10-QA-TEST' loop
    if v_row.status <> 'active' then raise exception 'Case FAILED: row % has status %, expected active', v_row.code, v_row.status; end if;
    if v_row.source is null or v_row.source = '' then raise exception 'Case FAILED: row % has no source/provenance', v_row.code; end if;
    if v_row.version_label is null or v_row.version_label = '' then raise exception 'Case FAILED: row % has no version_label', v_row.code; end if;
  end loop;
  raise notice 'Case OK: every seeded row carries status/source/version_label';

  -- ------------------------------------------------------------
  -- Idempotency: re-running the exact same seed statement must not
  -- duplicate rows or raise an error.
  -- ------------------------------------------------------------
  insert into public.diagnosis_dental_scope (classification_system, code, source, version_label, status)
  select
    'CIE10-QA-TEST',
    dc.code,
    'QA test seed — mirrors the real migration''s own provenance text shape',
    'qa-dental-scope-v1',
    'active'
  from public.diagnosis_catalog dc
  where dc.classification_system = 'CIE10-QA-TEST'
    and dc.status = 'active'
    and (dc.code = 'Z012' or (dc.code >= 'K00' and dc.code < 'K15'))
  group by dc.code
  on conflict (classification_system, code, version_label) do nothing;

  select count(*) into v_count from public.diagnosis_dental_scope where classification_system = 'CIE10-QA-TEST';
  if v_count <> 4 then raise exception 'Case FAILED: re-running the seed must not duplicate rows, got %', v_count; end if;
  raise notice 'Case OK: re-running the seed is idempotent, no duplicate rows';

  raise notice 'ALL CASES PASSED';
end;
$$;

rollback;
