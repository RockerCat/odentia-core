import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { fetchClinicalEncounterById, fetchEncounterServices } from "@/features/patients/clinical-encounters-data";
import { fetchPatientById } from "@/features/patients/data";
import { findCupsByCode, getActiveReferenceValues } from "@/features/rips/catalog-data";
import { EncounterRipsCorrectionScreen } from "@/features/rips/encounter-rips-correction-screen";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// RIPS "Corregir" destination for ENCOUNTER_INCAPACITY_MISSING/
// SERVICE_VALUE_MISSING (see export-readiness.ts's own fixHref) — a
// narrow, RIPS-only correction for ONE already-finalized encounter, never
// the full clinical encounter screen (see
// correct_finalized_encounter_rips_gaps's own migration comment on why:
// historia clínica must stay immutable once finalized, only these two
// administrative RIPS facts are ever editable here). Clinic Admin only,
// same gate as /rips itself — never is_active_clinical_professional(),
// see that migration's own comment.
export default async function EncounterRipsCorrectionPage({ params }: { params: Promise<{ encounterId: string }> }) {
  const { encounterId } = await params;
  const supabase = await createClient();

  let context;
  try {
    context = await resolveClinicContext(supabase);
  } catch (error) {
    console.error("[/rips/atencion] resolveClinicContext failed", error);
    notFound();
  }
  if (context.status !== "ok") notFound();
  if (context.membership.role !== "clinic_admin") notFound();

  const clinicId = context.clinic.id;
  const encounter = await fetchClinicalEncounterById(supabase, clinicId, encounterId);
  if (!encounter) notFound();
  // A draft (never finalized) has no readiness entry pointing here in the
  // first place — direct/bookmarked URL only. correct_finalized_encounter_rips_gaps
  // would refuse it too; 404 early instead of rendering a form that can
  // only fail on submit.
  if (!encounter.finalizedAt) notFound();

  const [patient, services, incapacityOptions] = await Promise.all([
    fetchPatientById(supabase, clinicId, encounter.patientId),
    fetchEncounterServices(supabase, clinicId, encounterId),
    getActiveReferenceValues("LstSiNo"),
  ]);
  if (!patient) notFound();

  const consultationsMissingValue = services.filter((s) => s.ripsServiceType === "consultation" && s.serviceValue == null);
  const cupsDescriptions = await Promise.all(consultationsMissingValue.map((s) => findCupsByCode(s.cupsCode)));

  const patientName = `${patient.firstName} ${patient.lastName}`.trim();

  return (
    <AppShell activeNavLabel="RIPS" heading="Corregir atención" allowedRoles={["clinic-admin"]}>
      <EncounterRipsCorrectionScreen
        encounterId={encounter.id}
        patientName={patientName}
        occurredAt={encounter.occurredAt}
        incapacityCode={encounter.incapacityCode}
        incapacityOptions={incapacityOptions}
        consultationsMissingValue={consultationsMissingValue.map((s, index) => ({
          serviceId: s.id,
          cupsCode: s.cupsCode,
          description: cupsDescriptions[index]?.description ?? null,
        }))}
      />
    </AppShell>
  );
}
