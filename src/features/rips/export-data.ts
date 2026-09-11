import type { SupabaseClient } from "@supabase/supabase-js";
import type { EncounterReadinessInput, EncounterReadinessService, ExportReadinessLocation, ExportReadinessPatient } from "./export-readiness";
import type {
  GeneratorDiagnosis,
  GeneratorEncounter,
  GeneratorLocation,
  GeneratorPatient,
  GeneratorProfessional,
  GeneratorService,
  RipsExportGenerationInput,
} from "./export-generator";
import { getPeriodBoundsUtc, RIPS_EXPORT_TIMEZONE, type RipsExportPeriod } from "./export-datetime";

// RIPS #5 — data loading layer. This is the ONLY file in the RIPS export
// feature that imports Supabase — readiness.ts/export-generator.ts stay
// pure (see this task's own Section 21). Loads by CONJUNTOS (one batched
// query per table, never per-encounter) — see Section 37's own
// "evita N+1" instruction.

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: RIPS_EXPORT_TIMEZONE });

export type RipsExportRawData = {
  clinicTaxId: string | null;
  locations: { id: string; name: string; codPrestador: string | null; timezone: string }[];
  // Keyed for O(1) lookup by the generator/readiness callers below.
  patients: Map<string, ExportReadinessPatient & GeneratorPatient>;
  professionals: Map<string, GeneratorProfessional & { name: string; hasDocumentIdentity: boolean }>;
  encounters: {
    encounterId: string;
    patientId: string;
    incapacityCode: string | null;
    dateLabel: string;
    diagnoses: GeneratorDiagnosis[];
    services: (GeneratorService & { professionalProfileId: string })[];
  }[];
};

