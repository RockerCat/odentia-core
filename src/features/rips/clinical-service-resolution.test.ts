import { describe, expect, it } from "vitest";
import {
  getAvailableClinicalConcepts,
  resolveClinicalCupsMapping,
  resolveClinicSpecialtyRipsService,
  resolveClinicalService,
  type ClinicalConceptOption,
  type ClinicalConceptVariantOption,
  type ClinicalCupsMappingOption,
  type ClinicSpecialtyRipsServiceOption,
} from "./clinical-service-resolution";

// Fixtures mirror A1's actual confirmed seed
// (20260912120000_create_clinical_concept_catalog_v0.sql) — same 8
// concepts, 10 variants, 17 mappings this task's own context already
// validated as applied in remote. Never re-derives them from scratch;
// this is the same data, just typed for the pure resolver.

const SPECIALTY_ENDODONCIA = "specialty-endodoncia";
const SPECIALTY_ODONTOPEDIATRIA = "specialty-odontopediatria";
const SPECIALTY_PERIODONCIA = "specialty-periodoncia";
const SPECIALTY_ORTODONCIA = "specialty-ortodoncia";
const SPECIALTY_GENERAL = "specialty-general";
const SPECIALTY_CIRUGIA = "specialty-cirugia"; // no confirmed mapping

const CONCEPTS: ClinicalConceptOption[] = [
  { id: "general_consultation", slug: "general_consultation", name: "Consulta de odontología general", requiresSpecialty: false },
  { id: "specialty_consultation", slug: "specialty_consultation", name: "Consulta de especialidad", requiresSpecialty: true },
  { id: "dental_cleaning", slug: "dental_cleaning", name: "Limpieza dental", requiresSpecialty: false },
  { id: "teeth_whitening", slug: "teeth_whitening", name: "Blanqueamiento dental", requiresSpecialty: false },
  { id: "tooth_extraction", slug: "tooth_extraction", name: "Extracción dental", requiresSpecialty: false },
  { id: "root_canal", slug: "root_canal", name: "Tratamiento de conductos", requiresSpecialty: false },
  { id: "orthodontic_consultation", slug: "orthodontic_consultation", name: "Consulta de ortodoncia", requiresSpecialty: false },
  { id: "orthodontic_followup", slug: "orthodontic_followup", name: "Control de ortodoncia", requiresSpecialty: false },
];

const VARIANTS: ClinicalConceptVariantOption[] = [
  { id: "general-first", conceptId: "general_consultation", slug: "first_visit", name: "Primera vez" },
  { id: "general-followup", conceptId: "general_consultation", slug: "follow_up", name: "Control" },
  { id: "specialty-first", conceptId: "specialty_consultation", slug: "first_visit", name: "Primera vez" },
  { id: "specialty-followup", conceptId: "specialty_consultation", slug: "follow_up", name: "Control" },
  { id: "cleaning-prophylaxis", conceptId: "dental_cleaning", slug: "prophylaxis", name: "Profilaxis / pulido" },
  { id: "cleaning-supra", conceptId: "dental_cleaning", slug: "supragingival_scaling", name: "Detartraje supragingival" },
  { id: "cleaning-sub", conceptId: "dental_cleaning", slug: "subgingival_scaling", name: "Detartraje subgingival" },
  { id: "whitening-extrinsic", conceptId: "teeth_whitening", slug: "extrinsic", name: "Extrínseco" },
  { id: "ortho-followup-assessment", conceptId: "orthodontic_followup", slug: "assessment_only", name: "Solo valoración" },
  { id: "ortho-followup-adjustment", conceptId: "orthodontic_followup", slug: "appliance_adjustment", name: "Ajuste de aparatología" },
];

