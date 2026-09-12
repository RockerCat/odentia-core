import { createClient } from "@/lib/supabase/server";
import type {
  ClinicalConceptOption,
  ClinicalConceptVariantOption,
  ClinicalCupsMappingOption,
  ClinicSpecialtyRipsServiceOption,
} from "./clinical-service-resolution";

// RIPS Fase A3 — read-only data access for the catalogs
// clinical-service-resolution.ts resolves against: clinical_concepts/
// clinical_concept_variants/clinical_cups_mappings (A1) and
// clinic_specialty_rips_services (A2, clinic-scoped — NEVER
// specialty_rips_service_defaults, which is only Odentia's global
// suggestion and must never be read as if it were a clinic's effective
// configuration — see clinical-service-resolution.ts's own comment).
//
// Server-only (uses @/lib/supabase/server), same convention as
// catalog-data.ts — consumed by /agenda/atencion/[appointmentId]'s
// page.tsx loader. Every query relies on each table's own
// `*_select_authenticated`/`*_select_member` RLS policy — never a
// separate permissions framework.

export async function fetchClinicalConcepts(): Promise<ClinicalConceptOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinical_concepts")
    .select("id, slug, name, requires_specialty")
    .eq("active", true)
    .order("name");
  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, slug: row.slug, name: row.name, requiresSpecialty: row.requires_specialty }));
}

export async function fetchClinicalConceptVariants(): Promise<ClinicalConceptVariantOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinical_concept_variants")
    .select("id, concept_id, slug, name")
    .eq("active", true)
    .order("name");
  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, conceptId: row.concept_id, slug: row.slug, name: row.name }));
}

// Joined against cups_catalog (via the cups_catalog_id FK) to resolve the
// actual code + rips_service_type — clinical_cups_mappings itself never
// stores a bare CUPS code, only the FK (see A1's own migration comment on
// why: a single source of truth, never a value that could desync from
// the official catalog).
type ClinicalCupsMappingRow = {
  concept_id: string;
  variant_id: string | null;
  specialty_id: string | null;
  valid_from: string;
  valid_to: string | null;
  cups_catalog: { code: string; rips_service_type: "consultation" | "procedure" | "unknown" } | null;
};

// valid_from/valid_to also selected here (not just status='active'): la
// vigencia temporal la evalúa resolveClinicalCupsMapping
// (clinical-service-resolution.ts), no esta capa de fetch — mismo motivo
// que el endurecimiento GAP 1 del RPC: 'active' por sí solo no basta,
// una fila puede estar activa pero aún no vigente o ya vencida.
export async function fetchClinicalCupsMappings(): Promise<ClinicalCupsMappingOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinical_cups_mappings")
    .select("concept_id, variant_id, specialty_id, valid_from, valid_to, cups_catalog:cups_catalog_id(code, rips_service_type)")
    .eq("status", "active");
  if (error || !data) return [];
  return (data as unknown as ClinicalCupsMappingRow[])
    .filter((row) => row.cups_catalog !== null)
    .map((row) => ({
      conceptId: row.concept_id,
      variantId: row.variant_id,
      specialtyId: row.specialty_id,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      cupsCode: row.cups_catalog!.code,
      ripsServiceType: row.cups_catalog!.rips_service_type,
    }));
}

// Configuración CONFIRMADA de ESTA clínica (nunca la sugerencia global
// specialty_rips_service_defaults) — joined contra rips_reference_values
// para obtener el código de Servicio (code) y su grupo (parent_code, ya
// poblado para catalog_key='Servicios' — mismo dato que el dropdown
// manual "Grupo de servicios"/"Servicio" de real-clinical-encounter-screen.tsx
// ya usa vía parentCode).
type ClinicSpecialtyRipsServiceRow = {
  specialty_id: string;
  rips_reference_values: { code: string; parent_code: string | null } | null;
};

export async function fetchClinicSpecialtyRipsServices(clinicId: string): Promise<ClinicSpecialtyRipsServiceOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinic_specialty_rips_services")
    .select("specialty_id, rips_reference_values:rips_reference_value_id(code, parent_code)")
    .eq("clinic_id", clinicId)
    .eq("status", "active");
  if (error || !data) return [];
  return (data as unknown as ClinicSpecialtyRipsServiceRow[])
    .filter((row) => row.rips_reference_values !== null && row.rips_reference_values.parent_code !== null)
    .map((row) => ({
      specialtyId: row.specialty_id,
      codServicioCode: row.rips_reference_values!.code,
      grupoServiciosCode: row.rips_reference_values!.parent_code!,
    }));
}

type ProfessionalSpecialtyRow = {
  specialties: { id: string; name: string } | null;
};

// The attending professional's primary specialty (id + name) — used as
// the single context for the whole "¿Qué realizaste?" picker (V0
// simplification: one specialty per encounter, not per assigned
// professional row — see clinical-service-resolution.ts's own header
// comment and this phase's report).
export async function fetchProfessionalSpecialty(
  clinicId: string,
  professionalProfileId: string,
): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("professional_profiles")
    .select("specialties:primary_specialty_id(id, name)")
    .eq("clinic_id", clinicId)
    .eq("id", professionalProfileId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as unknown as ProfessionalSpecialtyRow).specialties;
}
