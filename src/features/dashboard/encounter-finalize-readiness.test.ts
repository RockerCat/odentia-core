import { describe, expect, it } from "vitest";
import { getEncounterFinalizeBlockers, type FinalizeReadinessInput } from "./encounter-finalize-readiness";

// Regression for this task's own two pendientes ("falta indicar si hubo
// incapacidad", "falta el valor cobrado por la consulta 890203") — this
// pins the exact rule real-clinical-encounter-screen.tsx's own
// handleFinalizeClick uses to block "Finalizar atención" outright,
// mirroring export-readiness.ts's ENCOUNTER_INCAPACITY_MISSING/
// SERVICE_VALUE_MISSING rules on purpose (see that file's own tests).

function base(overrides: Partial<FinalizeReadinessInput> = {}): FinalizeReadinessInput {
  return {
    incapacityCode: "02",
    services: [{ cupsCode: "890203", ripsServiceType: "consultation", serviceValue: "50000" }],
    ...overrides,
  };
}

describe("getEncounterFinalizeBlockers", () => {
  it("blocks when incapacidad is unanswered (null)", () => {
    const blockers = getEncounterFinalizeBlockers(base({ incapacityCode: null }));
    expect(blockers.length).toBeGreaterThan(0);
    expect(blockers.some((b) => b.includes("incapacidad"))).toBe(true);
  });

  it("incapacidad = No ('02') is a valid, explicit answer — no blocker", () => {
    const blockers = getEncounterFinalizeBlockers(base({ incapacityCode: "02" }));
    expect(blockers).toEqual([]);
  });

  it("incapacidad = Sí ('01') is a valid, explicit answer — no blocker, same as No", () => {
    const blockers = getEncounterFinalizeBlockers(base({ incapacityCode: "01" }));
    expect(blockers).toEqual([]);
  });

  it("blocks when a consultation's serviceValue is empty", () => {
    const blockers = getEncounterFinalizeBlockers(
      base({ services: [{ cupsCode: "890203", ripsServiceType: "consultation", serviceValue: "" }] }),
    );
    expect(blockers.some((b) => b.includes("890203"))).toBe(true);
  });

  it("blocks when a consultation's serviceValue is only whitespace", () => {
    const blockers = getEncounterFinalizeBlockers(
      base({ services: [{ cupsCode: "890203", ripsServiceType: "consultation", serviceValue: "   " }] }),
    );
    expect(blockers.length).toBeGreaterThan(0);
  });

  it("never blocks a procedure for an empty serviceValue (0 is the regulatory default, not user input)", () => {
    const blockers = getEncounterFinalizeBlockers(
      base({ services: [{ cupsCode: "230100", ripsServiceType: "procedure", serviceValue: "" }] }),
    );
    expect(blockers).toEqual([]);
  });

  it("never blocks an unclassified (unknown) CUPS service for an empty serviceValue — that's a separate readiness error", () => {
    const blockers = getEncounterFinalizeBlockers(
      base({ services: [{ cupsCode: "999999", ripsServiceType: "unknown", serviceValue: "" }] }),
    );
    expect(blockers).toEqual([]);
  });

  it("a filled valorPagoModerador is not part of this input at all — never mistaken for serviceValue", () => {
    // Same real bug this task fixes: 50000 typed into "Valor pago
    // moderador" must never satisfy the "valor cobrado" requirement.
    // FinalizeReadinessService has no valorPagoModerador field on
    // purpose — there's nothing to accidentally read here.
    const blockers = getEncounterFinalizeBlockers(
      base({ services: [{ cupsCode: "890203", ripsServiceType: "consultation", serviceValue: "" }] }),
    );
    expect(blockers.some((b) => b.includes("890203"))).toBe(true);
  });

  it("is ready (no blockers) when incapacidad is answered and every consultation has a serviceValue", () => {
    expect(getEncounterFinalizeBlockers(base())).toEqual([]);
  });

  it("reports both blockers together when both are missing", () => {
    const blockers = getEncounterFinalizeBlockers(
      base({ incapacityCode: null, services: [{ cupsCode: "890203", ripsServiceType: "consultation", serviceValue: "" }] }),
    );
    expect(blockers.length).toBe(2);
  });

  // RIPS #A3 — a concept-based service resolved to a CUPS but still
  // missing the clinic's own confirmed Servicio RIPS (A2) must NEVER
  // block "Finalizar atención": clinical truth and RIPS export
  // completeness are deliberately separate (see this task's own
  // Finalización Clínica section). FinalizeReadinessService structurally
  // has no grupoServiciosCode/codServicioCode field at all — there is
  // nothing here that COULD read it — this test pins that invariant.
  it("is ready (no blockers) even when the Servicio RIPS configuration is missing for every service", () => {
    expect(getEncounterFinalizeBlockers(base())).toEqual([]);
  });
});
