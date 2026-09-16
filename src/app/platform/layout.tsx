import { redirect } from "next/navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { restrictedReasonForSuperadmin } from "@/features/session/restricted-reason";
import { resolveSuperadminContext } from "@/features/session/resolve-superadmin-context";
import { createClient } from "@/lib/supabase/server";

// Second, independent authorization layer for /platform — defense in
// depth alongside src/lib/supabase/proxy.ts's own PRIVATE_PLATFORM_PATHS
// gate (see that file's own comment on why both exist). Every route
// nested under this layout re-resolves the real Superadmin context here,
// server-side, before rendering any child at all — so a future child
// route added under /platform without updating proxy.ts's own path list
// is still covered: redirect() (Next's own mechanism) aborts rendering
// entirely, the same "no Platform content before the redirect" property
// proxy.ts's gate already has.
//
// The ONLY source of truth is public.platform_roles, resolved via
// resolveSuperadminContext() — never clinic_memberships, never Supabase
// user_metadata, never the mock role switcher (see CLAUDE.md Domain
// Model's Superadmin section).
export default async function PlatformLayout({ children }: LayoutProps<"/platform">) {
  const supabase = await createClient();
  const context = await resolveSuperadminContext(supabase);

  if (context.status === "unauthenticated") redirect("/login");
  if (context.status !== "ok") redirect(`/acceso-restringido?motivo=${restrictedReasonForSuperadmin(context.status)}`);

  const name = `${context.profile.firstName} ${context.profile.lastName}`.trim();

  return (
    <PlatformShell name={name} email={context.profile.email}>
      {children}
    </PlatformShell>
  );
}
