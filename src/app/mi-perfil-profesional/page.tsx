import { AppShell } from "@/components/shell/app-shell";
import { fetchActiveSpecialties, fetchTeamMembers, type Specialty, type TeamMember } from "@/features/clinic/data";
import { MyProfessionalProfileScreen } from "@/features/clinic/my-professional-profile-screen";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// Dentist's own dedicated route into Mi perfil profesional. /clinica stays
// Clinic Admin only (Información general/Equipo/Consultorios are
// clinic-wide administration a Dentist never manages — see CLAUDE.md
// Domain Model: "Does not manage users, subscriptions, or clinic-wide
// configuration"), so a plain Dentist had no way to reach the real,
// already-working edit flow (update_my_professional_profile(), see that
// migration) that a Clinic-Admin-who's-also-a-dentist already used via
// /clinica's own "Mi información profesional" card. This route changes
// nothing about /clinica's own access — it just gives Dentist a second,
// narrower door to the SAME real component
// (MyProfessionalProfileSection, see my-professional-profile-section.tsx)
// and the SAME real data, never a second form/persistence implementation,
// and never exposing Información general/Equipo/Consultorios here.
//
// Real, server-first (same pattern as /clinica): resolves the real clinic
// context and fetches only what this one card needs — the team list (to
// find the caller's own row, same convention as /clinica/page.tsx) and
// the active specialties catalog for the picker — before any client
// render. src/lib/supabase/proxy.ts gates this route exactly like every
// other real private clinic path (added there alongside this route).
// allowedRoles={["dentist", "clinic-admin"]} is the client-side mock-role
// routing convenience (see use-route-guard.ts) — Assistant/Patient/
// Superadmin get redirected before ever seeing this page; the REAL
// enforcement is still update_my_professional_profile()'s own
// is_active_clinical_professional() check either way, same as it already
// was for /clinica.
export default async function MiPerfilProfesionalPage() {
  const supabase = await createClient();

  let context;
  try {
    context = await resolveClinicContext(supabase);
  } catch (error) {
    console.error("[/mi-perfil-profesional] resolveClinicContext failed", error);
    return (
      <AppShell
        activeNavLabel="Mi perfil profesional"
        heading="Mi perfil profesional"
        allowedRoles={["dentist", "clinic-admin"]}
      >
        <p className="text-sm text-muted-foreground">
          No pudimos cargar tu perfil profesional. Intenta de nuevo en unos minutos.
        </p>
      </AppShell>
    );
  }

  let members: TeamMember[] = [];
  let specialties: Specialty[] = [];

  if (context.status === "ok") {
    try {
      members = await fetchTeamMembers(supabase, context.clinic.id);
    } catch (error) {
      // Same "optional for the page" handling as /clinica/page.tsx — the
      // screen below already renders selfMember === null as an honest
      // empty card, not a crash.
      console.error("[/mi-perfil-profesional] fetchTeamMembers failed", error);
    }

    try {
      specialties = await fetchActiveSpecialties(supabase);
    } catch (error) {
      console.error("[/mi-perfil-profesional] fetchActiveSpecialties failed", error);
    }
  }

  const selfMember =
    context.status === "ok" ? (members.find((member) => member.profileId === context.profile.id) ?? null) : null;

  return (
    <AppShell activeNavLabel="Mi perfil profesional" heading="Mi perfil profesional" allowedRoles={["dentist", "clinic-admin"]}>
      <MyProfessionalProfileScreen initialSelfMember={selfMember} specialties={specialties} />
    </AppShell>
  );
}