// validFrom/validTo added uniformly via .map() below (2020-01-01 / null —
// always vigente regardless of "today") rather than repeating both fields
// on all 17 literal rows; the dedicated "vigencia temporal" describe block
// further down builds its own small fixtures with explicit dates instead.
const MAPPINGS: ClinicalCupsMappingOption[] = (
  [
  { conceptId: "general_consultation", variantId: "general-first", specialtyId: null, cupsCode: "890203", ripsServiceType: "consultation" },
  { conceptId: "general_consultation", variantId: "general-followup", specialtyId: null, cupsCode: "890303", ripsServiceType: "consultation" },
  { conceptId: "specialty_consultation", variantId: "specialty-first", specialtyId: SPECIALTY_ENDODONCIA, cupsCode: "890218", ripsServiceType: "consultation" },
  { conceptId: "specialty_consultation", variantId: "specialty-followup", specialtyId: SPECIALTY_ENDODONCIA, cupsCode: "890318", ripsServiceType: "consultation" },
  { conceptId: "specialty_consultation", variantId: "specialty-first", specialtyId: SPECIALTY_ODONTOPEDIATRIA, cupsCode: "890220", ripsServiceType: "consultation" },
  { conceptId: "specialty_consultation", variantId: "specialty-followup", specialtyId: SPECIALTY_ODONTOPEDIATRIA, cupsCode: "890320", ripsServiceType: "consultation" },
  { conceptId: "specialty_consultation", variantId: "specialty-first", specialtyId: SPECIALTY_PERIODONCIA, cupsCode: "890221", ripsServiceType: "consultation" },
  { conceptId: "specialty_consultation", variantId: "specialty-followup", specialtyId: SPECIALTY_PERIODONCIA, cupsCode: "890321", ripsServiceType: "consultation" },
  { conceptId: "specialty_consultation", variantId: "specialty-first", specialtyId: SPECIALTY_ORTODONCIA, cupsCode: "890222", ripsServiceType: "consultation" },
  { conceptId: "specialty_consultation", variantId: "specialty-followup", specialtyId: SPECIALTY_ORTODONCIA, cupsCode: "890322", ripsServiceType: "consultation" },
  { conceptId: "dental_cleaning", variantId: "cleaning-prophylaxis", specialtyId: null, cupsCode: "997001", ripsServiceType: "procedure" },
  { conceptId: "dental_cleaning", variantId: "cleaning-supra", specialtyId: null, cupsCode: "997301", ripsServiceType: "procedure" },
  { conceptId: "dental_cleaning", variantId: "cleaning-sub", specialtyId: null, cupsCode: "240201", ripsServiceType: "procedure" },
  { conceptId: "teeth_whitening", variantId: "whitening-extrinsic", specialtyId: null, cupsCode: "237903", ripsServiceType: "procedure" },
  { conceptId: "orthodontic_consultation", variantId: null, specialtyId: null, cupsCode: "890222", ripsServiceType: "consultation" },
  { conceptId: "orthodontic_followup", variantId: "ortho-followup-assessment", specialtyId: null, cupsCode: "890322", ripsServiceType: "consultation" },
  { conceptId: "orthodontic_followup", variantId: "ortho-followup-adjustment", specialtyId: null, cupsCode: "893106", ripsServiceType: "procedure" },
  ] as Omit<ClinicalCupsMappingOption, "validFrom" | "validTo">[]
).map((m) => ({ ...m, validFrom: "2020-01-01", validTo: null }));

// A2 — configuración CONFIRMADA de la clínica (nunca defaults).
const CLINIC_SERVICES_CONFIRMED: ClinicSpecialtyRipsServiceOption[] = [
  { specialtyId: SPECIALTY_GENERAL, grupoServiciosCode: "01", codServicioCode: "334" },
  { specialtyId: SPECIALTY_ENDODONCIA, grupoServiciosCode: "01", codServicioCode: "311" },
];

