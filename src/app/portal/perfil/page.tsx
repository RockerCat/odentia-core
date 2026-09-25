import { PortalShell } from "@/components/shell/portal-shell";
import { fetchPatientClinicalEncounters } from "@/features/patients/clinical-encounters-data";
import { usualDentistProfileIdFrom } from "@/features/patients/usual-dentist";
import { teamCards } from "@/features/portal/clinic-profile";
import { fetchMyClinicTeam } from "@/features/portal/clinic-team-data";
import { MyProfile } from "@/features/portal/my-profile";
import type { MyProfileCardData } from "@/features/portal/my-profile-card";
import { findReferenceValueByCode } from "@/features/rips/catalog-data";
import { resolvePatientContext } from "@/features/session/resolve-patient-context";
import { createClient } from "@/lib/supabase/server";

// Real identity — src/lib/supabase/proxy.ts has already gated this route
// (a real Patient with a valid link), so context.status is "ok" here in
// practice; MyProfile itself renders an honest fallback if somehow not,
// never the old mock CURRENT_PATIENT.
//
// "Mi clínica" → "Tu odontólogo habitual": the SAME rule and sources as
// /portal/clinica (usual-dentist.ts over her own finalized atenciones,
// matched against get_my_clinic_team()) — never a second definition. Any
// failure just omits that row; the document label falls back to the code.
export default async function PortalProfilePage() {
  const supabase = await createClient();
  const context = await resolvePatientContext(supabase);

  let documentTypeLabel: string | null = null;
  let usualDentist: MyProfileCardData["usualDentist"] = null;
  if (context.status === "ok") {
    const { patient, clinic } = context;
    const [label, teamRows, usualDentistProfileId] = await Promise.all([
      patient.documentType ? findReferenceValueByCode("TipoDocumento", patient.documentType).then((v) => v?.label ?? null) : null,
      fetchMyClinicTeam(supabase).catch((error) => {
        console.error("[/portal/perfil] fetchMyClinicTeam failed", error);
        return null;
      }),
      fetchPatientClinicalEncounters(supabase, clinic.id, patient.id).then(usualDentistProfileIdFrom, (error) => {
        console.error("[/portal/perfil] fetchPatientClinicalEncounters failed", error);
        return null;
      }),
    ]);
    documentTypeLabel = label;
    const card = teamRows ? teamCards(teamRows, clinic.id, usualDentistProfileId).find((c) => c.isUsualDentist) : undefined;
    if (card) usualDentist = { name: card.name, specialty: card.specialty, avatarUrl: card.avatarUrl ?? null };
  }

  return (
    <PortalShell activeNavLabel="Mi perfil" heading="Mi perfil">
      <MyProfile context={context} documentTypeLabel={documentTypeLabel} usualDentist={usualDentist} />
    </PortalShell>
  );
}
