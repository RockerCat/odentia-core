import { AppShell } from "@/components/shell/app-shell";
import { fetchClinicDetail } from "@/features/clinic/data";
import { SubscriptionScreen } from "@/features/subscription/subscription-screen";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// Mi Suscripción — Clinic Admin only ("Subscription and billing" per
// CLAUDE.md Domain Model). Server-first, same resolveClinicContext() +
// fetchClinicDetail() pattern /clinica's own page already uses — real
// clinics.status/trial_ends_at, no mock data (see this checkpoint's own
// report). src/lib/supabase/proxy.ts already gates this route on a real,
// active membership AND on the clinic not being suspended (a suspended
// clinic never reaches this page at all — it lands on
// /acceso-restringido?motivo=suspendida instead, which already explains
// why), so clinicId here always comes from the caller's own resolved
// context, never a URL/form param.
export default async function SuscripcionPage() {
  const supabase = await createClient();

  let context;
  try {
    context = await resolveClinicContext(supabase);
  } catch (error) {
    console.error("[/suscripcion] resolveClinicContext failed", error);
    return (
      <AppShell activeNavLabel="Mi Suscripción" heading="Mi Suscripción" allowedRoles={["clinic-admin"]}>
        <p className="text-sm text-muted-foreground">
          No pudimos cargar el estado de tu suscripción. Intenta de nuevo en unos minutos.
        </p>
      </AppShell>
    );
  }

  if (context.status !== "ok") {
    return (
      <AppShell activeNavLabel="Mi Suscripción" heading="Mi Suscripción" allowedRoles={["clinic-admin"]}>
        <p className="text-sm text-muted-foreground">
          No pudimos cargar el estado de tu suscripción. Intenta de nuevo en unos minutos.
        </p>
      </AppShell>
    );
  }

  let clinic;
  try {
    clinic = await fetchClinicDetail(supabase, context.clinic.id);
  } catch (error) {
    console.error("[/suscripcion] fetchClinicDetail failed", error);
    clinic = null;
  }

  return (
    <AppShell activeNavLabel="Mi Suscripción" heading="Mi Suscripción" allowedRoles={["clinic-admin"]}>
      {clinic ? (
        <SubscriptionScreen status={clinic.status} trialEndsAt={clinic.trialEndsAt} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No pudimos cargar el estado de tu suscripción. Intenta de nuevo en unos minutos.
        </p>
      )}
    </AppShell>
  );
}