describe("resolveClinicalCupsMapping", () => {
  it("resolves general first-visit to 890203", () => {
    expect(resolveClinicalCupsMapping({ conceptId: "general_consultation", variantId: "general-first", specialtyId: null, mappings: MAPPINGS }))
      .toEqual({ cupsCode: "890203", ripsServiceType: "consultation" });
  });

  it("resolves general follow-up to 890303", () => {
    expect(resolveClinicalCupsMapping({ conceptId: "general_consultation", variantId: "general-followup", specialtyId: null, mappings: MAPPINGS }))
      .toEqual({ cupsCode: "890303", ripsServiceType: "consultation" });
  });

  it("resolves specialty consultation first-visit for Endodoncia to 890218", () => {
    expect(
      resolveClinicalCupsMapping({ conceptId: "specialty_consultation", variantId: "specialty-first", specialtyId: SPECIALTY_ENDODONCIA, mappings: MAPPINGS }),
    ).toEqual({ cupsCode: "890218", ripsServiceType: "consultation" });
  });

  it("resolves cleaning prophylaxis to 997001", () => {
    expect(resolveClinicalCupsMapping({ conceptId: "dental_cleaning", variantId: "cleaning-prophylaxis", specialtyId: null, mappings: MAPPINGS }))
      .toEqual({ cupsCode: "997001", ripsServiceType: "procedure" });
  });

  it("resolves cleaning supragingival to 997301", () => {
    expect(resolveClinicalCupsMapping({ conceptId: "dental_cleaning", variantId: "cleaning-supra", specialtyId: null, mappings: MAPPINGS }))
      .toEqual({ cupsCode: "997301", ripsServiceType: "procedure" });
  });

  it("resolves cleaning subgingival to 240201", () => {
    expect(resolveClinicalCupsMapping({ conceptId: "dental_cleaning", variantId: "cleaning-sub", specialtyId: null, mappings: MAPPINGS }))
      .toEqual({ cupsCode: "240201", ripsServiceType: "procedure" });
  });

  it("resolves whitening extrinsic to 237903", () => {
    expect(resolveClinicalCupsMapping({ conceptId: "teeth_whitening", variantId: "whitening-extrinsic", specialtyId: null, mappings: MAPPINGS }))
      .toEqual({ cupsCode: "237903", ripsServiceType: "procedure" });
  });

  it("resolves orthodontic_consultation (no variant) to 890222 consultation", () => {
    expect(resolveClinicalCupsMapping({ conceptId: "orthodontic_consultation", variantId: null, specialtyId: null, mappings: MAPPINGS }))
      .toEqual({ cupsCode: "890222", ripsServiceType: "consultation" });
  });

  it("resolves orthodontic_followup assessment_only to 890322 consultation", () => {
    expect(resolveClinicalCupsMapping({ conceptId: "orthodontic_followup", variantId: "ortho-followup-assessment", specialtyId: null, mappings: MAPPINGS }))
      .toEqual({ cupsCode: "890322", ripsServiceType: "consultation" });
  });

  it("resolves orthodontic_followup appliance_adjustment to 893106 procedure", () => {
    expect(resolveClinicalCupsMapping({ conceptId: "orthodontic_followup", variantId: "ortho-followup-adjustment", specialtyId: null, mappings: MAPPINGS }))
      .toEqual({ cupsCode: "893106", ripsServiceType: "procedure" });
  });

  it("never invents a mapping for tooth_extraction (no confirmed CUPS in A1)", () => {
    expect(resolveClinicalCupsMapping({ conceptId: "tooth_extraction", variantId: null, specialtyId: null, mappings: MAPPINGS })).toBeNull();
  });

  it("never invents a mapping for root_canal (no confirmed CUPS in A1)", () => {
    expect(resolveClinicalCupsMapping({ conceptId: "root_canal", variantId: null, specialtyId: null, mappings: MAPPINGS })).toBeNull();
  });

  it("never invents a mapping for a specialty with no confirmed row (Cirugía oral y maxilofacial)", () => {
    expect(
      resolveClinicalCupsMapping({ conceptId: "specialty_consultation", variantId: "specialty-first", specialtyId: SPECIALTY_CIRUGIA, mappings: MAPPINGS }),
    ).toBeNull();
  });
});

describe("resolveClinicSpecialtyRipsService", () => {
  it("does not invent a Servicio RIPS when the clinic has not confirmed one (specialty absent from clinic_specialty_rips_services)", () => {
    // Deliberately NOT reading any "default" list here — the function's
    // own signature has no such input; this proves it structurally, not
    // just by convention.
    expect(resolveClinicSpecialtyRipsService({ specialtyId: SPECIALTY_ORTODONCIA, clinicServices: CLINIC_SERVICES_CONFIRMED })).toBeNull();
  });

  it("resolves the clinic's own confirmed Servicio RIPS when present", () => {
    expect(resolveClinicSpecialtyRipsService({ specialtyId: SPECIALTY_ENDODONCIA, clinicServices: CLINIC_SERVICES_CONFIRMED })).toEqual({
      grupoServiciosCode: "01",
      codServicioCode: "311",
    });
  });

  it("returns null when the professional has no specialty at all", () => {
    expect(resolveClinicSpecialtyRipsService({ specialtyId: null, clinicServices: CLINIC_SERVICES_CONFIRMED })).toBeNull();
  });
});

