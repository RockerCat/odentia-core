import { createClient } from "@/lib/supabase/client";
import type { Appointment, AppointmentStatus } from "./appointments-data";
import { intervalsOverlap } from "./real-format";
import { TERMINAL_STATUSES } from "./real-status";

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

  if (error) return { status: "error", message: isOverlapConstraintError(error) ? OVERLAP_ERROR : GENERIC_ERROR };

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

  // Only re-check overlap when the patch actually touches what defines the
  // slot (when/how long/who) — a pure status change (cancel, reactivate,
  // no_show, complete) never needs it. Current row is fetched fresh here
  // (never trusting a caller-supplied "before" value) since a patch can
  // change just one of startsAt/durationMinutes/professionalProfileId
  // while the other two must still come from what's actually stored.
  if (patch.startsAt !== undefined || patch.durationMinutes !== undefined || patch.professionalProfileId !== undefined) {
    const { data: current, error: fetchError } = await supabase
      .from("appointments")
      .select("clinic_id, professional_profile_id, starts_at, duration_minutes")
      .eq("id", appointmentId)
      .single();
    if (fetchError || !current) return { status: "error", message: GENERIC_ERROR };

    const overlap = await hasOverlappingAppointment(
      supabase,
      current.clinic_id,
      patch.professionalProfileId ?? current.professional_profile_id,
      patch.startsAt ?? current.starts_at,
      patch.durationMinutes ?? current.duration_minutes,
      appointmentId,
    );
    if (overlap) return { status: "error", message: OVERLAP_ERROR };
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
  if (error) return { status: "error", message: isOverlapConstraintError(error) ? OVERLAP_ERROR : GENERIC_ERROR };
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

// "Paciente llegó" — additive flag, independent of `status` (see the
// appointments migration's comment on patient_arrived_at).
export async function markPatientArrived(appointmentId: string): Promise<ActionOutcome> {
  const supabase = createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ patient_arrived_at: new Date().toISOString() })
    .eq("id", appointmentId);
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok" };
}
