import { PortalShell } from "@/components/shell/portal-shell";
import { fetchMyAppointments, type PortalAppointment } from "@/features/portal/appointments-data";
import {
  fetchMyAppointmentRequests,
  fetchMyClinicProfessionals,
  type PortalAppointmentRequest,
  type PortalProfessional,
} from "@/features/portal/requests-data";
import { MyAppointmentsScreen } from "@/features/portal/my-appointments-screen";
import { resolvePatientContext } from "@/features/session/resolve-patient-context";
import { createClient } from "@/lib/supabase/server";

// The Patient's main destination — see homeRouteForRole in src/dev/role.ts.
// Real data only: appointments come from fetchMyAppointments, and
// Solicitudes de Cita (a SEPARATE entity — see CLAUDE.md's Appointment
// Lifecycle) from fetchMyAppointmentRequests, both scoped by the patient/
// clinic resolved server-side via resolvePatientContext — never a
// client-supplied patient_id/clinic_id. No heading: the screen starts
// directly with the "Próxima cita" card instead of a redundant "Mis citas"
// title — activeNavLabel still keeps "Mis citas" highlighted in the nav.
export default async function PortalAppointmentsPage() {
  const supabase = await createClient();
  const context = await resolvePatientContext(supabase);

  let appointments: PortalAppointment[] = [];
  let requests: PortalAppointmentRequest[] = [];
  let professionals: PortalProfessional[] = [];
  let loadError = false;
  if (context.status === "ok") {
    try {
      // Sequential-then-merged, not one nested query: requests need the
      // professionals list to resolve display names (professional_profiles
      // is staff-only for SELECT — see requests-data.ts), same convention
      // fetchMyAppointments already uses.
      [appointments, professionals] = await Promise.all([
        fetchMyAppointments(supabase, context.patient.clinicId, context.patient.id),
        fetchMyClinicProfessionals(supabase),
      ]);
      requests = await fetchMyAppointmentRequests(supabase, professionals);
    } catch (error) {
      console.error("[/portal/citas] failed to load real appointments", error);
      loadError = true;
    }
  }

  return (
    <PortalShell activeNavLabel="Mis citas">
      <MyAppointmentsScreen
        context={context}
        appointments={appointments}
        requests={requests}
        professionals={professionals}
        loadError={loadError}
      />
    </PortalShell>
  );
}