describe("resolveClinicalService", () => {
  it("resolves CUPS even when the clinic has not confirmed a Servicio RIPS — clinical truth is never blocked by missing admin config", () => {
    const result = resolveClinicalService({
      conceptId: "dental_cleaning",
      variantId: "cleaning-prophylaxis",
      professionalSpecialtyId: SPECIALTY_ORTODONCIA,
      mappings: MAPPINGS,
      clinicServices: CLINIC_SERVICES_CONFIRMED,
    });
    expect(result).toEqual({
      cupsCode: "997001",
      ripsServiceType: "procedure",
      mappingStatus: "resolved",
      grupoServiciosCode: null,
      codServicioCode: null,
    });
  });

  it("resolves both CUPS and the confirmed Servicio RIPS together when the clinic has configured it", () => {
    const result = resolveClinicalService({
      conceptId: "specialty_consultation",
      variantId: "specialty-first",
      professionalSpecialtyId: SPECIALTY_ENDODONCIA,
      mappings: MAPPINGS,
      clinicServices: CLINIC_SERVICES_CONFIRMED,
    });
    expect(result).toEqual({
      cupsCode: "890218",
      ripsServiceType: "consultation",
      mappingStatus: "resolved",
      grupoServiciosCode: "01",
      codServicioCode: "311",
    });
  });

  it("returns null (never a fabricated CUPS) when the concept/variant/specialty combination has no active mapping", () => {
    expect(
      resolveClinicalService({
        conceptId: "tooth_extraction",
        variantId: null,
        professionalSpecialtyId: null,
        mappings: MAPPINGS,
        clinicServices: CLINIC_SERVICES_CONFIRMED,
      }),
    ).toBeNull();
  });
});

describe("getAvailableClinicalConcepts", () => {
  const baseInput = { concepts: CONCEPTS, variants: VARIANTS, mappings: MAPPINGS };

  it("never offers tooth_extraction", () => {
    const groups = getAvailableClinicalConcepts({ ...baseInput, professionalSpecialtyId: SPECIALTY_GENERAL, professionalSpecialtyName: "Odontología general" });
    expect(groups.some((g) => g.concept.slug === "tooth_extraction")).toBe(false);
  });

  it("never offers root_canal", () => {
    const groups = getAvailableClinicalConcepts({ ...baseInput, professionalSpecialtyId: SPECIALTY_GENERAL, professionalSpecialtyName: "Odontología general" });
    expect(groups.some((g) => g.concept.slug === "root_canal")).toBe(false);
  });

  it("never offers 'Consulta por especialidad' when the professional's specialty is Ortodoncia (dedup — orthodontic_consultation/orthodontic_followup already cover it)", () => {
    const groups = getAvailableClinicalConcepts({ ...baseInput, professionalSpecialtyId: SPECIALTY_ORTODONCIA, professionalSpecialtyName: "Ortodoncia" });
    expect(groups.some((g) => g.concept.slug === "specialty_consultation")).toBe(false);
    // The dedicated orthodontic concepts stay available.
    expect(groups.some((g) => g.concept.slug === "orthodontic_consultation")).toBe(true);
    expect(groups.some((g) => g.concept.slug === "orthodontic_followup")).toBe(true);
  });

  it("offers 'Consulta por especialidad' for a specialty with a confirmed A1 mapping (Endodoncia)", () => {
    const groups = getAvailableClinicalConcepts({ ...baseInput, professionalSpecialtyId: SPECIALTY_ENDODONCIA, professionalSpecialtyName: "Endodoncia" });
    expect(groups.some((g) => g.concept.slug === "specialty_consultation")).toBe(true);
  });

  it("never offers 'Consulta por especialidad' for a specialty with no confirmed mapping (Cirugía oral y maxilofacial)", () => {
    const groups = getAvailableClinicalConcepts({ ...baseInput, professionalSpecialtyId: SPECIALTY_CIRUGIA, professionalSpecialtyName: "Cirugía oral y maxilofacial" });
    expect(groups.some((g) => g.concept.slug === "specialty_consultation")).toBe(false);
  });

  it("never offers 'Consulta por especialidad' when the professional has no specialty at all", () => {
    const groups = getAvailableClinicalConcepts({ ...baseInput, professionalSpecialtyId: null, professionalSpecialtyName: null });
    expect(groups.some((g) => g.concept.slug === "specialty_consultation")).toBe(false);
  });

  it("always offers the concept-independent generic groups (general consultation, cleaning, whitening, orthodontics)", () => {
    const groups = getAvailableClinicalConcepts({ ...baseInput, professionalSpecialtyId: null, professionalSpecialtyName: null });
    const slugs = groups.map((g) => g.concept.slug);
    expect(slugs).toEqual(
      expect.arrayContaining(["general_consultation", "dental_cleaning", "teeth_whitening", "orthodontic_consultation", "orthodontic_followup"]),
    );
  });
});

