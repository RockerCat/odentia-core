import { createClient } from "@/lib/supabase/client";
import type { Appointment } from "./appointments-data";
import {
  AVAILABILITY_CONSTRAINT_ERROR,
  OVERLAP_ERROR,
  PAST_DATE_ERROR,
  type ActionOutcome,
} from "./appointments-actions";

// The clinic's two decisions on a Solicitud de Cita — both through
// SECURITY DEFINER RPCs (accept_appointment_request /
// reject_appointment_request), never a direct table write:
// appointment_requests has no INSERT/UPDATE/DELETE policy or grant at all,
// for anyone.
//
// Why an RPC here when appointments-actions.ts deliberately uses direct
// table writes: accepting is not one write, it's two that must succeed or
// fail together (create the Cita, then mark the request accepted and link
// it). PostgREST cannot express that atomically — a client-side "insert,
// then update" would leave a Cita with a still-pending request whenever
// the second call fails or the tab closes in between. The RPC runs both in
// one transaction, and takes the request row's lock first so two staff
// members accepting the same request can never produce two Citas. See that
// migration's own comment.
//
// Every real Agenda rule still applies, unchanged, because the RPC INSERTs
// into public.appointments and its triggers/constraints are not RLS:
// appointments_no_overlap (23P01) and validate_appointment_availability
// (23514) are mapped back to the exact same user-facing messages Nueva
// cita already uses, rather than a second vocabulary for the same failure.

const GENERIC_ACCEPT_ERROR = "No pudimos aceptar la solicitud. Intenta de nuevo.";
const GENERIC_REJECT_ERROR = "No pudimos rechazar la solicitud. Intenta de nuevo.";
const NOT_PENDING_ERROR = "Esta solicitud ya fue atendida.";
const NOT_AUTHORIZED_ERROR = "No tienes permiso para gestionar esta solicitud.";

export type AcceptAppointmentRequestInput = {
  requestId: string;
  professionalProfileId: string;
  startsAt: string;
  durationMinutes: number;
  room: string | null;
  reason: string | null;
  notes: string | null;
  // Display-only, merged into the returned Appointment the same way
  // createAppointment does — the RPC returns the raw appointments row,
  // which carries no patient name/phone of its own.
  patientName: string;
  patientPhone: string | null;
};

export type AcceptAppointmentRequestOutcome =
  | { status: "ok"; appointment: Appointment }
  | { status: "error"; message: string };

function mapSharedError(error: { code?: string; message: string }): string | null {
  if (error.code === "23P01") return OVERLAP_ERROR;
  if (error.code === "23514") return AVAILABILITY_CONSTRAINT_ERROR;
  if (error.message.includes("request not found") || error.message.includes("not authorized")) {
    return NOT_AUTHORIZED_ERROR;
  }
  if (error.message.includes("request is no longer pending")) return NOT_PENDING_ERROR;
  return null;
}

export async function acceptAppointmentRequest(
  input: AcceptAppointmentRequestInput,
): Promise<AcceptAppointmentRequestOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("accept_appointment_request", {
    p_request_id: input.requestId,
    p_professional_profile_id: input.professionalProfileId,
    p_starts_at: input.startsAt,
    p_duration_minutes: input.durationMinutes,
    p_room: input.room,
    p_reason: input.reason,
    p_notes: input.notes,
  });

  if (error) {
    const shared = mapSharedError(error);
    if (shared) return { status: "error", message: shared };
    if (error.message.includes("appointment date is in the past")) {
      return { status: "error", message: PAST_DATE_ERROR };
    }
    if (error.message.includes("professional is not available")) {
      return { status: "error", message: "Ese profesional ya no está activo en la clínica." };
    }
    if (error.message.includes("active catalog")) {
      return { status: "error", message: "El consultorio o tratamiento elegido ya no está activo." };
    }
    return { status: "error", message: GENERIC_ACCEPT_ERROR };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    status: "ok",
    appointment: {
      id: row.id,
      clinicId: row.clinic_id,
      patientId: row.patient_id,
      patientName: input.patientName,
      patientPhone: input.patientPhone,
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
    },
  };
}

// Rejecting creates no Cita, ever — it is purely a status transition on the
// request itself (pending → rejected). The approved design has no
// rejection-reason field anywhere, so none is collected or stored.
export async function rejectAppointmentRequest(requestId: string): Promise<ActionOutcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc("reject_appointment_request", { p_request_id: requestId });
  if (error) {
    const shared = mapSharedError(error);
    return { status: "error", message: shared ?? GENERIC_REJECT_ERROR };
  }
  return { status: "ok" };
}
