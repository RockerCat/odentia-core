"use client";

import { useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { upsertPatientMedicalHistory } from "./medical-history-actions";
import type { PatientMedicalHistory } from "./medical-history-data";

const FIELDS = [
  { key: "allergies", label: "Alergias", placeholder: "Ej. Alergia a la penicilina" },
  { key: "currentMedications", label: "Medicamentos actuales", placeholder: "Ej. Losartán 50mg (1 vez al día)" },
  { key: "medicalConditions", label: "Condiciones médicas", placeholder: "Ej. Hipertensión arterial controlada" },
  { key: "surgeriesOrHospitalizations", label: "Cirugías / hospitalizaciones", placeholder: "Ej. Sin cirugías previas relevantes" },
  { key: "relevantFamilyHistory", label: "Antecedentes familiares relevantes", placeholder: "Ej. Madre con hipertensión" },
  { key: "observations", label: "Observaciones generales", placeholder: "Otra información relevante" },
] as const satisfies readonly { key: keyof PatientMedicalHistory; label: string; placeholder: string }[];

type Draft = Record<(typeof FIELDS)[number]["key"], string>;

function draftFrom(history: PatientMedicalHistory | null): Draft {
  return {
    allergies: history?.allergies ?? "",
    currentMedications: history?.currentMedications ?? "",
    medicalConditions: history?.medicalConditions ?? "",
    surgeriesOrHospitalizations: history?.surgeriesOrHospitalizations ?? "",
    relevantFamilyHistory: history?.relevantFamilyHistory ?? "",
    observations: history?.observations ?? "",
  };
}

// Real edit surface for Antecedentes — every field optional (see CLAUDE.md
// task scope, section 15: a professional doesn't have to fill everything
// in). Saves through upsertPatientMedicalHistory(), which calls
// upsert_patient_medical_history() — the RPC re-derives clinic_id/auth.uid()
// and re-checks authorization server-side, so this never assumes the
// button being visible was authorization enough on its own.
export function EditAntecedentesModal({
  patientId,
  history,
  onClose,
  onSaved,
}: {
  patientId: string;
  history: PatientMedicalHistory | null;
  onClose: () => void;
  onSaved: (history: PatientMedicalHistory) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(history));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (key: keyof Draft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    const outcome = await upsertPatientMedicalHistory({
      patientId,
      allergies: draft.allergies.trim() || null,
      currentMedications: draft.currentMedications.trim() || null,
      medicalConditions: draft.medicalConditions.trim() || null,
      surgeriesOrHospitalizations: draft.surgeriesOrHospitalizations.trim() || null,
      relevantFamilyHistory: draft.relevantFamilyHistory.trim() || null,
      observations: draft.observations.trim() || null,
    });

    setSaving(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    onSaved(outcome.history);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Actualizar antecedentes"
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Actualizar antecedentes</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3">
            {FIELDS.map(({ key, label, placeholder }) => (
              <label key={key} className="flex flex-col gap-1 text-sm">
                <span className="text-label-foreground">{label}</span>
                <textarea
                  value={draft[key]}
                  onChange={(e) => updateField(key, e.target.value)}
                  className={`${FIELD_CLASS} resize-none`}
                  rows={2}
                  placeholder={placeholder}
                />
              </label>
            ))}

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
