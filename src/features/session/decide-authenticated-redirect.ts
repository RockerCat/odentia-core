import { restrictedReasonFor, restrictedReasonForPatient } from "./restricted-reason";
import type { ClinicContext, PatientContext } from "./types";

// Where an already-authenticated visitor to /login should land — shared by
// src/app/login/page.tsx's own post-sign-in redirect and src/lib/supabase/
// proxy.ts's /login gate, so the two decisions can never drift apart.
// Clinic status takes priority over patient status throughout: a real
// staff account (clinic_admin/dentist/assistant) is the dominant real
// flow in this app today, and nothing stops the same real person from
// ALSO being a patient somewhere unrelated — that combination isn't
// something this app needs to resolve specially, so "ok" staff context
// always wins first.
export function decideAuthenticatedRedirect(clinicContext: ClinicContext, patientContext: PatientContext): string {
  if (clinicContext.status === "ok") return "/agenda";
  if (patientContext.status === "ok") return "/portal/citas";

  if (
    clinicContext.status === "membership-inactive" ||
    clinicContext.status === "clinic-suspended" ||
    clinicContext.status === "multiple-memberships"
  ) {
    return `/acceso-restringido?motivo=${restrictedReasonFor(clinicContext.status)}`;
  }

  // Deliberately NOT escalating a bare "not-linked" the same way here —
  // see restricted-reason.ts's own comment on why: this same fallthrough
  // also covers a brand-new staff founder mid-onboarding (neither a
  // clinic membership nor a patient link yet), for whom /registro is
  // still correct. Only an ambiguous/blocked patient state escalates.
  if (patientContext.status === "multiple-links" || patientContext.status === "clinic-suspended") {
    return `/acceso-restringido?motivo=${restrictedReasonForPatient(patientContext.status)}`;
  }

  return "/registro";
}
