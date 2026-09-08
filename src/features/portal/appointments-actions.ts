import { createClient } from "@/lib/supabase/client";
import type { AppointmentStatus } from "@/features/dashboard/appointments-data";

// The one sanctioned write path for a Patient confirming her own
// attendance — always through confirm_my_appointment() (see that
// migration), never a direct appointments UPDATE: patients have no UPDATE
// RLS grant on that table at all. Never sends patient_id/clinic_id; the
// RPC resolves everything from auth.uid().

const GENERIC_ERROR = "No pudimos confirmar tu asistencia. Intenta de nuevo.";

export type ConfirmMyAppointmentOutcome =
  | { status: "ok"; appointmentId: string; newStatus: AppointmentStatus }
  | { status: "error"; message: string };

export async function confirmMyAppointment(appointmentId: string): Promise<ConfirmMyAppointmentOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("confirm_my_appointment", { p_appointment_id: appointmentId });

  if (error) {
    if (error.message.includes("no linked patient")) {
      return { status: "error", message: "Tu cuenta no está vinculada a ningún paciente." };
    }
    if (error.message.includes("ambiguous patient link")) {
      return { status: "error", message: "Tu cuenta tiene más de un paciente vinculado — no se puede confirmar." };
    }
    if (error.message.includes("not found or not yours")) {
      return { status: "error", message: "Esta cita no existe o no te pertenece." };
    }
    if (error.message.includes("already occurred")) {
      return { status: "error", message: "Esta cita ya ocurrió y no se puede confirmar." };
    }
    if (error.message.includes("cannot be confirmed")) {
      return { status: "error", message: "Esta cita ya no está disponible para confirmar." };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { status: "ok", appointmentId: row.id, newStatus: row.status };
}
