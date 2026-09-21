import { describe, expect, it } from "vitest";
import { getEncounterFinalizeBlockers, type FinalizeReadinessDiagnosis, type FinalizeReadinessInput } from "./encounter-finalize-readiness";

// Regression for this task's own two pendientes ("falta indicar si hubo
// incapacidad", "falta el valor cobrado por la consulta 890203") — this
// pins the exact rule real-clinical-encounter-screen.tsx's own
// handleFinalizeClick uses to block "Finalizar atención" outright,
// mirroring export-readiness.ts's ENCOUNTER_INCAPACITY_MISSING/
// SERVICE_VALUE_MISSING rules on purpose (see that file's own tests).
//
// RIPS — Modalidad/Finalidad/Causa: Finalidad and (later) Causa both
// joined this same gate as Odentia's own internal quality rules for NEW
// encounters, never regulatory/export requirements themselves —
// finalidad_code/causa_motivo_code stay optional per the DT1 as
// documented (see docs/rips-json-mapping.md), so export-readiness.ts's
// getEncounterRipsReadiness deliberately never checks either (a
// historical encounter finalized before these internal rules existed
// stays a perfectly valid export). Modalidad is never a blocker here or
// there either — it's resolved automatically, never user input to begin
// with. Causa/Motivo used to be silently defaulted to "38 — Enfermedad
// general" on every new consultation (Prompt Ninja "corregir Causa/
// Motivo según Finalidad de promoción y mantenimiento" removed that
// universal default, since it was regulatorily wrong for at least one
// real Finalidad) — this blocker is what stops "Finalizar atención" from
// completing a consultation Odentia no longer silently fills in for.
//
// RIPS — principal diagnosis: `base()`'s default `diagnoses` is a single
// valid encounter-wide principal (WITH diagnosisTypeCode) precisely so
// every test above this concern (incapacidad/valor/finalidad/causa) keeps
// exercising ONLY the rule it's named for — see the dedicated
// "diagnóstico principal" describe block below for that rule's own
// coverage, including the cases where `diagnoses` is deliberately
// overridden to be empty/incomplete.

const DEFAULT_PRINCIPAL: FinalizeReadinessDiagnosis = {
  cie10Code: "K021",
  role: "principal",
  diagnosisTypeCode: "01",
  encounterServiceId: null,
  sequence: 0,
};

