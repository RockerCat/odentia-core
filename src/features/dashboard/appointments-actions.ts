import { createClient } from "@/lib/supabase/client";
import type { Appointment, AppointmentStatus } from "./appointments-data";
import { intervalsOverlap } from "./real-format";
import { TERMINAL_STATUSES } from "./real-status";

// Client-side pre-checks for professional_availability/professional_absences
// (Configuración real: horarios/disponibilidad + ausencias) — same "fast,
// friendly error on the common path" role as hasOverlappingAppointment
// below; the actual guarantee under concurrency/direct writes is the
// validate_appointment_availability trigger (see that migration), which
// this file's own errcode mapping (isAvailabilityConstraintError) falls
// back to when a race lets an invalid write through anyway.

// Real writes on public.appointments — under appointments_insert_scoped /
// appointments_update_scoped RLS (can_access_appointment: clinic_admin/
// assistant see and manage every professional's appointments, a dentist
// only their own — see the appointments migration). Direct table
// insert/update, same convention as src/features/patients/actions.ts (not
// a SECURITY DEFINER RPC): the authorization rule here is fully expressible
// as a row policy, and every tenant-consistency guarantee (patient/
// professional really belong to this clinic) is already structural via the
// composite FKs — there's nothing left an RPC would add. No DELETE: use
// status = 'cancelled', same convention as every other table in this schema.

export type ActionOutcome = { status: "ok" } | { status: "error"; message: string };
export type CreateAppointmentOutcome = { status: "ok"; appointment: Appointment } | { status: "error"; message: string };

const GENERIC_ERROR = "No pudimos guardar el cambio. Intenta de nuevo.";
// Exported so regression tests can assert against it directly instead of
// duplicating this Spanish string.
export const PAST_DATE_ERROR = "No se pueden agendar citas en una fecha u hora que ya pasó.";
export const OVERLAP_ERROR = "Este profesional ya tiene otra cita en ese horario.";
export const OUTSIDE_AVAILABILITY_ERROR = "Este horario está fuera de la disponibilidad configurada del profesional.";
export const NO_ACTIVE_SCHEDULE_ERROR = "Este profesional no tiene disponibilidad activa configurada.";
export const WITHIN_ABSENCE_ERROR = "El profesional tiene una ausencia programada en este rango de fechas.";

