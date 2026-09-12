// RIPS Fase A3 — "¿Qué realizaste?": resuelve un concepto clínico natural
// (catálogo A1: clinical_concepts/clinical_concept_variants/
// clinical_cups_mappings) + la especialidad del profesional a un CUPS
// concreto, y el Servicio RIPS CONFIRMADO de la clínica (A2:
// clinic_specialty_rips_services — nunca specialty_rips_service_defaults,
// que es solo una sugerencia global, jamás configuración efectiva).
//
// Pure — no Supabase import, no fetch, mismo convenio que
// export-readiness.ts/encounter-finalize-readiness.ts: toda esta lógica
// es unit-testable sin la pantalla (grande, con Supabase) de atención.
// Resuelve ÚNICAMENTE por IDs/mappings estructurados — nunca por
// búsqueda textual ni por inferencia de nombre.

export type RipsServiceType = "consultation" | "procedure" | "unknown";

export type ClinicalConceptOption = {
  id: string;
  slug: string;
  name: string;
  requiresSpecialty: boolean;
};

export type ClinicalConceptVariantOption = {
  id: string;
  conceptId: string;
  slug: string;
  name: string;
};

// Ya resuelto contra cups_catalog (code + rips_service_type) — ver
// clinical-concept-data.ts, que hace el join real. specialtyId null =
// mapping genérico, no ligado a ninguna especialidad (mismo significado
// que en clinical_cups_mappings, A1). validFrom/validTo son fechas ISO
// ('YYYY-MM-DD', comparables lexicográficamente sin parsear) — la MISMA
// vigencia temporal que clinical_cups_mappings.valid_from/valid_to en
// Postgres, nunca solo `status = 'active'` (una fila puede estar
// 'active' y aun así no estar vigente todavía, o ya haber vencido — ver
// isMappingCurrentlyValid).
export type ClinicalCupsMappingOption = {
  conceptId: string;
  variantId: string | null;
  specialtyId: string | null;
  cupsCode: string;
  ripsServiceType: RipsServiceType;
  validFrom: string;
  validTo: string | null;
};

// Semántica inclusiva idéntica a la del RPC
// (upsert_patient_clinical_encounter, endurecimiento GAP 1):
// valid_from <= hoy AND (valid_to IS NULL OR valid_to >= hoy). Comparación
// de strings ISO 'YYYY-MM-DD' — válida porque ese formato ordena
// lexicográficamente igual que temporalmente, sin necesitar Date().
function isMappingCurrentlyValid(mapping: ClinicalCupsMappingOption, asOfDate: string): boolean {
  return mapping.validFrom <= asOfDate && (mapping.validTo === null || mapping.validTo >= asOfDate);
}

