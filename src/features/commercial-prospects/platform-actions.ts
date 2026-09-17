import { createClient } from "@/lib/supabase/client";
import { sanitizeTaxId } from "@/features/onboarding/api";
import { slugCandidate, slugifyClinicName } from "@/features/onboarding/slug";
import type { ClinicFormData, ClinicLocationData } from "@/features/onboarding/types";
import type { CommercialProspectStatus } from "./state-machine";

const GENERIC_ERROR = "No pudimos actualizar el estado. Intenta de nuevo.";

export type UpdateCommercialProspectStatusOutcome =
  | { status: "ok"; newStatus: CommercialProspectStatus }
  | { status: "error"; message: string };

// The one sanctioned mutation path: update_commercial_prospect_status()
// (supabase/migrations/20260916200000_create_update_commercial_prospect_status_rpc.sql)
// — Superadmin-gated, re-validates the transition against the real
// current row server-side, and touches only status/updated_at. Never a
// generic UPDATE from the browser.
export async function updateCommercialProspectStatus(
  prospectId: string,
  newStatus: CommercialProspectStatus,
): Promise<UpdateCommercialProspectStatusOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_commercial_prospect_status", {
    p_prospect_id: prospectId,
    p_new_status: newStatus,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "Solo un Superadmin de Platform puede cambiar el estado de un prospecto." };
    }
    if (error.message.includes("invalid status transition")) {
      return { status: "error", message: "Ese cambio de estado no es válido desde el estado actual." };
    }
    if (error.message.includes("prospect not found")) {
      return { status: "error", message: "No encontramos este prospecto." };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  return { status: "ok", newStatus: data as CommercialProspectStatus };
}

const MAX_SLUG_ATTEMPTS = 5;

const nullIfEmpty = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export type ConvertProspectToClinicResult = {
  clinicId: string;
  slug: string;
};

// The one sanctioned "Prospecto ganado → Crear clínica" write path:
// convert_commercial_prospect_to_clinic() (supabase/migrations/
// 20260916210000_convert_commercial_prospect_to_clinic.sql) — which
// itself calls provision_clinic() internally, never a second,
// duplicated clinic-creation implementation. Same slug-candidate-with-
// retry-on-unique-violation convention as provisionClinic()
// (src/features/platform/api.ts) — mirrored here rather than imported,
// since that function's own RPC call/signature differ (this one also
// carries `p_prospect_id` and re-validates won/not-yet-converted
// server-side).
export async function convertCommercialProspectToClinic(
  prospectId: string,
  clinic: ClinicFormData,
  location: ClinicLocationData,
): Promise<ConvertProspectToClinicResult> {
  const supabase = createClient();
  const baseSlug = slugifyClinicName(clinic.name);

  let lastError: { code?: string; message: string } | null = null;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.rpc("convert_commercial_prospect_to_clinic", {
      p_prospect_id: prospectId,
      clinic_name: clinic.name.trim(),
      clinic_slug: slugCandidate(baseSlug, attempt),
      clinic_legal_name: nullIfEmpty(clinic.legalName),
      clinic_tax_id: sanitizeTaxId(clinic.taxId),
      clinic_email: nullIfEmpty(clinic.institutionalEmail),
      clinic_phone: nullIfEmpty(clinic.phone),
      location_name: "Sede principal",
      location_address: nullIfEmpty(location.locationAddress),
      location_city: nullIfEmpty(location.locationCity),
      location_state: nullIfEmpty(location.locationState),
      location_country: "CO",
      location_phone: nullIfEmpty(clinic.phone),
      location_timezone: "America/Bogota",
      location_latitude: location.locationLatitude,
      location_longitude: location.locationLongitude,
    });

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      return { clinicId: row.clinic_id, slug: row.slug };
    }

    if (error.code === "23505" && error.message.includes("clinics_slug_key")) {
      lastError = error;
      continue;
    }

    throw error;
  }

  throw lastError ?? new Error("No se pudo generar un identificador único para la clínica.");
}

export function friendlyConvertProspectError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message).toLowerCase();
    if (message.includes("session")) {
      return "Tu sesión expiró. Recarga la página e inicia sesión de nuevo para continuar.";
    }
    if (message.includes("superadmin")) {
      return "No tienes permisos de Superadmin para convertir este prospecto.";
    }
    if (message.includes("must be won")) {
      return "Este prospecto debe estar en estado Ganado antes de crear la clínica.";
    }
    if (message.includes("already been converted")) {
      return "Este prospecto ya fue convertido en una clínica.";
    }
    if (message.includes("prospect not found")) {
      return "No encontramos este prospecto.";
    }
  }
  return "No pudimos crear la clínica. Intenta de nuevo en unos minutos.";
}
