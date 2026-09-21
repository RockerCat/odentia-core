import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateLabel } from "@/features/dashboard/real-format";
import { findReferenceValueByCode } from "./catalog-data";
import { fetchClinicSpecialtyRipsServices } from "./clinical-concept-data";

// RIPS Fase A4B — read-only context for "Completar Servicio RIPS"
// (CompleteEncounterRipsServiceModal). Reuses fetchClinicSpecialtyRipsServices
// (A2/A3, already the ONLY effective-config read — never
// specialty_rips_service_defaults) and findReferenceValueByCode (already
// the generic reference-catalog label lookup) rather than inventing a
// second repository layer. Tenant safety here is defense-in-depth only —
// the real boundary is each table's own RLS (*_select_member) plus the
// caller's own clinic_id filter, exactly like every other /rips read;
// the actual WRITE (apply_confirmed_specialty_rips_service_to_encounter)
// re-derives and re-checks everything itself server-side regardless of
// what this helper ever returned.
//
// Never modifies anything — a plain read, same convention as every other
// *-data.ts file in this feature.

export type EncounterRipsServiceGapService = {
  id: string;
  cupsCode: string;
  clinicalConceptNameSnapshot: string | null;
  // Always null in practice (RIPS_SERVICE_CONFIGURATION_MISSING only ever
  // fires for a row where both are null) — read honestly from the real
  // row rather than assumed, so the UI never has to guess.
  grupoServiciosCode: string | null;
  codServicioCode: string | null;
};

export type EncounterRipsServiceGapContext = {
  encounterId: string;
  patientName: string;
  encounterDateLabel: string;
  professionalName: string | null;
  specialtyId: string | null;
  specialtyName: string | null;
  services: EncounterRipsServiceGapService[];
  // Null when the specialty has no CURRENTLY confirmed+active
  // clinic_specialty_rips_services row — the modal must render the
  // honest "sin confirmar" state, never a global default, never a stale
  // value the client happened to fetch earlier.
  effectiveConfig: { grupoServiciosCode: string; codServicioCode: string; grupoLabel: string; servicioLabel: string } | null;
};

export async function fetchEncounterRipsServiceGapContext(
  supabase: SupabaseClient,
  clinicId: string,
  encounterId: string,
): Promise<EncounterRipsServiceGapContext | null> {
  const encounterResult = await supabase
    .from("patient_clinical_encounters")
    .select("id, patient_id, occurred_at")
    .eq("id", encounterId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (encounterResult.error || !encounterResult.data) return null;
  const encounter = encounterResult.data;

  const [patientResult, servicesResult] = await Promise.all([
    supabase.from("patients").select("first_name, last_name").eq("id", encounter.patient_id).eq("clinic_id", clinicId).maybeSingle(),
    supabase
      .from("encounter_services")
      .select("id, cups_code, clinical_concept_name_snapshot, grupo_servicios_code, cod_servicio_code, professional_profile_id")
      .eq("encounter_id", encounterId)
      .eq("clinic_id", clinicId)
      // Same eligibility shape as RIPS_SERVICE_CONFIGURATION_MISSING/the
      // RPC's own selection (widened 2026-09-21 to also cover manual-CUPS
      // rows, which now resolve Grupo/Servicio the same way a
      // concept-based row does) — only an already-configured row is
      // excluded.
      .is("cod_servicio_code", null),
  ]);
  if (servicesResult.error || !servicesResult.data) return null;

  const services: EncounterRipsServiceGapService[] = servicesResult.data.map((row) => ({
    id: row.id,
    cupsCode: row.cups_code,
    clinicalConceptNameSnapshot: row.clinical_concept_name_snapshot,
    grupoServiciosCode: row.grupo_servicios_code,
    codServicioCode: row.cod_servicio_code,
  }));

  // Every service in ONE encounter shares the exact same
  // professional_profile_id (no co-atención support — see CLAUDE.md's own
  // "Profesional del servicio realizado") — resolved once, from whichever
  // eligible service happens to be first, never re-derived per row.
  const professionalProfileId = servicesResult.data[0]?.professional_profile_id ?? null;

  let professionalName: string | null = null;
  let specialtyId: string | null = null;
  let specialtyName: string | null = null;

  if (professionalProfileId) {
    const professionalResult = await supabase
      .from("professional_profiles")
      .select("clinic_membership_id, specialties:primary_specialty_id(id, name)")
      .eq("id", professionalProfileId)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (professionalResult.data) {
      const specialtyRow = Array.isArray(professionalResult.data.specialties)
        ? professionalResult.data.specialties[0]
        : professionalResult.data.specialties;
      specialtyId = specialtyRow?.id ?? null;
      specialtyName = specialtyRow?.name ?? null;

      const membershipId = professionalResult.data.clinic_membership_id;
      const membershipResult = await supabase
        .from("clinic_memberships")
        .select("profile_id")
        .eq("id", membershipId)
        .maybeSingle();
      if (membershipResult.data) {
        const profileResult = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", membershipResult.data.profile_id)
          .maybeSingle();
        if (profileResult.data) {
          professionalName = `${profileResult.data.first_name} ${profileResult.data.last_name}`.trim();
        }
      }
    }
  }

  let effectiveConfig: EncounterRipsServiceGapContext["effectiveConfig"] = null;
  if (specialtyId) {
    // The ONLY effective-config read — clinic_specialty_rips_services,
    // never specialty_rips_service_defaults (that table is not even
    // imported here).
    const confirmedServices = await fetchClinicSpecialtyRipsServices(clinicId);
    const confirmed = confirmedServices.find((c) => c.specialtyId === specialtyId);
    if (confirmed) {
      const [grupoRef, servicioRef] = await Promise.all([
        findReferenceValueByCode("GrupoServicios", confirmed.grupoServiciosCode),
        findReferenceValueByCode("Servicios", confirmed.codServicioCode),
      ]);
      effectiveConfig = {
        grupoServiciosCode: confirmed.grupoServiciosCode,
        codServicioCode: confirmed.codServicioCode,
        grupoLabel: grupoRef?.label ?? confirmed.grupoServiciosCode,
        servicioLabel: servicioRef?.label ?? confirmed.codServicioCode,
      };
    }
  }

  return {
    encounterId,
    patientName: patientResult.data ? `${patientResult.data.first_name} ${patientResult.data.last_name}`.trim() : "",
    encounterDateLabel: formatDateLabel(encounter.occurred_at),
    professionalName,
    specialtyId,
    specialtyName,
    services,
    effectiveConfig,
  };
}
