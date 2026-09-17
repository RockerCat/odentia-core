import { AppShell } from "@/components/shell/app-shell";
import { EMPTY_PATIENT_IDENTITY_CATALOGS } from "@/features/patients/data";
import { fetchPatientIdentityCatalogs } from "@/features/patients/identity-catalogs";
import { RipsScreen } from "@/features/rips/rips-screen";

// Real /rips — RIPS #5's first screen. Admin Clínica only (see
// src/dev/role.ts's own ROLE_NAV_ITEMS exclusions and this task's own
// Section 36 "preferencia conservadora para MVP"): allowedRoles here is
// the real, server/route-guard-enforced gate (see AppShell/useRouteGuard,
// both backed by the REAL resolved role via role-bridge.ts, never the
// dev mock alone) — every server action this screen calls
// (getRipsPeriodSummaryAction/generateRipsSinFacturaExportAction, see
// export-actions.ts) independently re-checks role === 'clinic_admin'
// too, so a hidden nav item or a client-side guard alone is never the
// only thing standing between a Dentist/Assistant and this data.
//
// identityCatalogs (Sexo/Tipo de usuario/País/etc.) is the SAME server-only
// fetch /pacientes and /agenda's "Ver paciente" already use for the exact
// same fields — fetched here too so "Corregir" on a patient-scope
// pendiente can complete those fields in a modal without ever leaving
// /rips. Never re-fetched per patient/per modal open — one fetch for the
// whole screen, matching that existing convention.
export default async function RipsPage() {
  let identityCatalogs = EMPTY_PATIENT_IDENTITY_CATALOGS;
  try {
    identityCatalogs = await fetchPatientIdentityCatalogs();
  } catch (error) {
    // Same "optional for the page" handling /pacientes already uses for
    // this exact fetch — an empty catalog here just means fewer options
    // in the "Corregir" modal, never a broken /rips.
    console.error("[/rips] fetchPatientIdentityCatalogs failed", error);
  }

  return (
    <AppShell activeNavLabel="RIPS" heading="RIPS" allowedRoles={["clinic-admin"]}>
      <RipsScreen identityCatalogs={identityCatalogs} />
    </AppShell>
  );
}