// Eligibility rule (this task's own Section 4): ONLY
// patient_clinical_encounters with finalized_at IS NOT NULL, and whose
// occurred_at falls within the requested period — never derived from the
// appointment's own status (a cancelled/no-show appointment structurally
// never produces a finalized encounter in the first place — see RIPS #4's
// upsert_patient_clinical_encounter, the only write path for this table —
// and a draft, finalized_at IS NULL, is excluded by the same filter
// fetchPatientClinicalEncounters already uses for Historia Clínica).
export async function fetchRipsExportRawData(supabase: SupabaseClient, clinicId: string, period: RipsExportPeriod): Promise<RipsExportRawData> {
  const { startUtc, endUtc } = getPeriodBoundsUtc(period);

  const [clinicResult, locationsResult, encountersResult] = await Promise.all([
    supabase.from("clinics").select("tax_id").eq("id", clinicId).maybeSingle(),
    supabase.from("clinic_locations").select("id, name, cod_prestador, timezone").eq("clinic_id", clinicId).order("created_at"),
    supabase
      .from("patient_clinical_encounters")
      .select("id, patient_id, occurred_at, incapacity_code")
      .eq("clinic_id", clinicId)
      .not("finalized_at", "is", null)
      .gte("occurred_at", startUtc)
      .lt("occurred_at", endUtc)
      .order("occurred_at", { ascending: true }),
  ]);
  if (clinicResult.error) throw clinicResult.error;
  if (locationsResult.error) throw locationsResult.error;
  if (encountersResult.error) throw encountersResult.error;

  const encounterRows = encountersResult.data ?? [];
  const encounterIds = encounterRows.map((e) => e.id);

  const [diagnosesResult, servicesResult] = encounterIds.length
    ? await Promise.all([
        supabase
          .from("encounter_diagnoses")
          .select("id, encounter_id, cie10_code, role, diagnosis_type_code, encounter_service_id, sequence")
          .eq("clinic_id", clinicId)
          .in("encounter_id", encounterIds),
        supabase
          .from("encounter_services")
          .select(
            "id, encounter_id, professional_profile_id, cups_code, rips_service_type, performed_at, service_value, via_ingreso_code, modalidad_code, grupo_servicios_code, cod_servicio_code, finalidad_code, causa_motivo_code, concepto_recaudo_code, valor_pago_moderador, sequence",
          )
          .eq("clinic_id", clinicId)
          .in("encounter_id", encounterIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (diagnosesResult.error) throw diagnosesResult.error;
  if (servicesResult.error) throw servicesResult.error;

  const diagnosesByEncounter = new Map<string, GeneratorDiagnosis[]>();
  for (const row of diagnosesResult.data ?? []) {
    const list = diagnosesByEncounter.get(row.encounter_id) ?? [];
    list.push({
      cie10Code: row.cie10_code,
      role: row.role,
      diagnosisTypeCode: row.diagnosis_type_code,
      encounterServiceId: row.encounter_service_id,
      sequence: row.sequence,
    });
    diagnosesByEncounter.set(row.encounter_id, list);
  }

  const servicesByEncounter = new Map<string, (GeneratorService & { professionalProfileId: string })[]>();
  const professionalProfileIds = new Set<string>();
  for (const row of servicesResult.data ?? []) {
    professionalProfileIds.add(row.professional_profile_id);
    const list = servicesByEncounter.get(row.encounter_id) ?? [];
    list.push({
      id: row.id,
      cupsCode: row.cups_code,
      ripsServiceType: row.rips_service_type,
      performedAtUtc: row.performed_at,
      serviceValue: row.service_value,
      viaIngresoCode: row.via_ingreso_code,
      modalidadCode: row.modalidad_code,
      grupoServiciosCode: row.grupo_servicios_code,
      codServicioCode: row.cod_servicio_code,
      finalidadCode: row.finalidad_code,
      causaMotivoCode: row.causa_motivo_code,
      conceptoRecaudoCode: row.concepto_recaudo_code,
      valorPagoModerador: row.valor_pago_moderador,
      sequence: row.sequence,
      professionalProfileId: row.professional_profile_id,
    });
    servicesByEncounter.set(row.encounter_id, list);
  }

  const patientIds = Array.from(new Set(encounterRows.map((e) => e.patient_id)));
  const [patientsResult, professionalsResult] = await Promise.all([
    patientIds.length
      ? supabase
          .from("patients")
          .select(
            "id, first_name, last_name, document_type, document_number, birth_date, sex_code, user_type_code, country_of_residence_code, municipality_of_residence_code, residence_zone_code, country_of_origin_code",
          )
          .eq("clinic_id", clinicId)
          .in("id", patientIds)
      : { data: [], error: null },
    professionalProfileIds.size
      ? supabase
          .from("professional_profiles")
          .select("id, document_type, document_number, clinic_membership_id, clinic_memberships!inner(profile_id)")
          .eq("clinic_id", clinicId)
          .in("id", Array.from(professionalProfileIds))
      : { data: [], error: null },
  ]);
  if (patientsResult.error) throw patientsResult.error;
  if (professionalsResult.error) throw professionalsResult.error;

  const profileIds = (professionalsResult.data ?? []).map((p: { clinic_memberships: { profile_id: string } | { profile_id: string }[] }) => {
    const membership = Array.isArray(p.clinic_memberships) ? p.clinic_memberships[0] : p.clinic_memberships;
    return membership?.profile_id;
  }).filter((id): id is string => Boolean(id));
  const profilesResult = profileIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name").in("id", profileIds)
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;
  const profileNameById = new Map((profilesResult.data ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]));

  const patients = new Map<string, ExportReadinessPatient & GeneratorPatient>();
  for (const row of patientsResult.data ?? []) {
    const patientName = `${row.first_name} ${row.last_name}`.trim();
    patients.set(row.id, {
      patientId: row.id,
      patientName,
      documentType: row.document_type ?? "",
      documentNumber: row.document_number ?? "",
      birthDate: row.birth_date ?? "",
      sexCode: row.sex_code ?? "",
      userTypeCode: row.user_type_code ?? "",
      countryOfResidenceCode: row.country_of_residence_code ?? "",
      municipalityOfResidenceCode: row.municipality_of_residence_code,
      residenceZoneCode: row.residence_zone_code,
      countryOfOriginCode: row.country_of_origin_code,
    });
  }

  const professionals = new Map<string, GeneratorProfessional & { name: string; hasDocumentIdentity: boolean }>();
  for (const row of professionalsResult.data ?? []) {
    const membership = Array.isArray(row.clinic_memberships) ? row.clinic_memberships[0] : row.clinic_memberships;
    const name = membership?.profile_id ? (profileNameById.get(membership.profile_id) ?? "Sin nombre") : "Sin nombre";
    professionals.set(row.id, {
      professionalProfileId: row.id,
      documentType: row.document_type ?? "",
      documentNumber: row.document_number ?? "",
      name,
      hasDocumentIdentity: Boolean(row.document_type && row.document_number),
    });
  }

  const encounters = encounterRows.map((row) => ({
    encounterId: row.id,
    patientId: row.patient_id,
    incapacityCode: row.incapacity_code,
    dateLabel: DATE_LABEL_FORMATTER.format(new Date(row.occurred_at)),
    diagnoses: diagnosesByEncounter.get(row.id) ?? [],
    services: servicesByEncounter.get(row.id) ?? [],
  }));

  return {
    clinicTaxId: clinicResult.data?.tax_id ?? null,
    locations: (locationsResult.data ?? []).map((l) => ({ id: l.id, name: l.name, codPrestador: l.cod_prestador, timezone: l.timezone })),
    patients,
    professionals,
    encounters,
  };
}

// ---------------------------------------------------------------------
// Adapters: raw data → the shapes readiness.ts/export-generator.ts expect.
// Kept here (not inside those pure modules) since they're a thin,
// DB-shape-aware translation step, not business logic.
// ---------------------------------------------------------------------
export function toEncounterReadinessInputs(raw: RipsExportRawData): EncounterReadinessInput[] {
  return raw.encounters.map((e) => {
    const patient = raw.patients.get(e.patientId);
    const services: EncounterReadinessService[] = e.services.map((s) => ({
      ...s,
      professionalHasDocumentIdentity: raw.professionals.get(s.professionalProfileId)?.hasDocumentIdentity ?? false,
    }));
    return {
      encounterId: e.encounterId,
      patientId: e.patientId,
      patientName: patient?.patientName ?? "Sin nombre",
      encounterDateLabel: e.dateLabel,
      incapacityCode: e.incapacityCode,
      diagnoses: e.diagnoses,
      services,
    };
  });
}

export function toExportReadinessLocations(raw: RipsExportRawData): ExportReadinessLocation[] {
  return raw.locations.map((l) => ({ id: l.id, name: l.name, codPrestador: l.codPrestador }));
}

export function toExportReadinessPatients(raw: RipsExportRawData): ExportReadinessPatient[] {
  return Array.from(raw.patients.values()).map((p) => ({
    patientId: p.patientId,
    patientName: p.patientName,
    documentType: p.documentType || null,
    documentNumber: p.documentNumber || null,
    birthDate: p.birthDate || null,
    sexCode: p.sexCode || null,
    userTypeCode: p.userTypeCode || null,
    countryOfResidenceCode: p.countryOfResidenceCode || null,
    municipalityOfResidenceCode: p.municipalityOfResidenceCode,
    residenceZoneCode: p.residenceZoneCode,
  }));
}

// Only called once readiness.ready === true — assumes every value it
// reads is actually present (readiness is what guarantees that), same
// convention as buildRipsSinFacturaTransaction's own assumption.
export function toGeneratorInput(raw: RipsExportRawData, numDocumentoIdObligado: string, location: GeneratorLocation): RipsExportGenerationInput {
  const encounters: GeneratorEncounter[] = raw.encounters.map((e) => ({
    encounterId: e.encounterId,
    patientId: e.patientId,
    incapacityCode: e.incapacityCode ?? "",
    diagnoses: e.diagnoses,
    services: e.services,
  }));
  const patientsById = new Map<string, GeneratorPatient>();
  for (const [id, p] of raw.patients) patientsById.set(id, p);
  const professionalsById = new Map<string, GeneratorProfessional>();
  for (const [id, p] of raw.professionals) professionalsById.set(id, p);
  return { numDocumentoIdObligado, location, encounters, patientsById, professionalsById };
}

export { getPeriodBoundsUtc };
