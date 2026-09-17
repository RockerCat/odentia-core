import Link from "next/link";
import { ClinicLogoThumbnail } from "@/components/platform/clinic-logo-thumbnail";
import { fetchPlatformClinics } from "@/features/platform/clinics-data";
import { createClient } from "@/lib/supabase/server";

// Real Platform clinics listing — every clinic in the system, read
// directly via clinics/clinic_locations under RLS's own
// is_platform_superadmin() branch (see fetchPlatformClinics' own
// comment) — no mock data, no invented KPIs (patient counts, revenue,
// activity). Server-first, same pattern as /agenda's own page.
export default async function PlatformClinicsPage() {
  const supabase = await createClient();

  let clinics: Awaited<ReturnType<typeof fetchPlatformClinics>> = [];
  let loadFailed = false;
  try {
    clinics = await fetchPlatformClinics(supabase);
  } catch (error) {
    console.error("[/platform/clinicas] fetchPlatformClinics failed", error);
    loadFailed = true;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Clínicas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Clínicas reales registradas en Odentia.</p>
        </div>
        <Link
          href="/platform/clinicas/nueva"
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Nueva clínica
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        {loadFailed ? (
          <p className="p-6 text-sm text-muted-foreground">No pudimos cargar las clínicas. Intenta de nuevo en unos minutos.</p>
        ) : clinics.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Todavía no hay clínicas registradas. Usa &quot;Nueva clínica&quot; para crear la primera.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-wide text-label-foreground uppercase">
                <th className="px-6 py-3">Clínica</th>
                <th className="px-6 py-3">Ciudad</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3">Creada</th>
              </tr>
            </thead>
            <tbody>
              {clinics.map((clinic) => (
                <tr key={clinic.id} className="border-b border-border last:border-0 hover:bg-foreground/5">
                  <td className="px-6 py-3">
                    <Link
                      href={`/platform/clinicas/${clinic.slug}`}
                      className="flex items-center gap-3 font-medium text-foreground hover:underline"
                    >
                      <ClinicLogoThumbnail logoUrl={clinic.logoUrl} name={clinic.name} sizeClassName="size-8" />
                      {clinic.name}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">{clinic.city ?? "—"}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                        clinic.status === "active"
                          ? "border-success/25 bg-success/10 text-success"
                          : "border-danger/25 bg-danger/10 text-danger"
                      }`}
                    >
                      {clinic.status === "active" ? "Activa" : "Suspendida"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {new Date(clinic.createdAt).toLocaleDateString("es-CO")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
