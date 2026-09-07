-- Odentia Core — seed: catálogo inicial de especialidades odontológicas
--
-- public.specialties already exists (foundation schema), already has RLS
-- (specialties_select_authenticated — every authenticated role can read
-- it) and its own GRANT — this migration adds ROWS only, no schema
-- change, using exclusively columns that already exist (name; active
-- already defaults to true). The foundation schema's own comment flagged
-- this as deliberately deferred: "No seed data here by design — left for
-- a dedicated seed step" — this is that step, now that Mi perfil
-- profesional's specialty picker (see clinic-settings-screen.tsx /
-- my-professional-profile-section.tsx) actually needs real options.
--
-- A plain migration, not supabase/seed.sql: this project has never
-- actually used the `db reset`-only seed.sql mechanism (checked — nothing
-- in scripts/CI references it), and a migration is what keeps local and
-- remote identical by construction (the same file replays on both,
-- through the same `supabase db push`/migration-replay path every other
-- real change in this project has used), rather than introducing a second,
-- inconsistent seeding convention for just this one table.
--
-- Idempotent via specialties_name_key (unique) + ON CONFLICT DO NOTHING —
-- safe to run more than once, and safe if some of these rows already
-- exist for any reason: never duplicates, never overwrites a row that may
-- have been edited since.
insert into public.specialties (name) values
  ('Odontología general'),
  ('Ortodoncia'),
  ('Endodoncia'),
  ('Periodoncia'),
  ('Rehabilitación oral'),
  ('Cirugía oral y maxilofacial'),
  ('Odontopediatría'),
  ('Implantología'),
  ('Estética dental')
on conflict (name) do nothing;
