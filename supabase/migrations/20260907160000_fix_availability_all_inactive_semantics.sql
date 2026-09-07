-- Odentia Core — fix: professional_availability's "not configured means
-- unrestricted" bootstrap rule (see 20260907150000) was written as "no
-- ACTIVE row exists", which silently conflated two different situations:
--
--   Case A — never configured anything (zero rows at all): correctly
--   unrestricted, legacy compatibility, unchanged by this fix.
--
--   Case C — configured a schedule at some point, but every row is now
--   `active = false`: previously ALSO read as "unrestricted" (zero active
--   rows looks identical to zero rows at all under the old `exists(...
--   active)` check), which is wrong — a professional who deliberately
--   deactivated her whole schedule has, in effect, no availability at all
--   right now, not "no schedule ever configured". New appointments/
--   reschedules for her must be rejected with their own clear message,
--   never silently accepted.
--
-- Case B — at least one active row — unchanged: must still fit inside one
-- of the active blocks for the requested day/time.
--
-- Same function, replaced in place (create or replace), same trigger —
-- no new table, no schema change, no migration of existing rows: this is
-- a pure logic fix to a function already shipped, following this
-- project's own convention for patching a function after the fact (see
-- 20260903121500_fix_upsert_clinical_encounter_race_procedures.sql).
create or replace function public.validate_appointment_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ends_at timestamptz;
  v_local_dow smallint;
  v_local_start time;
  v_local_end time;
  v_local_start_date date;
  v_local_end_date date;
  v_has_any_row boolean;
  v_has_active_row boolean;
begin
  if new.status in ('completed', 'cancelled', 'no_show') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.starts_at = old.starts_at
     and new.duration_minutes = old.duration_minutes
     and new.professional_profile_id = old.professional_profile_id
     and old.status not in ('completed', 'cancelled', 'no_show') then
    return new;
  end if;

  v_ends_at := new.starts_at + (new.duration_minutes * interval '1 minute');
  v_local_dow := extract(isodow from (new.starts_at at time zone 'America/Bogota'));
  v_local_start := (new.starts_at at time zone 'America/Bogota')::time;
  v_local_end := (v_ends_at at time zone 'America/Bogota')::time;
  v_local_start_date := (new.starts_at at time zone 'America/Bogota')::date;
  v_local_end_date := (v_ends_at at time zone 'America/Bogota')::date;

  if v_local_end <= v_local_start then
    raise exception 'appointment must fit within a single day of availability' using errcode = '23514';
  end if;

  select exists (
    select 1 from public.professional_availability pa
    where pa.professional_profile_id = new.professional_profile_id
  ) into v_has_any_row;

  if v_has_any_row then
    select exists (
      select 1 from public.professional_availability pa
      where pa.professional_profile_id = new.professional_profile_id
        and pa.active
    ) into v_has_active_row;

    if not v_has_active_row then
      -- Case C: has a schedule on record, but none of it is active right
      -- now — deliberately unavailable, distinct from never configured.
      raise exception 'professional has no active availability configured' using errcode = '23514';
    end if;

    if not exists (
      select 1 from public.professional_availability pa
      where pa.professional_profile_id = new.professional_profile_id
        and pa.clinic_id = new.clinic_id
        and pa.active
        and pa.day_of_week = v_local_dow
        and pa.start_time <= v_local_start
        and pa.end_time >= v_local_end
    ) then
      raise exception 'appointment falls outside the professional''s configured availability' using errcode = '23514';
    end if;
  end if;
  -- else Case A: zero rows at all — unrestricted, unchanged.

  if exists (
    select 1 from public.professional_absences ab
    where ab.professional_profile_id = new.professional_profile_id
      and ab.clinic_id = new.clinic_id
      and ab.active
      and ab.start_date <= v_local_end_date
      and ab.end_date >= v_local_start_date
  ) then
    raise exception 'appointment falls within the professional''s scheduled absence' using errcode = '23514';
  end if;

  return new;
end;
$$;