// ISO 'YYYY-MM-DD' de hoy — misma forma que valid_from/valid_to. Nunca
// llamado dentro de un test (que siempre pasa su propio asOfDate
// explícito) — solo es el default real para el uso en producción.
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Configuración CONFIRMADA de la clínica (clinic_specialty_rips_services,
// A2) — nunca specialty_rips_service_defaults.
export type ClinicSpecialtyRipsServiceOption = {
  specialtyId: string;
  grupoServiciosCode: string;
  codServicioCode: string;
};

// Concepto explícitamente excluido de esta fase — sin mapping V0
// confirmado (ver auditoría A1): nunca se ofrece en el picker "¿Qué
// realizaste?", independientemente de qué contenga clinical_cups_mappings
// en el futuro.
const EXCLUDED_CONCEPT_SLUGS = new Set(["tooth_extraction", "root_canal"]);

// Regla de no-duplicidad Ortodoncia (ver el reporte de esta fase): cuando
// la especialidad primaria del profesional es Ortodoncia, "Consulta por
// especialidad" nunca se ofrece — orthodontic_consultation/
// orthodontic_followup ya cubren ese caso explícitamente, y ambos
// resuelven al mismo CUPS 890222/890322 que "Consulta por especialidad →
// Ortodoncia" resolvería, lo que produciría dos opciones visualmente
// distintas para el mismo resultado regulatorio.
const SPECIALTY_CONSULTATION_SLUG = "specialty_consultation";
const ORTHODONTICS_SPECIALTY_NAME = "Ortodoncia";

export type AvailableClinicalConceptGroup = {
  concept: ClinicalConceptOption;
  variants: ClinicalConceptVariantOption[];
};

// "¿Qué realizaste?" — qué conceptos/variantes ofrecer en el picker,
// dados el catálogo A1 completo y la especialidad primaria del
// profesional atendiendo. Nunca devuelve tooth_extraction/root_canal.
// "Consulta por especialidad" solo aparece si la especialidad del
// profesional tiene un mapping CUPS activo confirmado para ese concepto
// (nunca se inventa), y nunca para Ortodoncia (regla de no-duplicidad).
export function getAvailableClinicalConcepts(input: {
  concepts: ClinicalConceptOption[];
  variants: ClinicalConceptVariantOption[];
  mappings: ClinicalCupsMappingOption[];
  professionalSpecialtyId: string | null;
  professionalSpecialtyName: string | null;
}): AvailableClinicalConceptGroup[] {
  const groups: AvailableClinicalConceptGroup[] = [];

  for (const concept of input.concepts) {
    if (EXCLUDED_CONCEPT_SLUGS.has(concept.slug)) continue;

    if (concept.slug === SPECIALTY_CONSULTATION_SLUG) {
      if (input.professionalSpecialtyName === ORTHODONTICS_SPECIALTY_NAME) continue;
      if (!input.professionalSpecialtyId) continue;
      const hasConfirmedMapping = input.mappings.some(
        (m) => m.conceptId === concept.id && m.specialtyId === input.professionalSpecialtyId,
      );
      if (!hasConfirmedMapping) continue;
    }

    groups.push({
      concept,
      variants: input.variants.filter((v) => v.conceptId === concept.id),
    });
  }

  return groups;
}

export type ResolvedClinicalCupsMapping = {
  cupsCode: string;
  ripsServiceType: RipsServiceType;
};

// Concepto [+ variante] [+ especialidad] → CUPS. Prefiere un mapping
// específico de la especialidad del profesional; si no existe, cae al
// mapping genérico (specialtyId null) del mismo concepto/variante — el
// mismo orden de precedencia que la propia unicidad activa de
// clinical_cups_mappings ya garantiza que nunca es ambiguo (ver A1: un
// concepto tiene O BIEN solo mappings genéricos, O BIEN solo mappings por
// especialidad — nunca mezclados para la misma variante). Devuelve null
// cuando no hay ningún mapping activo Y VIGENTE aplicable — nunca inventa
// un CUPS, y nunca acepta un mapping 'active' cuya vigencia (valid_from/
// valid_to) todavía no empezó o ya terminó — misma regla que el
// endurecimiento GAP 1 de upsert_patient_clinical_encounter. asOfDate
// (ISO 'YYYY-MM-DD') es opcional — por defecto hoy; los tests siempre lo
// pasan explícito para fijar el escenario.
export function resolveClinicalCupsMapping(input: {
  conceptId: string;
  variantId: string | null;
  specialtyId: string | null;
  mappings: ClinicalCupsMappingOption[];
  asOfDate?: string;
}): ResolvedClinicalCupsMapping | null {
  const asOfDate = input.asOfDate ?? todayIsoDate();
  const candidates = input.mappings.filter(
    (m) => m.conceptId === input.conceptId && m.variantId === input.variantId && isMappingCurrentlyValid(m, asOfDate),
  );

  const exact = candidates.find((m) => m.specialtyId === input.specialtyId);
  if (exact) return { cupsCode: exact.cupsCode, ripsServiceType: exact.ripsServiceType };

  if (input.specialtyId !== null) {
    const generic = candidates.find((m) => m.specialtyId === null);
    if (generic) return { cupsCode: generic.cupsCode, ripsServiceType: generic.ripsServiceType };
  }

  return null;
}

export type ResolvedClinicSpecialtyRipsService = {
  grupoServiciosCode: string;
  codServicioCode: string;
};

// Especialidad del profesional → Servicio RIPS CONFIRMADO por la
// clínica. Lee ÚNICAMENTE clinic_specialty_rips_services (A2) — nunca
// specialty_rips_service_defaults, que es solo una sugerencia global de
// Odentia y jamás debe convertirse en un dato RIPS efectivo de
// encounter_services (ver auditoría A2). Devuelve null cuando la clínica
// todavía no ha confirmado ninguna configuración para esta especialidad
// (o el profesional no tiene especialidad) — un CUPS resuelto SIN
// Servicio RIPS confirmado sigue siendo un estado válido: la verdad
// clínica nunca queda bloqueada por la falta de esta configuración
// administrativa (ver getEncounterFinalizeBlockers, que no depende de
// esto).
export function resolveClinicSpecialtyRipsService(input: {
  specialtyId: string | null;
  clinicServices: ClinicSpecialtyRipsServiceOption[];
}): ResolvedClinicSpecialtyRipsService | null {
  if (!input.specialtyId) return null;
  const match = input.clinicServices.find((c) => c.specialtyId === input.specialtyId);
  return match ? { grupoServiciosCode: match.grupoServiciosCode, codServicioCode: match.codServicioCode } : null;
}

export type ResolvedClinicalService = {
  cupsCode: string;
  ripsServiceType: RipsServiceType;
  mappingStatus: "resolved" | "unresolved";
  grupoServiciosCode: string | null;
  codServicioCode: string | null;
};

// Combina ambas resoluciones (CUPS y Servicio RIPS) para un concepto ya
// elegido en el picker. mappingStatus refleja ÚNICAMENTE si el CUPS se
// resolvió — la ausencia de Servicio RIPS confirmado nunca degrada
// mappingStatus a 'unresolved' (son dos causas distintas, nunca
// mezcladas — ver el reporte de esta fase).
export function resolveClinicalService(input: {
  conceptId: string;
  variantId: string | null;
  professionalSpecialtyId: string | null;
  mappings: ClinicalCupsMappingOption[];
  clinicServices: ClinicSpecialtyRipsServiceOption[];
  asOfDate?: string;
}): ResolvedClinicalService | null {
  const cups = resolveClinicalCupsMapping({
    conceptId: input.conceptId,
    variantId: input.variantId,
    specialtyId: input.professionalSpecialtyId,
    mappings: input.mappings,
    asOfDate: input.asOfDate,
  });
  if (!cups) return null;

  const ripsService = resolveClinicSpecialtyRipsService({
    specialtyId: input.professionalSpecialtyId,
    clinicServices: input.clinicServices,
  });

  return {
    cupsCode: cups.cupsCode,
    ripsServiceType: cups.ripsServiceType,
    mappingStatus: "resolved",
    grupoServiciosCode: ripsService?.grupoServiciosCode ?? null,
    codServicioCode: ripsService?.codServicioCode ?? null,
  };
}
