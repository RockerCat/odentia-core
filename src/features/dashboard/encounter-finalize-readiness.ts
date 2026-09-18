// "Finalizar atención"'s pre-flight — the single source of truth
// real-clinical-encounter-screen.tsx's own handleFinalizeClick calls
// before ever opening the confirm dialog (this IS the authoritative gate
// on the real write, not just a disabled button: handleFinalize/the RPC
// call are only ever reachable through the confirm dialog this function
// gates). Two different kinds of rule live here, on purpose:
//   - incapacityCode null / an empty consultation serviceValue mirror
//     export-readiness.ts's own ENCOUNTER_INCAPACITY_MISSING/
//     SERVICE_VALUE_MISSING rules EXACTLY — those ARE export/regulatory
//     requirements, never a second, divergent copy of those rules.
//   - an empty finalidadCode is deliberately Odentia-ONLY: a forward-
//     looking internal quality rule for NEW encounters, not a
//     regulatory/export requirement (finalidadTecnologiaSalud stays
//     optional per the DT1 as documented — see
//     docs/rips-json-mapping.md). export-readiness.ts's own
//     getEncounterRipsReadiness deliberately never checks it, so a
//     historical encounter finalized before this rule existed, with
//     finalidad_code still null, stays ready for export — never a
//     retroactive blocker.
// Pure and framework-free so the exact bug scenario ("incapacidad sin
// responder", "consulta 890203 sin valor cobrado", "finalidad sin
// seleccionar") is unit-testable without rendering the (large,
// Supabase-backed) encounter screen.

export type FinalizeReadinessService = {
  cupsCode: string;
  ripsServiceType: "consultation" | "procedure" | "unknown";
  // Raw form value, same shape as ServiceRow.serviceValue — "" means
  // empty, never yet parsed to a number.
  serviceValue: string;
  // Raw form value, same shape as ServiceRow.finalidadCode — "" means
  // empty. Finalidad is a real clinical decision (never defaulted, unlike
  // modalidad/causa — see real-clinical-encounter-screen.tsx's own
  // addService/addConceptService), required for every classified
  // (consultation or procedure) service before finalizing.
  finalidadCode: string;
};

export type FinalizeReadinessInput = {
  incapacityCode: string | null;
  services: FinalizeReadinessService[];
};

// Never defaults incapacityCode to "No" ("02") — an explicit Sí/No choice
// is required; "sin responder" (null) always blocks, it's never silently
// resolved into a regulatory fact Odentia doesn't actually have (same
// principle export-generator.ts's own incapacityCode comment states).
export function getEncounterFinalizeBlockers(input: FinalizeReadinessInput): string[] {
  const blockers: string[] = [];
  if (input.incapacityCode === null) {
    blockers.push("Falta indicar si hubo incapacidad (Sí/No).");
  }
  for (const s of input.services) {
    if (s.ripsServiceType === "consultation" && s.serviceValue.trim() === "") {
      blockers.push(`Falta el valor cobrado al paciente por la consulta ${s.cupsCode || "seleccionada"}.`);
    }
    // Finalidad — a real clinical decision, never defaulted (unlike
    // modalidad/causa). Applies to both consulta and procedimiento
    // (export-generator.ts serializes finalidadTecnologiaSalud for both),
    // never to an unclassified (unknown) CUPS — that's a separate,
    // pre-existing readiness problem (SERVICE_CUPS_UNCLASSIFIED).
    if (s.ripsServiceType !== "unknown" && s.finalidadCode.trim() === "") {
      const label = s.ripsServiceType === "consultation" ? "la consulta" : "el procedimiento";
      blockers.push(`Falta indicar la finalidad de ${label} ${s.cupsCode || "seleccionada/o"}.`);
    }
  }
  return blockers;
}
