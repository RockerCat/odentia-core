import { createClient } from "@/lib/supabase/client";
import type { AppointmentRequestStatus } from "./requests-data";

// The one sanctioned write path for a Patient creating a "Solicitud de
// Cita" — always through request_my_appointment() (see that migration),
// never a direct appointment_requests INSERT: patients have no INSERT
// grant or policy on that table at all. Never sends patient_id/clinic_id;
// the RPC resolves both from auth.uid() via patient_user_links.
//
// Creating a request NEVER creates a Cita and never reserves a slot — the
// clinic accepting it is what does (accept_appointment_request, staff
// side). See CLAUDE.md's Appointment Lifecycle.

const GENERIC_ERROR = "No pudimos enviar tu solicitud. Intenta de nuevo.";

export type RequestMyAppointmentOutcome =
  | {
      status: "ok";
      request: {
        id: string;
        professionalProfileId: string;
        preferredStartsAt: string;
        status: AppointmentRequestStatus;
        acceptedAppointmentId: string | null;
        createdAt: string;
      };
    }
  | { status: "error"; message: string };

export async function requestMyAppointment(
  professionalProfileId: string,
  preferredStartsAt: string,
): Promise<RequestMyAppointmentOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("request_my_appointment", {
    p_professional_profile_id: professionalProfileId,
    p_preferred_starts_at: preferredStartsAt,
  });

  if (error) {
    if (error.message.includes("no linked patient")) {
      return { status: "error", message: "Tu cuenta no está vinculada a ningún paciente." };
    }
    if (error.message.includes("ambiguous patient link")) {
      return { status: "error", message: "Tu cuenta tiene más de un paciente vinculado — no se puede solicitar." };
    }
    if (error.message.includes("preferred date is in the past")) {
      return { status: "error", message: "El horario elegido ya pasó. Elige otro." };
    }
    if (error.message.includes("professional is not available")) {
      return { status: "error", message: "Ese profesional ya no está disponible en tu clínica." };
    }
    // 23505 = the appointment_requests_one_pending_per_patient partial
    // unique index winning the race the RPC's own pre-check can lose (two
    // tabs, a double-click). Same message either way — the outcome the
    // patient sees is identical.
    if (error.message.includes("a pending request already exists") || error.code === "23505") {
      return { status: "error", message: "Ya tienes una solicitud de cita pendiente." };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    status: "ok",
    request: {
      id: row.id,
      professionalProfileId: row.professional_profile_id,
      preferredStartsAt: row.preferred_starts_at,
      status: row.status,
      acceptedAppointmentId: row.accepted_appointment_id,
      createdAt: row.created_at,
    },
  };
}
