// "Finalizar atención"'s pre-flight — the single source of truth
// real-clinical-encounter-screen.tsx's own handleFinalizeClick calls
// before ever opening the confirm dialog (this IS the authoritative gate
// on the real write, not just a disabled button: handleFinalize/the RPC
// call are only ever reachable through the confirm dialog this function
// gates). Four different kinds of rule live here, on purpose:
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
//   - an empty consultation causaMotivoCode (Prompt Ninja "corregir
//     Causa/Motivo según Finalidad de promoción y mantenimiento") is the
//     same kind of Odentia-ONLY forward-looking quality rule as
//     finalidadCode above, added for the same reason: removing the old
//     universal "38" default (real-clinical-encounter-screen.tsx's own
//     addConceptService/manual-CUPS-pick) means a new consultation can
//     now be born with no causaMotivoCode at all, and this is the gate
//     that stops "Finalizar atención" from completing one that way —
//     never applied to a procedimiento, which has no Causa/Motivo field
//     in the UI at all.
//   - a missing/incomplete principal diagnosis (below) is a REAL,
//     forward-only fix for the exact gap a real pilot encounter hit:
//     `/rips` requires `codDiagnosticoPrincipal` for every consulta/
//     procedimiento (and `tipoDiagnosticoPrincipal` for every consulta) —
//     see resolveDiagnosesForService's own comment — but nothing at
//     "Finalizar atención" time ever checked this, so an atención could
//     finalize and only THEN discover it could never be exported. This
//     reuses resolveDiagnosesForService (export-generator.ts) — the exact
//     same service-scoped-principal-wins/encounter-wide-fallback
//     resolution `/rips` itself uses to build the JSON — so "this
//     atención is ready to finalize" and "the generator can actually
//     resolve a principal for this service" can never disagree. Forward-
//     only: this never re-evaluates an already-finalized encounter (see
//     export-readiness.ts, unchanged) — a historical encounter missing a
//     principal stays exactly as pending in `/rips` as before.
// Pure and framework-free so the exact bug scenario ("incapacidad sin
// responder", "consulta 890203 sin valor cobrado", "finalidad sin
// seleccionar", "servicio sin diagnóstico principal resoluble") is unit-
// testable without rendering the (large, Supabase-backed) encounter
// screen.

import { resolveDiagnosesForService, type GeneratorDiagnosis } from "@/features/rips/export-generator";

export type FinalizeReadinessService = {
  // Matches ServiceRow.id (a real encounter_services.id for a
  // pre-existing row, or a locally-generated `svc-N` for a new one) — the
  // same id a `related`/`principal` diagnosis's `encounterServiceId` is
  // scoped to. Only used to resolve the principal diagnosis below, never
  // persisted from here.
  id: string;
  cupsCode: string;
  ripsServiceType: "consultation" | "procedure" | "unknown";
  // Raw form value, same shape as ServiceRow.serviceValue — "" means
  // empty, never yet parsed to a number.
  serviceValue: string;
  // Raw form value, same shape as ServiceRow.finalidadCode — "" means
  // empty. Finalidad is a real clinical decision (never defaulted, unlike
  // modalidad — see real-clinical-encounter-screen.tsx's own
  // addService/addConceptService), required for every classified
  // (consultation or procedure) service before finalizing.
  finalidadCode: string;
  // Raw form value, same shape as ServiceRow.causaMotivoCode — "" means
  // empty. Only meaningful for a consultation (a procedimiento has no
  // Causa/Motivo field in the UI at all — never checked here either).
  // No longer defaulted to "38" on creation (see this file's own header
  // comment) — required before finalizing so removing that default
  // never lets a consultation finalize silently incomplete.
  causaMotivoCode: string;
};

// Alias, not a redeclaration — the exact same shape
// resolveDiagnosesForService already consumes (see export-generator.ts),
// so there is only ever one definition of "what a diagnosis row looks
// like for principal/related resolution" in the whole codebase.
export type FinalizeReadinessDiagnosis = GeneratorDiagnosis;

export type FinalizeReadinessInput = {
  incapacityCode: string | null;
  services: FinalizeReadinessService[];
  diagnoses: FinalizeReadinessDiagnosis[];
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
    // Causa/Motivo — consultation-only, same pattern as the valor-cobrado
    // check above (never a procedimiento, which has no such field).
    if (s.ripsServiceType === "consultation" && s.causaMotivoCode.trim() === "") {
      blockers.push(`Falta indicar la causa o motivo de la consulta ${s.cupsCode || "seleccionada"}.`);
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

  // Principal diagnosis — RIPS #6D/#A4-adjacent gap: `codDiagnosticoPrincipal`
  // is REGULATORY REQUIRED for every consulta/procedimiento
  // (`tipoDiagnosticoPrincipal` additionally required for every consulta —
  // see resolveDiagnosesForService's own comment; a procedimiento has no
  // equivalent field). Only classified (consultation/procedure) services
  // are considered — an unclassified (unknown) CUPS is a separate,
  // pre-existing readiness problem, same exclusion as Finalidad above.
  //
  // The current MVP UI only ever offers ONE principal diagnosis row, and
  // it is always encounter-wide (no per-service scoping control exists
  // yet — see real-clinical-encounter-screen.tsx's own principalDiagnosis/
  // addDiagnosis("principal")) — so in practice every classified service
  // resolves against that SAME shared encounter-wide principal. Rather
  // than repeat an identical message once per affected service (there is
  // nothing service-specific for the clinician to act on — the one fix is
  // the same shared field), this collapses to a single, actionable
  // message per distinct problem, regardless of how many services it
  // affects. A future per-service-scoped principal would still resolve
  // correctly here (resolveDiagnosesForService already prefers a
  // service-scoped principal over the encounter-wide one) — this
  // consolidation is a messaging choice, not a resolution shortcut.
  const classifiedServices = input.services.filter((s) => s.ripsServiceType !== "unknown");

  const missingPrincipal = classifiedServices.some(
    (s) => resolveDiagnosesForService(input.diagnoses, s.id).principal === null,
  );
  if (missingPrincipal) {
    blockers.push("Agrega un diagnóstico principal antes de finalizar la atención.");
  }

  const consultationPrincipalMissingType = classifiedServices.some((s) => {
    if (s.ripsServiceType !== "consultation") return false;
    const { principal } = resolveDiagnosesForService(input.diagnoses, s.id);
    return principal !== null && !principal.diagnosisTypeCode;
  });
  if (consultationPrincipalMissingType) {
    blockers.push("El diagnóstico principal necesita tipo de diagnóstico antes de finalizar.");
  }

  return blockers;
}
