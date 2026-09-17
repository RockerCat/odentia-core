import { ProspectsTable } from "@/components/platform/prospects-table";
import { fetchCommercialProspects } from "@/features/commercial-prospects/platform-data";
import { createClient } from "@/lib/supabase/server";

// Real Platform → Prospectos listing — every Prospecto Comercial
// submitted through /demo's real public form (see
// src/features/commercial-prospects/), read directly under
// commercial_prospects_select_superadmin (RLS, Superadmin-only — see
// that table's own migration). This checkpoint only lists/searches/
// filters/opens detail; it never converts a prospect into a clinic (see
// CLAUDE.md's Prospecto Comercial section — that stays a separate,
// later, explicit Superadmin action).
export default async function PlatformProspectsPage() {
  const supabase = await createClient();

  let prospects: Awaited<ReturnType<typeof fetchCommercialProspects>> = [];
  let loadFailed = false;
  try {
    prospects = await fetchCommercialProspects(supabase);
  } catch (error) {
    console.error("[/platform/prospects] fetchCommercialProspects failed", error);
    loadFailed = true;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Prospectos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Solicitudes comerciales reales enviadas desde el landing público.
        </p>
      </div>

      {loadFailed ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-background p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">No pudimos cargar los prospectos. Intenta de nuevo en unos minutos.</p>
        </div>
      ) : (
        <ProspectsTable prospects={prospects} />
      )}
    </div>
  );
}