// RIPS #A3 — endurecimiento pre-db-push: vigencia temporal
// (valid_from/valid_to), MISMA semántica inclusiva que el RPC
// (upsert_patient_clinical_encounter, GAP 1): valid_from <= hoy AND
// (valid_to IS NULL OR valid_to >= hoy). 'active' por sí solo nunca basta.
describe("resolveClinicalCupsMapping — vigencia temporal (valid_from/valid_to)", () => {
  const ASOF = "2026-06-15";

  function mapping(overrides: Partial<ClinicalCupsMappingOption> = {}): ClinicalCupsMappingOption {
    return {
      conceptId: "dental_cleaning",
      variantId: "cleaning-prophylaxis",
      specialtyId: null,
      cupsCode: "997001",
      ripsServiceType: "procedure",
      validFrom: "2020-01-01",
      validTo: null,
      ...overrides,
    };
  }

  it("applies an active mapping that is currently vigente (validFrom in the past, validTo null)", () => {
    const result = resolveClinicalCupsMapping({
      conceptId: "dental_cleaning",
      variantId: "cleaning-prophylaxis",
      specialtyId: null,
      mappings: [mapping()],
      asOfDate: ASOF,
    });
    expect(result).toEqual({ cupsCode: "997001", ripsServiceType: "procedure" });
  });

  it("never applies an active mapping whose validFrom is still in the future", () => {
    const result = resolveClinicalCupsMapping({
      conceptId: "dental_cleaning",
      variantId: "cleaning-prophylaxis",
      specialtyId: null,
      mappings: [mapping({ validFrom: "2026-06-16" })],
      asOfDate: ASOF,
    });
    expect(result).toBeNull();
  });

  it("never applies an active mapping whose validTo is already in the past", () => {
    const result = resolveClinicalCupsMapping({
      conceptId: "dental_cleaning",
      variantId: "cleaning-prophylaxis",
      specialtyId: null,
      mappings: [mapping({ validTo: "2026-06-14" })],
      asOfDate: ASOF,
    });
    expect(result).toBeNull();
  });

  it("applies a mapping whose validTo is exactly today (inclusive)", () => {
    const result = resolveClinicalCupsMapping({
      conceptId: "dental_cleaning",
      variantId: "cleaning-prophylaxis",
      specialtyId: null,
      mappings: [mapping({ validTo: "2026-06-15" })],
      asOfDate: ASOF,
    });
    expect(result).toEqual({ cupsCode: "997001", ripsServiceType: "procedure" });
  });

  it("keeps the specific-over-generic precedence intact once vigencia is also enforced", () => {
    const specific = mapping({ specialtyId: SPECIALTY_ENDODONCIA, cupsCode: "890218" });
    const generic = mapping({ specialtyId: null, cupsCode: "890203" });
    const result = resolveClinicalCupsMapping({
      conceptId: "dental_cleaning",
      variantId: "cleaning-prophylaxis",
      specialtyId: SPECIALTY_ENDODONCIA,
      mappings: [generic, specific],
      asOfDate: ASOF,
    });
    expect(result).toEqual({ cupsCode: "890218", ripsServiceType: "procedure" });
  });

  it("falls back to the generic mapping when the specific one is not currently vigente", () => {
    const expiredSpecific = mapping({ specialtyId: SPECIALTY_ENDODONCIA, cupsCode: "890218", validTo: "2026-06-14" });
    const genericStillVigente = mapping({ specialtyId: null, cupsCode: "890203" });
    const result = resolveClinicalCupsMapping({
      conceptId: "dental_cleaning",
      variantId: "cleaning-prophylaxis",
      specialtyId: SPECIALTY_ENDODONCIA,
      mappings: [expiredSpecific, genericStillVigente],
      asOfDate: ASOF,
    });
    expect(result).toEqual({ cupsCode: "890203", ripsServiceType: "procedure" });
  });
});
