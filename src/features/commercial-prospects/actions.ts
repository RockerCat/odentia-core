import { createClient } from "@/lib/supabase/client";
import type { CommercialProspectFormData } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors submit_commercial_prospect()'s own CHECK constraints exactly
// (supabase/migrations/20260916190000_create_commercial_prospects.sql) —
// kept in sync manually, same convention as onboarding's tax-id bounds
// (see src/features/onboarding/api.ts). UI validation here is purely for
// fast feedback; the RPC re-validates independently and is the real
// boundary.
const MAX_LENGTHS = {
  firstName: 100,
  lastName: 100,
  clinicName: 200,
  email: 255,
  phone: 30,
  city: 100,
} as const;

export type CommercialProspectErrors = Partial<Record<keyof CommercialProspectFormData, string>>;

// Pure, so it's testable without a mocked Supabase client — same
// convention as onboarding's account-step.tsx validate().
export function validateCommercialProspectForm(data: CommercialProspectFormData): CommercialProspectErrors {
  const errors: CommercialProspectErrors = {};

  const firstName = data.firstName.trim();
  if (!firstName) errors.firstName = "Ingresa tu nombre.";
  else if (firstName.length > MAX_LENGTHS.firstName) errors.firstName = "El nombre es demasiado largo.";

  const lastName = data.lastName.trim();
  if (!lastName) errors.lastName = "Ingresa tu apellido.";
  else if (lastName.length > MAX_LENGTHS.lastName) errors.lastName = "El apellido es demasiado largo.";

  const clinicName = data.clinicName.trim();
  if (!clinicName) errors.clinicName = "Ingresa el nombre de tu clínica.";
  else if (clinicName.length > MAX_LENGTHS.clinicName) {
    errors.clinicName = "El nombre de la clínica es demasiado largo.";
  }

  const email = data.email.trim();
  if (!email) errors.email = "Ingresa tu correo electrónico.";
  else if (email.length > MAX_LENGTHS.email || !EMAIL_RE.test(email)) {
    errors.email = "Ingresa un correo electrónico válido.";
  }

  const phone = data.phone.trim();
  if (!phone) errors.phone = "Ingresa tu teléfono o WhatsApp.";
  else if (phone.length > MAX_LENGTHS.phone) errors.phone = "El teléfono es demasiado largo.";

  const city = data.city.trim();
  if (!city) errors.city = "Ingresa tu ciudad.";
  else if (city.length > MAX_LENGTHS.city) errors.city = "La ciudad es demasiado larga.";

  return errors;
}

const GENERIC_ERROR = "No pudimos enviar tus datos. Intenta nuevamente.";

export type SubmitCommercialProspectOutcome = { status: "ok" } | { status: "error"; message: string };

// The one sanctioned write path: submit_commercial_prospect(), an anon-
// callable SECURITY DEFINER RPC that forces status='new' and is the only
// way anything reaches commercial_prospects (RLS has no insert policy for
// anon/authenticated at all — see that migration's own comment). No
// Supabase Auth call, no session, no bootstrap_clinic()/provision_clinic()/
// membership/invitation RPC — a Prospecto is never any of those entities.
// Errors are deliberately collapsed to one generic public message: this
// call is unauthenticated and public, so the RPC's raw error text (SQL
// detail, constraint names) must never reach the browser.
export async function submitCommercialProspect(
  data: CommercialProspectFormData,
): Promise<SubmitCommercialProspectOutcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc("submit_commercial_prospect", {
    p_first_name: data.firstName.trim(),
    p_last_name: data.lastName.trim(),
    p_clinic_name: data.clinicName.trim(),
    p_email: data.email.trim().toLowerCase(),
    p_phone: data.phone.trim(),
    p_city: data.city.trim(),
  });

  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok" };
}
