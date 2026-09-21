import type { FieldKey } from "@/features/rips/complete-encounter-rips-field-modal";
import type { EncounterClinicalData, EncounterServiceRecord } from "./clinical-encounters-data";

// Historia Clínica's Atenciones tab — "does this ONE already-finalized
// service still have a Finalidad/Causa gap" — exclusively that, nothing
// else. Never diagnosis, service value, modalidad, incapacidad, Servicio
// RIPS, or any other readiness concern; those stay export-readiness.ts's
// own job. Mirrors that file's own SERVICE_FINALIDAD_MISSING/
// CONSULTATION_CAUSA_MOTIVO_MISSING predicate exactly (same DT1 rule:
// Finalidad required for both Consulta/Procedimiento, Causa required for
// Consulta only) but kept as its own small, neutral module rather than
// importing from export-readiness.ts — that file operates on a
// differently-shaped RipsReadinessError[] built from a full period's
// readiness computation, which would be an odd, heavy coupling for a
// single boolean check over one already-loaded EncounterServiceRecord.
export function hasRipsFieldGap(
  service: Pick<EncounterServiceRecord, "ripsServiceType" | "finalidadCode" | "causaMotivoCode">,
): boolean {
  if (service.finalidadCode === null) return true;
  return service.ripsServiceType === "consultation" && service.causaMotivoCode === null;
}

// The exact visibility rule for AtencionesTab's "Información RIPS
// incompleta" indicator — Option B (never C, see this task's own
// Section 11): the indicator/CTA is never shown at all to a role with no
// clinical write authority, not even as a disabled state ("no mostrar
// una acción inútil a Assistant/Admin administrativo"). Extracted as its
// own pure function, separate from hasRipsFieldGap above, specifically
// so this visibility decision is unit-testable without rendering
// AtencionesTab — this repo has no component-rendering test
// infrastructure (no jsdom/RTL; vitest.config.ts only includes
// src/**/*.test.ts, never .tsx).
export function shouldShowRipsFieldGapIndicator(
  canEditClinicalData: boolean,
  services: Pick<EncounterServiceRecord, "ripsServiceType" | "finalidadCode" | "causaMotivoCode">[],
): boolean {
  return canEditClinicalData && services.some(hasRipsFieldGap);
}

// AtencionesTab's own local-update reducer, extracted as a pure function
// for the same "unit-testable without rendering" reason as
// shouldShowRipsFieldGapIndicator above. CompleteEncounterRipsFieldModal's
// own onFieldCorrected fires with the exact (serviceId, field, value)
// that was just persisted (see that file's own comment) — this applies
// that ONE change immutably to the LOCAL copy of encounterClinicalData
// AtencionesTab already owns, never a refetch: an encounter/service this
// map has no entry for is returned unchanged (defensive, should not
// normally happen since the modal only ever opens for an encounter
// already present here), and every other service/field on the map is
// untouched — a still-missing sibling field on the SAME service, or a
// gap on a DIFFERENT service in the same encounter, stays exactly as it
// was.
export function applyRipsFieldCorrection(
  data: Map<string, EncounterClinicalData>,
  encounterId: string,
  serviceId: string,
  field: FieldKey,
  value: string,
): Map<string, EncounterClinicalData> {
  const encounterData = data.get(encounterId);
  if (!encounterData) return data;

  const next = new Map(data);
  next.set(encounterId, {
    ...encounterData,
    services: encounterData.services.map((s) =>
      s.id === serviceId
        ? {
            ...s,
            finalidadCode: field === "finalidad_code" ? value : s.finalidadCode,
            causaMotivoCode: field === "causa_motivo_code" ? value : s.causaMotivoCode,
          }
        : s,
    ),
  });
  return next;
}