function base(overrides: Partial<FinalizeReadinessInput> = {}): FinalizeReadinessInput {
  return {
    incapacityCode: "02",
    services: [
      { id: "svc-1", cupsCode: "890203", ripsServiceType: "consultation", serviceValue: "50000", finalidadCode: "15", causaMotivoCode: "40" },
    ],
    diagnoses: [DEFAULT_PRINCIPAL],
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
      base({
        services: [
          { id: "svc-1", cupsCode: "890203", ripsServiceType: "consultation", serviceValue: "", finalidadCode: "15", causaMotivoCode: "40" },
        ],
      }),
    );
    expect(blockers.some((b) => b.includes("890203"))).toBe(true);
  });

  it("blocks when a consultation's serviceValue is only whitespace", () => {
    const blockers = getEncounterFinalizeBlockers(
      base({
        services: [
          {
            id: "svc-1",
            cupsCode: "890203",
            ripsServiceType: "consultation",
            serviceValue: "   ",
            finalidadCode: "15",
            causaMotivoCode: "40",
          },
        ],
      }),
    );
    expect(blockers.length).toBeGreaterThan(0);
  });

  it("never blocks a procedure for an empty serviceValue (0 is the regulatory default, not user input)", () => {
    const blockers = getEncounterFinalizeBlockers(
      base({
        services: [
          { id: "svc-1", cupsCode: "230100", ripsServiceType: "procedure", serviceValue: "", finalidadCode: "15", causaMotivoCode: "" },
        ],
      }),
    );
    expect(blockers).toEqual([]);
  });

  it("never blocks an unclassified (unknown) CUPS service for an empty serviceValue — that's a separate readiness error", () => {
    const blockers = getEncounterFinalizeBlockers(
      base({
        services: [
          { id: "svc-1", cupsCode: "999999", ripsServiceType: "unknown", serviceValue: "", finalidadCode: "", causaMotivoCode: "" },
        ],
        diagnoses: [],
      }),
    );
    expect(blockers).toEqual([]);
  });

  it("a filled valorPagoModerador is not part of this input at all — never mistaken for serviceValue", () => {
    // Same real bug this task fixes: 50000 typed into "Valor pago
    // moderador" must never satisfy the "valor cobrado" requirement.
    // FinalizeReadinessService has no valorPagoModerador field on
    // purpose — there's nothing to accidentally read here.
    const blockers = getEncounterFinalizeBlockers(
      base({
        services: [
          { id: "svc-1", cupsCode: "890203", ripsServiceType: "consultation", serviceValue: "", finalidadCode: "15", causaMotivoCode: "40" },
        ],
      }),
    );
    expect(blockers.some((b) => b.includes("890203"))).toBe(true);
  });

  it("is ready (no blockers) when incapacidad is answered and every consultation has a serviceValue, finalidad and causa", () => {
    expect(getEncounterFinalizeBlockers(base())).toEqual([]);
  });

  it("reports both blockers together when both are missing", () => {
    const blockers = getEncounterFinalizeBlockers(
      base({
        incapacityCode: null,
        services: [
          { id: "svc-1", cupsCode: "890203", ripsServiceType: "consultation", serviceValue: "", finalidadCode: "15", causaMotivoCode: "40" },
        ],
      }),
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

  // RIPS — Finalidad: a real clinical decision, never defaulted, required
  // for every classified (consultation or procedure) service — this is
  // the new gate real-clinical-encounter-screen.tsx's own "¿Qué
  // realizaste?" flow relies on before "Finalizar atención" ever opens
  // the confirm dialog.
  describe("finalidad", () => {
    it("blocks a new consultation without finalidad selected", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            {
              id: "svc-1",
              cupsCode: "890203",
              ripsServiceType: "consultation",
              serviceValue: "50000",
              finalidadCode: "",
              causaMotivoCode: "40",
            },
          ],
        }),
      );
      expect(blockers.some((b) => b.includes("finalidad") && b.includes("890203"))).toBe(true);
    });

    it("blocks an applicable procedure without finalidad selected — the field is required at the service level, not only for consultas", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            { id: "svc-1", cupsCode: "230100", ripsServiceType: "procedure", serviceValue: "", finalidadCode: "", causaMotivoCode: "" },
          ],
        }),
      );
      expect(blockers.some((b) => b.includes("finalidad") && b.includes("230100"))).toBe(true);
    });

    it("never blocks an unclassified (unknown) CUPS service for a missing finalidad — that's a separate, pre-existing readiness problem", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            { id: "svc-1", cupsCode: "999999", ripsServiceType: "unknown", serviceValue: "", finalidadCode: "", causaMotivoCode: "" },
          ],
          diagnoses: [],
        }),
      );
      expect(blockers).toEqual([]);
    });

    it("finalización continues normally (no blocker) once a valid finalidad is selected", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            { id: "svc-1", cupsCode: "230100", ripsServiceType: "procedure", serviceValue: "", finalidadCode: "15", causaMotivoCode: "" },
          ],
        }),
      );
      expect(blockers).toEqual([]);
    });
  });

  // RIPS — Causa/Motivo (Prompt Ninja "corregir Causa/Motivo según
  // Finalidad de promoción y mantenimiento"): consultation-only, same
  // pattern as Finalidad above, but NEVER applied to a procedimiento —
  // Causa/Motivo has no field/control for a procedimiento at all in the
  // real screen. Added when the old universal "38" default was removed,
  // so a new consultation can no longer finalize silently without one.
  describe("causa/motivo", () => {
    it("blocks a new consultation without causa/motivo selected", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            {
              id: "svc-1",
              cupsCode: "890203",
              ripsServiceType: "consultation",
              serviceValue: "50000",
              finalidadCode: "15",
              causaMotivoCode: "",
            },
          ],
        }),
      );
      expect(blockers.some((b) => b.includes("causa") && b.includes("890203"))).toBe(true);
    });

    it("never blocks a procedure for a missing causa/motivo — that field doesn't exist for a procedimiento", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            { id: "svc-1", cupsCode: "230100", ripsServiceType: "procedure", serviceValue: "", finalidadCode: "15", causaMotivoCode: "" },
          ],
        }),
      );
      expect(blockers).toEqual([]);
    });

    it("never blocks an unclassified (unknown) CUPS service for a missing causa/motivo", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            { id: "svc-1", cupsCode: "999999", ripsServiceType: "unknown", serviceValue: "", finalidadCode: "", causaMotivoCode: "" },
          ],
          diagnoses: [],
        }),
      );
      expect(blockers).toEqual([]);
    });

    it("finalización continues normally (no blocker) once a valid causa/motivo is selected — e.g. 40 for promoción y mantenimiento", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            {
              id: "svc-1",
              cupsCode: "890203",
              ripsServiceType: "consultation",
              serviceValue: "50000",
              finalidadCode: "11",
              causaMotivoCode: "40",
            },
          ],
        }),
      );
      expect(blockers).toEqual([]);
    });
  });

  // RIPS — principal diagnosis: the real pilot gap this task closes.
  // `codDiagnosticoPrincipal` is REGULATORY REQUIRED for every consulta/
  // procedimiento; `tipoDiagnosticoPrincipal` is additionally REGULATORY
  // REQUIRED for every consulta (a procedimiento has no equivalent
  // field) — see export-generator.ts's own resolveDiagnosesForService/
  // buildConsultation comments. Forward-only: this only ever gates a NEW
  // "Finalizar atención" click, never re-evaluates an already-finalized
  // encounter (export-readiness.ts is untouched by this task).
  describe("diagnóstico principal", () => {
    it("blocks a consultation with no resolvable principal diagnosis", () => {
      const blockers = getEncounterFinalizeBlockers(base({ diagnoses: [] }));
      expect(blockers.some((b) => b.includes("diagnóstico principal"))).toBe(true);
    });

    it("blocks a procedure with no resolvable principal diagnosis", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            { id: "svc-1", cupsCode: "230100", ripsServiceType: "procedure", serviceValue: "", finalidadCode: "15", causaMotivoCode: "" },
          ],
          diagnoses: [],
        }),
      );
      expect(blockers.some((b) => b.includes("diagnóstico principal"))).toBe(true);
    });

    it("a consultation with a principal AND a diagnosis type is satisfied — no diagnosis-related blocker", () => {
      const blockers = getEncounterFinalizeBlockers(base());
      expect(blockers).toEqual([]);
    });

    it("blocks a consultation whose principal is missing the diagnosis type", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({ diagnoses: [{ ...DEFAULT_PRINCIPAL, diagnosisTypeCode: null }] }),
      );
      expect(blockers.some((b) => b.includes("tipo de diagnóstico"))).toBe(true);
    });

    it("a procedure whose principal is missing the diagnosis type is satisfied — RIPS procedimiento has no such field", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            { id: "svc-1", cupsCode: "230100", ripsServiceType: "procedure", serviceValue: "", finalidadCode: "15", causaMotivoCode: "" },
          ],
          diagnoses: [{ ...DEFAULT_PRINCIPAL, diagnosisTypeCode: null }],
        }),
      );
      expect(blockers).toEqual([]);
    });

    it("consultation + procedure both satisfied by the same valid encounter-wide principal + type", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            {
              id: "svc-1",
              cupsCode: "890203",
              ripsServiceType: "consultation",
              serviceValue: "50000",
              finalidadCode: "15",
              causaMotivoCode: "40",
            },
            { id: "svc-2", cupsCode: "230100", ripsServiceType: "procedure", serviceValue: "", finalidadCode: "15", causaMotivoCode: "" },
          ],
        }),
      );
      expect(blockers).toEqual([]);
    });

    it("a service-scoped principal resolves correctly when one exists for that exact service", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          diagnoses: [{ cie10Code: "K021", role: "principal", diagnosisTypeCode: "01", encounterServiceId: "svc-1", sequence: 0 }],
        }),
      );
      expect(blockers).toEqual([]);
    });

    it("falls back to the encounter-wide principal when no service-scoped principal exists for that service", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            {
              id: "svc-1",
              cupsCode: "890203",
              ripsServiceType: "consultation",
              serviceValue: "50000",
              finalidadCode: "15",
              causaMotivoCode: "40",
            },
            { id: "svc-2", cupsCode: "230100", ripsServiceType: "procedure", serviceValue: "", finalidadCode: "15", causaMotivoCode: "" },
          ],
          // Scoped only to svc-1 — svc-2 has no scoped principal of its
          // own and must fall back to the encounter-wide DEFAULT_PRINCIPAL.
          diagnoses: [
            { cie10Code: "K021", role: "principal", diagnosisTypeCode: "01", encounterServiceId: "svc-1", sequence: 0 },
            DEFAULT_PRINCIPAL,
          ],
        }),
      );
      expect(blockers).toEqual([]);
    });

    it("an unclassified (unknown) CUPS service never introduces a principal-diagnosis blocker", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            { id: "svc-1", cupsCode: "999999", ripsServiceType: "unknown", serviceValue: "", finalidadCode: "", causaMotivoCode: "" },
          ],
          diagnoses: [],
        }),
      );
      expect(blockers).toEqual([]);
    });

    it("never repeats the same principal-missing message once per affected service — one shared, actionable blocker", () => {
      const blockers = getEncounterFinalizeBlockers(
        base({
          services: [
            {
              id: "svc-1",
              cupsCode: "890203",
              ripsServiceType: "consultation",
              serviceValue: "50000",
              finalidadCode: "15",
              causaMotivoCode: "40",
            },
            { id: "svc-2", cupsCode: "230100", ripsServiceType: "procedure", serviceValue: "", finalidadCode: "15", causaMotivoCode: "" },
          ],
          diagnoses: [],
        }),
      );
      expect(blockers.filter((b) => b.includes("diagnóstico principal")).length).toBe(1);
    });
  });
});
