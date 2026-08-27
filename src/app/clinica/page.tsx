import { AppShell } from "@/components/shell/app-shell";
import { fetchClinicDetail, fetchPrimaryLocation, fetchTeamMembers, type ClinicDetail, type PrimaryLocation, type TeamMember } from "@/features/clinic/data";
import { ClinicSettingsScreen } from "@/features/clinic/clinic-settings-screen";
import { logStepFailed } from "@/features/clinic/debug";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// Clinic-wide configuration — Clinic Admin only (Dentist/Assistant filter
// "Clínica" out of their own nav, see src/dev/role.ts). Server-first (see
// CLAUDE.md task scope, section 13): resolves the real clinic context and
// fetches Información general/Sede principal/Equipo here, before any
// client render — no render→spinner→client-fetch→render round trip for
// the initial load. src/lib/supabase/proxy.ts already gates this route on
// a real, active membership, so clinic_id here is never accepted from a
// URL/form — it only ever comes from resolveClinicContext (see task scope,
// section 15). Every section is now real data or an honest empty state —
// selfMember (the authenticated user's own row in the real team list,
// matched by profile.id) is what "Mi perfil profesional" renders from,
// never RoleContext/useRole() (see task scope, sections 5/15).
//
// Sequential, not Promise.all: only resolveClinicContext/fetchClinicDetail
// failing takes down the whole page (we can't identify or name the clinic
// at all) — fetchPrimaryLocation/fetchTeamMembers failing independently
// just leaves that section at its already-handled empty state instead.
// Each fetch logs its own failure (see src/features/clinic/debug.ts) —
// nothing here logs on success.
export default async function ClinicaPage() {
  const supabase = await createClient();

  let context;
  try {
    context = await resolveClinicContext(supabase);
  } catch (error) {
    logStepFailed("resolveClinicContext", error);
    return (
      <AppShell activeNavLabel="Clínica" heading="Clínica" allowedRoles={["clinic-admin"]}>
        <p className="text-sm text-muted-foreground">
          No pudimos cargar la información de tu clínica. Intenta de nuevo en unos minutos.
        </p>
      </AppShell>
    );
  }

  // proxy.ts already guarantees an "ok" context for any request that
  // reaches this private route — this branch is a defensive fallback (see
  // task scope, section 12: no crashear por nulls), not an expected path.
  const clinicId = context.status === "ok" ? context.clinic.id : null;

  let clinic: ClinicDetail | null = null;
  let location: PrimaryLocation | null = null;
  let members: TeamMember[] = [];
  let clinicFailed = false;

  if (clinicId) {
    try {
      clinic = await fetchClinicDetail(supabase, clinicId);
    } catch {
      // Already logged inside fetchClinicDetail (see debug.ts) — this is
      // the one failure that takes down the whole page, since Información
      // general can't render without it.
      clinicFailed = true;
    }

    try {
      location = await fetchPrimaryLocation(supabase, clinicId);
    } catch {
      // Already logged inside fetchPrimaryLocation. Sede principal is
      // optional for the page as a whole — location stays null, which the
      // screen already renders as an honest "no disponible" state (see
      // task scope, section 6/12), not a crash.
    }

    try {
      members = await fetchTeamMembers(supabase, clinicId);
    } catch {
      // Already logged inside fetchTeamMembers, per sub-query. Equipo is
      // optional for the page as a whole — members stays [], which the
      // screen already renders as its empty state.
    }
  }

  // "Mi perfil profesional" is always about the authenticated user's own
  // row — matched by profile.id, the one real identity CurrentUserContext
  // already resolved, never RoleContext/useRole() (see task scope,
  // sections 5/15). null is a legitimate, handled state (see
  // clinic-settings-screen.tsx), not an error.
  const selfMember =
    context.status === "ok" ? (members.find((member) => member.profileId === context.profile.id) ?? null) : null;

  return (
    <AppShell activeNavLabel="Clínica" heading="Clínica" allowedRoles={["clinic-admin"]}>
      {clinicFailed || !clinic ? (
        <p className="text-sm text-muted-foreground">
          No pudimos cargar la información de tu clínica. Intenta de nuevo en unos minutos.
        </p>
      ) : (
        <ClinicSettingsScreen clinic={clinic} location={location} members={members} selfMember={selfMember} />
      )}
    </AppShell>
  );
}
