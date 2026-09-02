import { createClient } from "@/lib/supabase/client";
import type { Appointment, AppointmentStatus } from "./appointments-data";

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
const PAST_DATE_ERROR = "No se pueden agendar citas en una fecha u hora que ya pasó.";

// Real backend gate against past dates/times — the board's own slot
// grid already disables past slots visually (see real-appointments-board.tsx's
// isPastSlot use), but that's UX only. This is the single source of truth
// enforced no matter which flow tries to write `starts_at` (Nueva cita,
// or the detail modal's own Fecha/Horario reschedule editors).
function isPastInstant(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
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

  if (error) return { status: "error", message: GENERIC_ERROR };

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
  if (error) return { status: "error", message: GENERIC_ERROR };
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
