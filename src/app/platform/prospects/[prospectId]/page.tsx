import { notFound } from "next/navigation";
import { ProspectConversionSection } from "@/components/platform/prospect-conversion-section";
import { ProspectStatusActions } from "@/components/platform/prospect-status-actions";
import { fetchCommercialProspectById, looksLikeCommercialProspectId } from "@/features/commercial-prospects/platform-data";
import { fetchPlatformClinicById } from "@/features/platform/clinics-data";
import { createClient } from "@/lib/supabase/server";

// Real Platform → Prospectos detail. Read-only identity/contact (no
// "editar prospecto" here — see CLAUDE.md's Prospecto Comercial section);
// status transitions live in ProspectStatusActions. Once `status ===
// 'won'`, ProspectConversionSection additionally offers the separate,
// optional "Crear clínica" operational action (or, once converted, a
// link to the resulting clinic) — never shown for any other status, and
// never itself a commercial-status transition.
export default async function PlatformProspectDetailPage({ params }: { params: Promise<{ prospectId: string }> }) {
  const { prospectId } = await params;
  if (!looksLikeCommercialProspectId(prospectId)) notFound();

  const supabase = await createClient();

  let prospect: Awaited<ReturnType<typeof fetchCommercialProspectById>> = null;
  try {
    prospect = await fetchCommercialProspectById(supabase, prospectId);
  } catch (error) {
    console.error("[/platform/prospects/[prospectId]] fetchCommercialProspectById failed", error);
  }

  if (!prospect) notFound();

  // Only ever looked up once this prospect already has a linked clinic —
  // fetchPlatformClinicById() is the same real, already-audited Platform
  // read /platform/clinicas/[slug] itself uses for a UUID-shaped
  // fallback lookup; reused here unmodified rather than a second clinic
  // fetcher.
  let convertedClinic: Awaited<ReturnType<typeof fetchPlatformClinicById>> = null;
  if (prospect.convertedClinicId) {
    try {
      convertedClinic = await fetchPlatformClinicById(supabase, prospect.convertedClinicId);
    } catch (error) {
      console.error("[/platform/prospects/[prospectId]] fetchPlatformClinicById failed", error);
    }
  }

  // wa.me deep-link — same convention as every other real WhatsApp link
  // in this codebase (e.g. src/features/patients/patient-record-modal.tsx),
  // never a WhatsApp Business API integration and never an automated
  // send (see CLAUDE.md's Communications section).
  const whatsappHref = `https://wa.me/${prospect.phone.replace(/[^\d]/g, "")}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          {prospect.firstName} {prospect.lastName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Solicitud recibida el {new Date(prospect.createdAt).toLocaleDateString("es-CO")}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Información</h2>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Clínica</dt>
              <dd className="text-foreground">{prospect.clinicName}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Ciudad</dt>
              <dd className="text-foreground">{prospect.city}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Email</dt>
              <dd className="text-foreground">
                <a href={`mailto:${prospect.email}`} className="text-primary hover:underline">
                  {prospect.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-label-foreground uppercase">Teléfono / WhatsApp</dt>
              <dd className="text-foreground">
                <a href={whatsappHref} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {prospect.phone}
                </a>
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Estado comercial</h2>
          <div className="mt-4">
            <ProspectStatusActions prospectId={prospect.id} initialStatus={prospect.status} />
          </div>
        </div>
      </div>

      {prospect.status === "won" && (
        <ProspectConversionSection
          prospectId={prospect.id}
          defaultClinicName={prospect.clinicName}
          defaultCity={prospect.city}
          contactName={`${prospect.firstName} ${prospect.lastName}`}
          contactEmail={prospect.email}
          contactPhone={prospect.phone}
          initialConvertedAt={prospect.convertedAt}
          initialConvertedClinicId={prospect.convertedClinicId}
          initialConvertedClinic={convertedClinic ? { slug: convertedClinic.slug, name: convertedClinic.name } : null}
        />
      )}
    </div>
  );
}
