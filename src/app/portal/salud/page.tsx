import { PortalShell } from "@/components/shell/portal-shell";
import {
  fetchEncounterClinicalDataForEncounters,
  fetchPatientClinicalEncounters,
  type ClinicalEncounterRecord,
  type EncounterClinicalData,
} from "@/features/patients/clinical-encounters-data";
import { fetchPatientMedicalHistory, type PatientMedicalHistory } from "@/features/patients/medical-history-data";
import { resolveUpdatedByProfessional } from "@/features/patients/resolve-updated-by";
import { DentalHealth } from "@/features/portal/dental-health";
import { buildDentalHealthView, RECENT_ENCOUNTERS_LIMIT, type Loaded } from "@/features/portal/dental-health-data";
import { resolvePatientContext } from "@/features/session/resolve-patient-context";
import { createClient } from "@/lib/supabase/server";

// Real /portal/salud — "Mi salud dental", a short summary of the patient's
// OWN record. Same identity/scoping contract as /portal/historia:
// patient_id/clinic_id come EXCLUSIVELY from auth.uid() →
// resolvePatientContext(), never from the URL or a client prop, and every
// read is the exact same fetcher /portal/historia already uses, under the
// same patient-scoped RLS (her own rows only; finalized atenciones only).
// A failed read degrades only its own section to an error state — never
// mock/fallback content (it used to be a fully mock screen).
export default async function PortalDentalHealthPage() {
  const supabase = await createClient();
  const context = await resolvePatientContext(supabase);

  if (context.status !== "ok") {
    return (
      <PortalShell activeNavLabel="Mi salud dental" heading="Mi salud dental">
        <div className="rounded-2xl border border-border bg-background p-5 text-center text-sm text-muted-foreground shadow-sm sm:p-6">
          No pudimos cargar tu información. Intenta de nuevo en unos minutos.
        </div>
      </PortalShell>
    );
  }

  const clinicId = context.patient.clinicId;
  const patientId = context.patient.id;

  const [medicalHistory, encounters] = await Promise.all([
    fetchPatientMedicalHistory(supabase, clinicId, patientId).then(
      (value): Loaded<PatientMedicalHistory | null> => ({ status: "ok", value }),
      (error): Loaded<PatientMedicalHistory | null> => {
        console.error("[/portal/salud] fetchPatientMedicalHistory failed", error);
        return { status: "error" };
      },
    ),
    fetchPatientClinicalEncounters(supabase, clinicId, patientId).then(
      (value): Loaded<ClinicalEncounterRecord[]> => ({ status: "ok", value }),
      (error): Loaded<ClinicalEncounterRecord[]> => {
        console.error("[/portal/salud] fetchPatientClinicalEncounters failed", error);
        return { status: "error" };
      },
    ),
  ]);

  let encounterClinicalData: Loaded<Map<string, EncounterClinicalData>> = { status: "ok", value: new Map() };
  const professionalNames = new Map<string, string>();
  if (encounters.status === "ok" && encounters.value.length > 0) {
    const recent = encounters.value.slice(0, RECENT_ENCOUNTERS_LIMIT);
    try {
      encounterClinicalData = {
        status: "ok",
        value: await fetchEncounterClinicalDataForEncounters(supabase, clinicId, recent.map((e) => e.id)),
      };
    } catch (error) {
      console.error("[/portal/salud] fetchEncounterClinicalDataForEncounters failed", error);
      encounterClinicalData = { status: "error" };
    }
    // Every professional named on this screen: the recent atenciones' own
    // authors, plus the usual dentist (the latest one — already in `recent`).
    const profileIds = [...new Set(recent.map((e) => e.attendedBy).filter((id): id is string => Boolean(id)))];
    await Promise.all(
      profileIds.map(async (profileId) => {
        try {
          const professional = await resolveUpdatedByProfessional(supabase, clinicId, profileId);
          if (professional) professionalNames.set(profileId, professional.name);
        } catch (error) {
          // Unresolvable author → shown as unnamed, never invented.
          console.error("[/portal/salud] resolveUpdatedByProfessional failed", error);
        }
      }),
    );
  }

  const view = buildDentalHealthView({ medicalHistory, encounters, encounterClinicalData, professionalNames });

  return (
    <PortalShell activeNavLabel="Mi salud dental" heading="Mi salud dental">
      <DentalHealth view={view} />
    </PortalShell>
  );
}