// Real backend gate against past dates/times — the board's own slot
// grid already disables past slots visually (see real-appointments-board.tsx's
// isPastSlot use), but that's UX only. This is the single source of truth
// enforced no matter which flow tries to write `starts_at` (Nueva cita,
// or the detail modal's own Fecha/Horario reschedule editors).
export function isPastInstant(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

// Real integrity gap this closes: nothing previously stopped two Citas
// from landing on the exact same professional+time slot — the Agenda
// grid only ever renders one appointment per visible cell (see
// real-status.ts's pickSlotAppointment), so a double-booked pair silently
// hid one of them from the normal click path entirely, surfacing as what
// looked like a single Cita with an inconsistent status (its detail modal
// showing one row's status while some other independent fetch, e.g. the
// patient history panel, showed the other row's). This is the actual fix
// for new bookings; pickSlotAppointment is only a defensive display
// fallback for collisions that already exist in the data.
//
// Queries a ±1 day window around the candidate slot (a single indexed
// range scan) and does the exact overlap arithmetic in JS against each
// candidate's own duration — cancelled/completed/no_show rows never
// block a slot, matching TERMINAL_STATUSES (the same list the rest of the
// Agenda already treats as "not actually occupying this time" for display
// purposes).
async function hasOverlappingAppointment(
  supabase: ReturnType<typeof createClient>,
  clinicId: string,
  professionalProfileId: string,
  startsAt: string,
  durationMinutes: number,
  excludeAppointmentId?: string,
): Promise<boolean> {
  const newStart = new Date(startsAt).getTime();
  const newEnd = newStart + durationMinutes * 60_000;
  const windowStart = new Date(newStart - 24 * 60 * 60_000).toISOString();
  const windowEnd = new Date(newEnd + 24 * 60 * 60_000).toISOString();

  let query = supabase
    .from("appointments")
    .select("id, starts_at, duration_minutes")
    .eq("clinic_id", clinicId)
    .eq("professional_profile_id", professionalProfileId)
    .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`)
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd);
  if (excludeAppointmentId) query = query.neq("id", excludeAppointmentId);

  const { data, error } = await query;
  // Fails open on a query error — this is a defense-in-depth UX guard, not
  // the tenant/authorization boundary (RLS already owns that), so a
  // transient failure here shouldn't block a write that would otherwise
  // succeed.
  if (error || !data) return false;

  return data.some((row) => intervalsOverlap(startsAt, durationMinutes, row.starts_at, row.duration_minutes));
}

// The pre-check above (hasOverlappingAppointment) closes the common,
// non-concurrent case with a fast, friendly error before ever writing —
// but it's still "check, then insert": two concurrent requests can both
// pass it before either has written. appointments_no_overlap (a Postgres
// EXCLUDE constraint — see its own migration) is the actual guarantee
// under concurrency, and raises Postgres error 23P01
// (exclusion_violation) when it catches what the pre-check's race window
// let through. Mapped to the same OVERLAP_ERROR message so a request that
// loses that race still gets the right explanation instead of the generic
// fallback.
function isOverlapConstraintError(error: { code?: string } | null): boolean {
  return error?.code === "23P01";
}

// validate_appointment_availability (see that migration) raises a plain
// check_violation (23514) for both "outside availability" and "within an
// absence" — the DB layer doesn't distinguish the two the way the pre-check
// functions below do, so a request that loses the pre-check's race window
// gets this shared fallback message instead of the more specific one.
const AVAILABILITY_CONSTRAINT_ERROR =
  "Este horario no está disponible para el profesional (fuera de su horario, sin disponibilidad activa configurada, o en una ausencia programada).";

function isAvailabilityConstraintError(error: { code?: string } | null): boolean {
  return error?.code === "23514";
}

// JS Date's local getters (getDay/getHours/getMinutes) read in the
// runtime's own local time zone — same implicit "the machine running this
// is already in the clinic's time zone" assumption every startsAt already
// relies on elsewhere (e.g. real-appointment-detail-modal.tsx's
// isoDayKeyToLocalDate), matching validate_appointment_availability's own
// hardcoded 'America/Bogota' by environment, not by explicit conversion —
// same "no multiple time zones" scope this whole feature has.
function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1; // JS 0=Sun..6=Sat -> ISO 1=Mon..7=Sun
}

function toHHMM(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

// Three-way result, not a boolean — Case A (never configured a schedule at
// all) and Case C (configured one, but every block is now inactive) both
// read as "not available" if collapsed into one boolean, but they mean
// opposite things: Case A stays unrestricted (legacy compatibility, same
// as before this feature existed), Case C means the professional
// deliberately/effectively has no active schedule right now and must
// reject new bookings with its own clear message — never silently fall
// back to "outside availability" or, worse, "anything goes". Mirrors
// validate_appointment_availability's own three-way branch exactly (see
// that migration's fix).
type AvailabilityCheck = "ok" | "outside" | "no-active-schedule";

async function checkConfiguredAvailability(
  supabase: ReturnType<typeof createClient>,
  professionalProfileId: string,
  startsAt: string,
  durationMinutes: number,
): Promise<AvailabilityCheck> {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  if (isoWeekday(end) !== isoWeekday(start) || end <= start) {
    // Crosses local midnight — matches the trigger's own same-day-only rule.
    return "outside";
  }

  const { data, error } = await supabase
    .from("professional_availability")
    .select("day_of_week, start_time, end_time, active")
    .eq("professional_profile_id", professionalProfileId);
  // Fails open on a query error, same reasoning as hasOverlappingAppointment
  // — this is a UX guard, the trigger is the real guarantee.
  if (error || !data) return "ok";

  // Case A: no rows at all — never configured a schedule, stays
  // unrestricted (legacy compatibility).
  if (data.length === 0) return "ok";

  const activeBlocks = data.filter((row) => row.active);
  // Case C: has rows, but none are active right now — deliberately
  // unavailable, not "unconfigured".
  if (activeBlocks.length === 0) return "no-active-schedule";

  // Case B: at least one active block — must fit inside one of them.
  const dow = isoWeekday(start);
  const startHHMM = toHHMM(start);
  const endHHMM = toHHMM(end);
  const fits = activeBlocks.some(
    (row) => row.day_of_week === dow && row.start_time.slice(0, 5) <= startHHMM && row.end_time.slice(0, 5) >= endHHMM,
  );
  return fits ? "ok" : "outside";
}

async function hasActiveAbsenceConflict(
  supabase: ReturnType<typeof createClient>,
  professionalProfileId: string,
  startsAt: string,
  durationMinutes: number,
): Promise<boolean> {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const startDateKey = toDateKey(start);
  const endDateKey = toDateKey(end);

  const { data, error } = await supabase
    .from("professional_absences")
    .select("start_date, end_date, active")
    .eq("professional_profile_id", professionalProfileId);
  if (error || !data) return false;

  return data.some((row) => row.active && row.start_date <= endDateKey && row.end_date >= startDateKey);
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function mapRow(row: {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_profile_id: string;
  starts_at: string;
  duration_minutes: number;
  reason: string | null;
  room: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: AppointmentStatus;
  patient_arrived_at: string | null;
  created_at: string;
  updated_at: string;
}): Omit<Appointment, "patientName" | "patientPhone"> {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    patientId: row.patient_id,
    professionalProfileId: row.professional_profile_id,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    reason: row.reason,
    room: row.room,
    contactPhone: row.contact_phone,
    notes: row.notes,
    status: row.status,
    patientArrivedAt: row.patient_arrived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CreateAppointmentInput = {
  clinicId: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  professionalProfileId: string;
  startsAt: string;
  durationMinutes: number;
  reason: string | null;
  room: string | null;
  contactPhone: string | null;
  notes: string | null;
};

// New appointments always start `confirmed` — matches the approved Agenda
// demo's own "Nueva cita" flow exactly (there is no clinic-side "pending
// request" concept; `scheduled` stays reachable by hand afterwards via the
// status editor). See the appointments migration's own comment.
export async function createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentOutcome> {
  if (isPastInstant(input.startsAt)) {
    return { status: "error", message: PAST_DATE_ERROR };
  }

  const supabase = createClient();

  if (await hasOverlappingAppointment(supabase, input.clinicId, input.professionalProfileId, input.startsAt, input.durationMinutes)) {
    return { status: "error", message: OVERLAP_ERROR };
  }

  const availability = await checkConfiguredAvailability(supabase, input.professionalProfileId, input.startsAt, input.durationMinutes);
  if (availability === "no-active-schedule") return { status: "error", message: NO_ACTIVE_SCHEDULE_ERROR };
  if (availability === "outside") return { status: "error", message: OUTSIDE_AVAILABILITY_ERROR };

  if (await hasActiveAbsenceConflict(supabase, input.professionalProfileId, input.startsAt, input.durationMinutes)) {
    return { status: "error", message: WITHIN_ABSENCE_ERROR };
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      clinic_id: input.clinicId,
      patient_id: input.patientId,
      professional_profile_id: input.professionalProfileId,
      starts_at: input.startsAt,
      duration_minutes: input.durationMinutes,
      reason: input.reason,
      room: input.room,
      contact_phone: input.contactPhone,
      notes: input.notes,
      status: "confirmed",
    })
    .select(
      "id, clinic_id, patient_id, professional_profile_id, starts_at, duration_minutes, reason, room, contact_phone, notes, status, patient_arrived_at, created_at, updated_at",
    )
    .single();

  if (error) {
    if (isOverlapConstraintError(error)) return { status: "error", message: OVERLAP_ERROR };
    if (isAvailabilityConstraintError(error)) return { status: "error", message: AVAILABILITY_CONSTRAINT_ERROR };
    return { status: "error", message: GENERIC_ERROR };
  }

  return {
    status: "ok",
    appointment: { ...mapRow(data), patientName: input.patientName, patientPhone: input.patientPhone },
  };
}

export type AppointmentPatch = Partial<{
  startsAt: string;
  durationMinutes: number;
  professionalProfileId: string;
  reason: string | null;
  room: string | null;
  contactPhone: string | null;
  notes: string | null;
  status: AppointmentStatus;
}>;

export async function updateAppointment(appointmentId: string, patch: AppointmentPatch): Promise<ActionOutcome> {
  if (patch.startsAt !== undefined && isPastInstant(patch.startsAt)) {
    return { status: "error", message: PAST_DATE_ERROR };
  }

  const supabase = createClient();

  // Only re-check overlap/availability/absence when the patch actually
  // touches what defines the slot (when/how long/who), or when it's a
  // reactivation (status coming back from a terminal one — same reasoning
  // as the availability trigger's own skip condition: a reactivated Cita
  // re-enters the "occupies real time" set exactly like
  // appointments_no_overlap's own EXCLUDE constraint already re-checks it
  // unconditionally). Current row is fetched fresh here (never trusting a
  // caller-supplied "before" value) since a patch can change just one of
  // startsAt/durationMinutes/professionalProfileId while the other two must
  // still come from what's actually stored.
  const touchesSlot =
    patch.startsAt !== undefined || patch.durationMinutes !== undefined || patch.professionalProfileId !== undefined;
  if (touchesSlot || patch.status !== undefined) {
    const { data: current, error: fetchError } = await supabase
      .from("appointments")
      .select("clinic_id, professional_profile_id, starts_at, duration_minutes, status")
      .eq("id", appointmentId)
      .single();
    if (fetchError || !current) return { status: "error", message: GENERIC_ERROR };

    const wasTerminal = TERMINAL_STATUSES.includes(current.status);
    const nextStatus = patch.status ?? current.status;
    const nextIsTerminal = TERMINAL_STATUSES.includes(nextStatus);
    const reactivating = wasTerminal && !nextIsTerminal;

    if (touchesSlot || reactivating) {
      const resolvedProfessionalId = patch.professionalProfileId ?? current.professional_profile_id;
      const resolvedStartsAt = patch.startsAt ?? current.starts_at;
      const resolvedDuration = patch.durationMinutes ?? current.duration_minutes;

      const overlap = await hasOverlappingAppointment(
        supabase,
        current.clinic_id,
        resolvedProfessionalId,
        resolvedStartsAt,
        resolvedDuration,
        appointmentId,
      );
      if (overlap) return { status: "error", message: OVERLAP_ERROR };

      if (!nextIsTerminal) {
        const availability = await checkConfiguredAvailability(supabase, resolvedProfessionalId, resolvedStartsAt, resolvedDuration);
        if (availability === "no-active-schedule") return { status: "error", message: NO_ACTIVE_SCHEDULE_ERROR };
        if (availability === "outside") return { status: "error", message: OUTSIDE_AVAILABILITY_ERROR };
        if (await hasActiveAbsenceConflict(supabase, resolvedProfessionalId, resolvedStartsAt, resolvedDuration)) {
          return { status: "error", message: WITHIN_ABSENCE_ERROR };
        }
      }
    }
  }

  const dbPatch: Record<string, unknown> = {};
  if (patch.startsAt !== undefined) dbPatch.starts_at = patch.startsAt;
  if (patch.durationMinutes !== undefined) dbPatch.duration_minutes = patch.durationMinutes;
  if (patch.professionalProfileId !== undefined) dbPatch.professional_profile_id = patch.professionalProfileId;
  if (patch.reason !== undefined) dbPatch.reason = patch.reason;
  if (patch.room !== undefined) dbPatch.room = patch.room;
  if (patch.contactPhone !== undefined) dbPatch.contact_phone = patch.contactPhone;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes;
  if (patch.status !== undefined) dbPatch.status = patch.status;

  const { error } = await supabase.from("appointments").update(dbPatch).eq("id", appointmentId);
  if (error) {
    if (isOverlapConstraintError(error)) return { status: "error", message: OVERLAP_ERROR };
    if (isAvailabilityConstraintError(error)) return { status: "error", message: AVAILABILITY_CONSTRAINT_ERROR };
    return { status: "error", message: GENERIC_ERROR };
  }
  return { status: "ok" };
}

export async function cancelAppointment(appointmentId: string): Promise<ActionOutcome> {
  return updateAppointment(appointmentId, { status: "cancelled" });
}

// Matches the approved demo's "Reactivar cita" action exactly: always back
// to `confirmed`, never whatever status it held before cancelling.
export async function reactivateAppointment(appointmentId: string): Promise<ActionOutcome> {
  return updateAppointment(appointmentId, { status: "confirmed" });
}

// "Marcar No asistió" — explicit resolution for a Cita that never started
// attention and is past its grace period (see real-status.ts's
// isUnresolved/"Sin cerrar"), confirming the Patient genuinely never showed
// (CLAUDE.md's Appointment Lifecycle). A final state, same convention as
// cancelAppointment/reactivateAppointment above — never set automatically.
export async function markNoShow(appointmentId: string): Promise<ActionOutcome> {
  return updateAppointment(appointmentId, { status: "no_show" });
}

// "Paciente llegó" — scheduled/confirmed → patient_arrived. Front-desk-only
// (Clinic Admin/Assistant), enforced server-side too, not just by which
// button the UI shows (see the arrival-transitions migration's trigger).
// Was previously a separate `patient_arrived_at` timestamp column, additive
// to `status` — see that migration's own comment on why: patient_arrived
// had no real UI action yet at the time. It does now; this is that real
// two-step flow, so this goes through the same status column/validated
// transition as every other appointment status change instead of a second,
// parallel signal.
export async function markPatientArrived(appointmentId: string): Promise<ActionOutcome> {
  return updateAppointment(appointmentId, { status: "patient_arrived" });
}

// "Enviar a sala de espera" — patient_arrived → waiting_room. Same
// front-desk-only restriction and server-side enforcement as
// markPatientArrived above.
export async function sendToWaitingRoom(appointmentId: string): Promise<ActionOutcome> {
  return updateAppointment(appointmentId, { status: "waiting_room" });
}
