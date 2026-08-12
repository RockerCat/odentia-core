import { PATIENTS, type Patient } from "@/features/patients/mock-data";
import { CURRENT_PATIENT } from "@/lib/current-user";

// The demo Patient session (CURRENT_PATIENT) is the same person as this
// existing Patients-module record — reusing it (not a second, separate
// mock) is what lets "Mis citas"/"Inicio" derive real appointment history
// via getPatientVisitSummary instead of inventing portal-only dates.
export const MY_PATIENT_RECORD: Patient = PATIENTS.find((p) => p.name === CURRENT_PATIENT.name) ?? PATIENTS[0];

// Front-desk contact info for the "Mi clínica" card — distinct from any
// staff member's own phone (see CURRENT_USER/CURRENT_ASSISTANT in
// src/lib/current-user.ts), which a patient shouldn't be calling directly.
export const MY_CLINIC = {
  name: CURRENT_PATIENT.clinicName,
  address: "Calle 93 #15-20, Bogotá",
  phone: "+57 601 745 3200",
};
