// The real detail of a finalized atención is Historia Clínica → Atenciones
// (atenciones-tab.tsx renders every real field of each encounter inline —
// deliberately no separate detail modal). This is the one way any other
// surface links to a specific atención there, instead of a "disponible
// próximamente" placeholder or a second detail view.

export const HISTORIA_CLINICA_TABS = ["Resumen", "Antecedentes", "Odontograma", "Atenciones", "Documentos"] as const;
export type HistoriaClinicaTab = (typeof HISTORIA_CLINICA_TABS)[number];

// `?tab=atenciones` → "Atenciones"; anything unknown/missing → "Resumen",
// the screen's own default.
export function resolveHistoriaClinicaTab(raw: string | string[] | undefined): HistoriaClinicaTab {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase();
  return HISTORIA_CLINICA_TABS.find((t) => t.toLowerCase() === value) ?? "Resumen";
}

// DOM id of an atención's entry in the Atenciones timeline, keyed by its
// Cita (patient_clinical_encounters.appointment_id is 1:1 with the Cita) —
// the only id the Agenda history rows actually have.
export function encounterAnchorIdForAppointment(appointmentId: string): string {
  return `atencion-cita-${appointmentId}`;
}

// Only a `completed` Cita has a finalized atención to show ("Completada"
// only ever happens after "Finalizar atención" persisted the encounter —
// see CLAUDE.md Appointment Lifecycle); every other status → null (no
// detail exists, the row's own tooltip already shows what's real).
export function completedEncounterDetailHref(appointment: { id: string; patientId: string; status: string }): string | null {
  if (appointment.status !== "completed") return null;
  return `/pacientes/${appointment.patientId}/historia-clinica?tab=atenciones#${encounterAnchorIdForAppointment(appointment.id)}`;
}
