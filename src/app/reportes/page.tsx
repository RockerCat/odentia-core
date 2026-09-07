import { AppShell } from "@/components/shell/app-shell";
import { fetchReportProfessionals, type ReportProfessional } from "@/features/reports/reports-data";
import { ReportsScreen } from "@/features/reports/reports-screen";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import type { MembershipRole } from "@/features/session/types";
import { createClient } from "@/lib/supabase/server";

// Real /reportes — Clinic Admin and Dentist share this route (ReportsScreen
// itself scopes every section to "own activity only" for the latter, and
// to a one-person clinic — see that file's own comment); still out of
// Assistant's own nav (see nav-items.ts/role.ts), unchanged.
//
// Server-first: resolves the real clinic context (never src/dev's mock
// role) and the real professional roster once per load — same pattern as
// Configuración's own Horario/Ausencias page. Period/Profesional filter
// changes refetch client-side from ReportsScreen (interactive state a
// Server Component can't own).
export default async function ReportesPage() {
  const supabase = await createClient();

  let clinicId: string | null = null;
  let role: MembershipRole = "dentist";
  let selfProfessionalProfileId: string | null = null;
  let professionals: ReportProfessional[] = [];
  try {
    const context = await resolveClinicContext(supabase);
    if (context.status === "ok") {
      clinicId = context.clinic.id;
      role = context.membership.role;
      selfProfessionalProfileId = context.professionalProfile?.id ?? null;
      professionals = await fetchReportProfessionals(supabase, clinicId);
    }
  } catch (error) {
    console.error("[/reportes] failed to load real report context", error);
  }

  return (
    <AppShell activeNavLabel="Reportes" heading="Reportes" allowedRoles={["clinic-admin", "dentist"]}>
      <ReportsScreen
        clinicId={clinicId}
        role={role}
        selfProfessionalProfileId={selfProfessionalProfileId}
        initialProfessionals={professionals}
      />
    </AppShell>
  );
}
