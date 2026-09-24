import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  completedEncounterDetailHref,
  encounterAnchorIdForAppointment,
  resolveHistoriaClinicaTab,
} from "./encounter-detail-link";

// Pilot E2E: clicking the completed 24-sep Cita in Agenda's patient
// history showed "El detalle de esta atención estará disponible
// próximamente", although that atención already exists in full, for real,
// in Historia Clínica → Atenciones. The row now links there instead.

const PATIENT_ID = "29a70e77-1c4c-450c-bdd0-66bd7e436dbb";

describe("completedEncounterDetailHref", () => {
  it("a completed Cita opens its own atención in Historia Clínica → Atenciones", () => {
    expect(completedEncounterDetailHref({ id: "appt-24sep", patientId: PATIENT_ID, status: "completed" })).toBe(
      `/pacientes/${PATIENT_ID}/historia-clinica?tab=atenciones#atencion-cita-appt-24sep`,
    );
  });

  it.each(["scheduled", "confirmed", "patient_arrived", "waiting_room", "in_progress", "no_show", "cancelled"])(
    "%s has no finalized atención to show → null (row stays informational, never a dead/placeholder click)",
    (status) => {
      expect(completedEncounterDetailHref({ id: "appt-x", patientId: PATIENT_ID, status })).toBeNull();
    },
  );

  it("the anchor matches the id Atenciones gives that encounter's entry", () => {
    const href = completedEncounterDetailHref({ id: "appt-24sep", patientId: PATIENT_ID, status: "completed" })!;
    expect(href.endsWith(`#${encounterAnchorIdForAppointment("appt-24sep")}`)).toBe(true);
    const atencionesSource = readFileSync(path.resolve(__dirname, "atenciones-tab.tsx"), "utf8");
    expect(atencionesSource).toContain("encounterAnchorIdForAppointment(encounter.appointmentId)");
  });
});

describe("resolveHistoriaClinicaTab", () => {
  it("maps ?tab= case-insensitively onto the real tabs, defaulting to Resumen", () => {
    expect(resolveHistoriaClinicaTab("atenciones")).toBe("Atenciones");
    expect(resolveHistoriaClinicaTab(["Odontograma"])).toBe("Odontograma");
    expect(resolveHistoriaClinicaTab(undefined)).toBe("Resumen");
    expect(resolveHistoriaClinicaTab("nope")).toBe("Resumen");
  });
});

describe("no 'disponible próximamente' placeholder on the real encounter-history path", () => {
  it.each(["../dashboard/real-appointment-detail-modal.tsx", "atenciones-tab.tsx", "patient-clinical-record-screen.tsx"])("%s", (file) => {
    const source = readFileSync(path.resolve(__dirname, file), "utf8");
    expect(source).not.toMatch(/disponible próximamente/i);
  });
});
