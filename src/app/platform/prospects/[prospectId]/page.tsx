import { notFound } from "next/navigation";
import { ProspectStatusActions } from "@/components/platform/prospect-status-actions";
import { fetchCommercialProspectById, looksLikeCommercialProspectId } from "@/features/commercial-prospects/platform-data";
import { createClient } from "@/lib/supabase/server";

// Real Platform → Prospectos detail. Read-only identity/contact (no
// "editar prospecto" here — see CLAUDE.md's Prospecto Comercial section);
// the only mutation this screen offers is the status transition, via
// ProspectStatusActions. Never shows a "Convertir en clínica" action yet
// — that's a separate, later checkpoint, even once status is `won`.
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
    </div>
  );
}
