-- Odentia Core — DB-level guarantee that a professional never has two
-- non-terminal appointments overlapping in time.
--
-- Why this is needed despite appointments-actions.ts's own
-- hasOverlappingAppointment() check: that check is "query, then insert/
-- update" from application code — two concurrent requests (e.g. two
-- browser tabs, or a double-click racing itself) can both run their
-- overlap query before either has written its row, both see "no overlap",
-- and both insert. Nothing in Postgres stopped that. This is the actual
-- fix for the race; the application-level check stays as-is for the fast,
-- friendly error message on the common (non-concurrent) path — this
-- constraint is what makes the guarantee actually hold under concurrency.
--
-- Audited before writing this: queried the live table directly (`supabase
-- db query --linked`) for any pair of non-terminal appointments sharing a
-- professional with overlapping [starts_at, ends_at) ranges. Zero found
-- (7 total appointments, 4 non-terminal) — safe to add this constraint
-- with no pre-existing violations to reconcile, no data touched, no
-- migration needed to "clean up" anything first.
--
-- Two failed attempts before this one, both instructive:
--   1. `ends_at timestamptz generated always as (starts_at + (duration_minutes
--      || ' minutes')::interval) stored` — rejected: "generation expression
--      is not immutable" (42P17). GENERATED ALWAYS columns require
--      IMMUTABLE, and timestamptz + interval is only STABLE in Postgres
--      (a type-level classification: an interval CAN carry month/day
--      components whose result depends on the session's calendar/
--      timezone, even though ours never does).
--   2. Computing the same expression inline inside the EXCLUDE constraint
--      instead of a generated column — rejected too: "functions in index
--      expression must be marked IMMUTABLE". Index/exclusion-constraint
--      expressions have the exact same IMMUTABLE requirement as generated
--      columns; there's no plain-index exemption.
-- Fixed by wrapping the arithmetic in a small hand-declared IMMUTABLE SQL
-- function. This is safe (not lying to the planner) specifically because
-- the interval here is always duration_minutes * 1 minute — never
-- months/days/years — so the result never actually depends on timezone or
-- calendar rules; Postgres just has no narrower built-in classification
-- for "STABLE only because of a calendar component this particular call
-- never uses."
--
-- btree_gist is required to combine plain equality
-- (professional_profile_id) with a range overlap operator (&&) in one
-- GiST exclusion constraint — the standard, minimal Postgres pattern for
-- "no two rows with the same key can have overlapping ranges," nothing
-- bespoke.
--
-- Scoped with a partial WHERE clause to non-terminal statuses, mirroring
-- TERMINAL_STATUSES (real-status.ts) exactly: a completed/cancelled/
-- no_show appointment never occupies real time as far as this rule is
-- concerned (matches pickSlotAppointment's own display-layer preference
-- and appointments-actions.ts's overlap query, all three now agreeing on
-- the same three statuses). Reactivating a cancelled appointment (status
-- back to 'confirmed') re-enters the constraint's scope at that moment,
-- same as any other update — if a genuine conflict has appeared in the
-- meantime, the reactivation itself is correctly rejected by this
-- constraint (the one Reactivar cita path appointments-actions.ts's own
-- application-level check does not currently re-verify).
create extension if not exists btree_gist;

create or replace function public.appointment_time_range(starts_at timestamptz, duration_minutes integer)
returns tstzrange
language sql
immutable
as $$
  select tstzrange(starts_at, starts_at + (duration_minutes * interval '1 minute'), '[)');
$$;

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    professional_profile_id with =,
    public.appointment_time_range(starts_at, duration_minutes) with &&
  )
  where (status not in ('completed', 'cancelled', 'no_show'));
