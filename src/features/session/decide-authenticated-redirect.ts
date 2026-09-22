import { restrictedReasonFor, restrictedReasonForPatient } from "./restricted-reason";
import type { ClinicContext, PatientContext, SuperadminContext } from "./types";

// Where an already-authenticated visitor to /login should land — shared by
// src/app/login/page.tsx's own post-sign-in redirect and src/lib/supabase/
// proxy.ts's /login gate, so the two decisions can never drift apart.
//
// Priority, explicit and in order: Superadmin, then Clinic, then Patient,
// then the existing fallback. Superadmin wins first — it's a platform
// administrative identity (public.platform_roles), never a clinic
// membership or a patient link, and someone provisioned as Superadmin
// should always land in Platform even if the same real person also
// happens to have a clinic membership or a patient link somewhere (e.g. a
// staff account used for QA) — that combination isn't something this app
// needs to resolve specially, same reasoning Clinic-over-Patient already
// used below. Clinic still takes priority over Patient for everyone else:
// a real staff account (clinic_admin/dentist/assistant) is the dominant
// real flow in this app today, and nothing stops the same real person
// from ALSO being a patient somewhere unrelated.
export function decideAuthenticatedRedirect(
  superadminContext: SuperadminContext,
  clinicContext: ClinicContext,
  patientContext: PatientContext,
): string {
  if (superadminContext.status === "ok") return "/platform";
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
  // also covers a genuinely new/unlinked account (neither a clinic
  // membership nor a patient link) — /registro now resolves that case to
  // /demo itself (see registro-reentry.tsx, "Odentia — retirar
  // self-service de /registro y eliminar Confirm Signup"), never a
  // resurrected onboarding form. Only an ambiguous/blocked patient state
  // escalates.
  if (patientContext.status === "multiple-links" || patientContext.status === "clinic-suspended") {
    return `/acceso-restringido?motivo=${restrictedReasonForPatient(patientContext.status)}`;
  }

  return "/registro";
}
