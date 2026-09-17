import { notFound, redirect } from "next/navigation";
import { AssignClinicAdminCard } from "@/components/platform/assign-clinic-admin-card";
import { ClinicLogoDisplay } from "@/components/platform/clinic-logo-display";
import { PlatformEquipoSection } from "@/components/platform/platform-equipo-section";
import { fetchPendingInvitations, fetchTeamMembers } from "@/features/clinic/data";
import {
  fetchActiveClinicAdminMembership,
  fetchPendingClinicAdminInvitation,
  fetchPlatformClinicById,
  fetchPlatformClinicBySlug,
  looksLikeClinicId,
} from "@/features/platform/clinics-data";
import { createClient } from "@/lib/supabase/server";

// Minimal real clinic detail — the natural landing spot right after
// "Nueva clínica" succeeds, and reachable from the listing. No editing,
// no team/member management yet (that's the next checkpoint) — this is
// deliberately the smallest coherent screen, not a placeholder for a
// bigger one that got cut.
//
// slug is the canonical, public Platform URL for a clinic
// (clinics.slug — not null + unique since the foundation schema, never
// writable after creation by any existing screen — see the read-only
// audit that confirmed this). A bare clinic_id is only ever a compat
// fallback here, for a link minted before this canonical form existed
// (this checkpoint's own QA smoke redirected to one) — resolved and then
// immediately redirected (Next's own redirect(), not permanentRedirect())
// to the real slug URL, never rendered directly under an id-shaped path.
export default async function PlatformClinicDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  let clinic: Awaited<ReturnType<typeof fetchPlatformClinicBySlug>> = null;
  let redirectToSlug: string | null = null;

  try {
    clinic = await fetchPlatformClinicBySlug(supabase, slug);

    // Only ever attempted when the segment is UUID-shaped — never a
    // plain lookup miss for an arbitrary string, which would otherwise
    // reach clinics.id (a real `uuid` column) and throw Postgres'
    // "invalid input syntax for type uuid" instead of a clean not-found.
    if (!clinic && looksLikeClinicId(slug)) {
      const byId = await fetchPlatformClinicById(supabase, slug);
      if (byId) redirectToSlug = byId.slug;
    }
  } catch (error) {
    console.error("[/platform/clinicas/[slug]] clinic lookup failed", error);
  }

  // redirect()/notFound() both work by throwing a Next.js-internal signal
  // — deliberately called here, OUTSIDE the try/catch above, so that
  // signal is never accidentally swallowed by this function's own error
  // handling.
  if (redirectToSlug) redirect(`/platform/clinicas/${redirectToSlug}`);
  if (!clinic) notFound();

  // Estado C (active clinic_admin) has top precedence, then Estado B
  // (pending, not-yet-expired clinic_admin invitation), then Estado A
  // (neither) — see this task's own precedence rules. pendingInvitation is
  // only ever looked up once activeAdmin is confirmed null.
  //
  // Fail-closed: a real lookup failure here must never render as Estado A
  // ("no admin assigned yet") — that would be a false factual claim, not
  // just a degraded UX, and would offer a Superadmin a form to provision
  // a first admin for a clinic that may already have one. adminStateLookupFailed
  // renders a distinct "we don't know" message instead — same
  // loadFailed-boolean convention /platform/clinicas/page.tsx's own
  // listing already uses for the identical class of problem.
  let activeAdmin: Awaited<ReturnType<typeof fetchActiveClinicAdminMembership>> = null;
  let pendingInvitation: Awaited<ReturnType<typeof fetchPendingClinicAdminInvitation>> = null;
  let adminStateLookupFailed = false;
  try {
    activeAdmin = await fetchActiveClinicAdminMembership(supabase, clinic.id);
    if (!activeAdmin) {
      pendingInvitation = await fetchPendingClinicAdminInvitation(supabase, clinic.id);
    }
  } catch (error) {
    console.error("[/platform/clinicas/[slug]] admin-assignment state lookup failed", error);
    adminStateLookupFailed = true;
  }

  // Equipo general (Platform → Clínica → Equipo) — only fetched/rendered
  // once an active admin exists (Estado C); its own member roster already
  // shows that admin's identity (name/email/phone), superseding the
  // narrower single-purpose display this section used to render on its
  // own. Before an active admin exists, the bootstrap card above
  // (AssignClinicAdminCard / pending-invitation) is the ONLY
  // team-provisioning entry point — showing the general roster earlier
  // would either be empty noise or, worse, redundantly list the exact
  // same pending first-admin invitation Estado B already shows in its own
  // dedicated card, with no real CTA to add anyway (see this task's own
  // "no dupliques el CTA de provisioning inicial" rule).
  let members: Awaited<ReturnType<typeof fetchTeamMembers>> = [];
  let pendingTeamInvitations: Awaited<ReturnType<typeof fetchPendingInvitations>> = [];
  if (activeAdmin) {
    try {
      [members, pendingTeamInvitations] = await Promise.all([
        fetchTeamMembers(supabase, clinic.id),
        fetchPendingInvitations(supabase, clinic.id),
      ]);
    } catch (error) {
      console.error("[/platform/clinicas/[slug]] Equipo lookup failed", error);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <ClinicLogoDisplay clinicName={clinic.name} clinicLogoUrl={clinic.logoUrl} />
        <div>
          <h1 className="text-lg font-semibold text-foreground">{clinic.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Clínica creada el {new Date(clinic.createdAt).toLocaleDateString("es-CO")}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Información general</h2>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Razón social</dt>
              <dd className="text-foreground">{clinic.legalName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">NIT</dt>
              <dd className="text-foreground">{clinic.taxId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Email</dt>
              <dd className="text-foreground">{clinic.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Teléfono</dt>
              <dd className="text-foreground">{clinic.phone ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Sede principal</h2>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Dirección</dt>
              <dd className="text-foreground">{clinic.location?.address ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Ciudad</dt>
              <dd className="text-foreground">{clinic.location?.city ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Departamento</dt>
              <dd className="text-foreground">{clinic.location?.state ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {adminStateLookupFailed ? (
        <div className="rounded-2xl border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
          No pudimos determinar el estado del Administrador de esta clínica. Intenta de nuevo en unos minutos.
        </div>
      ) : activeAdmin ? (
        <PlatformEquipoSection
          clinicId={clinic.id}
          initialMembers={members}
          initialPendingInvitations={pendingTeamInvitations}
          canAddMembers
        />
      ) : pendingInvitation ? (
        <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Invitación pendiente</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ya existe una invitación pendiente para el Administrador de Clínica.
          </p>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Nombre</dt>
              <dd className="text-foreground">
                {pendingInvitation.firstName && pendingInvitation.lastName
                  ? `${pendingInvitation.firstName} ${pendingInvitation.lastName}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Email</dt>
              <dd className="text-foreground">{pendingInvitation.email}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Vence</dt>
              <dd className="text-foreground">{new Date(pendingInvitation.expiresAt).toLocaleDateString("es-CO")}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Por seguridad, el enlace de activación solo se muestra al momento de generarlo.
          </p>
        </div>
      ) : (
        <AssignClinicAdminCard clinicId={clinic.id} />
      )}
    </div>
  );
}
