-- Odentia Core — connects professional_availability/professional_absences
-- to real Agenda writes: a Cita must fit the professional's configured
-- availability and must not land inside one of their active absences.
--
-- Same "security shouldn't depend only on hiding buttons/pre-checks"
-- principle as the arrival-transitions trigger
-- (20260907120000_validate_appointment_arrival_transitions.sql):
-- appointments-actions.ts gets its own client-side pre-check (fast, friendly
-- error on the common path) but this trigger is the actual guarantee under
-- concurrency and against any direct write.
--
-- Backward-compatibility rule, deliberate: availability is enforced ONLY
-- once a professional has configured at least one ACTIVE availability row
-- of their own. Every professional today has zero rows (the table is brand
-- new) — treating "not configured" as "available nowhere" would instantly
-- break Nueva cita for the entire live app the moment this migration
-- lands. "Not configured" reads as unrestricted (today's behavior,
-- unchanged) until someone actually opts in by using the new Horario
-- editor; from that point on, every day without a matching active block is
-- correctly unavailable — including a day she never touched, which is the
-- expected meaning of "this is my weekly schedule now", not a bug.
--
-- Absences have no such bootstrap concern (zero rows = zero blocking,
-- already the correct default) and are enforced unconditionally.
--
-- Scoped like the arrival-transitions trigger and appointments_no_overlap:
-- only fires for a target status that isn't terminal, and on UPDATE only
-- when the slot-defining fields (starts_at/duration_minutes/
-- professional_profile_id) actually change — editing room/reason/notes/
-- phone, or moving to a terminal status, never re-validates.
create function public.validate_appointment_availability()
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
begin
  if new.status in ('completed', 'cancelled', 'no_show') then
    return new;
  end if;

  -- Skip only when this row already validly occupied this exact slot
  -- before (unchanged when/how long/who, AND it wasn't terminal — a plain
  -- status hop like patient_arrived/waiting_room/in_progress/status-editor
  -- confirm never re-litigates an already-accepted booking). A reactivation
  -- (old.status was terminal, e.g. 'cancelled' -> 'confirmed', slot fields
  -- otherwise unchanged) is NOT skipped — it re-enters the "occupies real
  -- time" set exactly like appointments_no_overlap's own EXCLUDE
  -- constraint already re-checks it, so this stays consistent with that.
  if tg_op = 'UPDATE'
     and new.starts_at = old.starts_at
     and new.duration_minutes = old.duration_minutes
     and new.professional_profile_id = old.professional_profile_id
     and old.status not in ('completed', 'cancelled', 'no_show') then
    return new;
  end if;

  v_ends_at := new.starts_at + (new.duration_minutes * interval '1 minute');
  -- Single fixed clinic time zone (see Configuración's own Preferencias
  -- regionales — "no implementar múltiples zonas horarias" is this task's
  -- own explicit scope limit too): the same assumption every starts_at
  -- already implicitly relies on elsewhere in this app (constructed via
  -- the browser's local time, never explicitly zoned).
  v_local_dow := extract(isodow from (new.starts_at at time zone 'America/Bogota'));
  v_local_start := (new.starts_at at time zone 'America/Bogota')::time;
  v_local_end := (v_ends_at at time zone 'America/Bogota')::time;
  v_local_start_date := (new.starts_at at time zone 'America/Bogota')::date;
  v_local_end_date := (v_ends_at at time zone 'America/Bogota')::date;

  if v_local_end <= v_local_start then
    -- Crosses local midnight — never fits a same-day availability block
    -- (no overnight blocks in this MVP model).
    raise exception 'appointment must fit within a single day of availability' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.professional_availability pa
    where pa.professional_profile_id = new.professional_profile_id
      and pa.active
  ) and not exists (
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

create trigger validate_appointment_availability
  before insert or update on public.appointments
  for each row execute function public.validate_appointment_availability();
