import { Logo } from "@/components/shell/logo";
import { RestrictedAccessSignOut } from "@/features/session/restricted-access-sign-out";
import { resolveSuperadminContext } from "@/features/session/resolve-superadmin-context";
import { createClient } from "@/lib/supabase/server";

// /platform — Checkpoint 2's own deliberately minimal confirmation
// screen. Its only job is proving a real Superadmin (public.platform_roles,
// resolved via resolveSuperadminContext() — see this route's own
// layout.tsx for the actual authorization gate, already enforced before
// this component ever renders) reached the protected Platform surface.
// No commercial/provisioning functionality lives here yet — that's a
// later checkpoint (prospectos, clinic provisioning, member invitations).
// Deliberately NOT AppShell: that component's allowedRoles gates through
// the mock role switcher (src/dev/role.ts), exactly the client-side/mock
// authorization this checkpoint must never depend on — this page reuses
// only plain shared primitives (Logo, RestrictedAccessSignOut), the same
// ones /login and /acceso-restringido already use for their own
// standalone screens.
export default async function PlatformPage() {
  const supabase = await createClient();
  // layout.tsx already guarantees "ok" before this renders — re-resolving
  // here is only to display the real identity, not a second auth check.
  const context = await resolveSuperadminContext(supabase);
  const name = context.status === "ok" ? `${context.profile.firstName} ${context.profile.lastName}`.trim() : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto h-12 w-auto" />

        <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8">
          <h1 className="text-lg font-semibold text-foreground">Platform</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {name ? `Sesión de Superadmin activa: ${name}.` : "Sesión de Superadmin activa."} Esta área todavía no tiene
            funcionalidad comercial — solo confirma que el acceso real a Platform funciona.
          </p>
          <RestrictedAccessSignOut />
        </div>
      </div>
    </div>
  );
}
