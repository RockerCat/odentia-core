import { AlertTriangleIcon } from "@/components/shell/icons";
import type { PatientMedicalHistory } from "./medical-history-data";

// Shared "Alertas clínicas" block — approved demo design
// (clinical-record-screen.tsx), now fed by the real patient_medical_histories
// row instead of mock allergies/conditions/medications. Used by both the
// Historia Clínica screen (patient-clinical-record-screen.tsx) and the
// Pacientes quick-profile modal (patient-record-modal.tsx) — one shared
// component instead of two copies drifting apart. Never fabricated: if
// all three fields are empty/null, shows the neutral "sin alertas" state,
// never an invented alert.
export function ClinicalAlerts({ history }: { history: PatientMedicalHistory | null | undefined }) {
  const hasAlerts = Boolean(history?.allergies || history?.medicalConditions || history?.currentMedications);

  if (!hasAlerts) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-sm text-muted-foreground">
        Sin alertas clínicas registradas
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-danger/25 bg-danger/5 p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-danger uppercase">
        <AlertTriangleIcon className="size-3.5" />
        Alertas clínicas
      </p>
      <dl className="mt-2 flex flex-col gap-1.5 text-sm">
        {history?.allergies && (
          <div className="flex flex-wrap items-baseline gap-1.5">
            <dt className="shrink-0 text-xs font-semibold text-danger">Alergias:</dt>
            <dd className="text-danger">{history.allergies}</dd>
          </div>
        )}
        {history?.medicalConditions && (
          <div className="flex flex-wrap items-baseline gap-1.5">
            <dt className="shrink-0 text-xs font-semibold text-danger">Condiciones:</dt>
            <dd className="text-danger">{history.medicalConditions}</dd>
          </div>
        )}
        {history?.currentMedications && (
          <div className="flex flex-wrap items-baseline gap-1.5">
            <dt className="shrink-0 text-xs font-semibold text-danger">Medicamentos:</dt>
            <dd className="text-danger">{history.currentMedications}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
