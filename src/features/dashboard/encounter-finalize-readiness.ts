// "Finalizar atención"'s RIPS pre-flight — the single source of truth
// real-clinical-encounter-screen.tsx's own handleFinalizeClick calls
// before ever opening the confirm dialog. Mirrors export-readiness.ts's
// own ENCOUNTER_INCAPACITY_MISSING/SERVICE_VALUE_MISSING rules EXACTLY
// (incapacityCode null, or a consultation-classified service with an
// empty serviceValue) — never a second, divergent copy of those rules.
// Pure and framework-free so the exact bug scenario ("incapacidad sin
// responder", "consulta 890203 sin valor cobrado") is unit-testable
// without rendering the (large, Supabase-backed) encounter screen.

export type FinalizeReadinessService = {
  cupsCode: string;
  ripsServiceType: "consultation" | "procedure" | "unknown";
  // Raw form value, same shape as ServiceRow.serviceValue — "" means
  // empty, never yet parsed to a number.
  serviceValue: string;
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
  }
  return blockers;
}
