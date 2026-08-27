"use client";

import { useEffect, useState } from "react";
import { AlertTriangleIcon, BuildingIcon, ClipboardIcon, FlagIcon, NoteIcon, UsersIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { createClient } from "@/lib/supabase/client";
import { ClinicalInfoCard } from "./clinical-info-card";
import { EditAntecedentesModal } from "./edit-antecedentes-modal";
import type { PatientMedicalHistory } from "./medical-history-data";
import { resolveUpdatedByProfessional, type UpdatedByProfessional } from "./resolve-updated-by";

// Restores the approved demo's two-section grouping
// (clinical-record-screen.tsx's AntecedentesTab: "Anamnesis" +
// "Condiciones y factores relevantes") — this screen's own 6 real columns
// (see the patient_medical_histories migration) distributed semantically
// across them, each field appearing exactly once (the demo's mock also had
// three "*Summary" fields restating the same facts under different
// wording — never real distinct data, already consolidated away in an
// earlier pass, not reintroduced here).
const ANAMNESIS_FIELDS = [
  { key: "relevantFamilyHistory", icon: UsersIcon, label: "Antecedentes familiares" },
  { key: "surgeriesOrHospitalizations", icon: BuildingIcon, label: "Cirugías / hospitalizaciones" },
  { key: "observations", icon: NoteIcon, label: "Observaciones generales" },
] as const satisfies readonly { key: keyof PatientMedicalHistory; icon: typeof AlertTriangleIcon; label: string }[];

const CONDITIONS_FIELDS = [
  { key: "allergies", icon: AlertTriangleIcon, label: "Alergias" },
  { key: "currentMedications", icon: ClipboardIcon, label: "Medicamentos actuales" },
  { key: "medicalConditions", icon: FlagIcon, label: "Condiciones médicas" },
] as const satisfies readonly { key: keyof PatientMedicalHistory; icon: typeof AlertTriangleIcon; label: string }[];

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

const UPDATED_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// Real Antecedentes — one row per patient (public.patient_medical_histories),
// written exclusively through upsert_patient_medical_history() (see
// medical-history-actions.ts). canEdit comes from canEditClinicalData()
// (see clinical-permissions.ts), derived server-side from real
// membership.role + professional_profile.active — never the DEV role
// switcher.
export function AntecedentesTab({
  patientId,
  clinicId,
  history,
  canEdit,
  onUpdated,
}: {
  patientId: string;
  clinicId: string | null;
  history: PatientMedicalHistory | null;
  canEdit: boolean;
  onUpdated: (history: PatientMedicalHistory) => void;
}) {
  const [showEdit, setShowEdit] = useState(false);

  // Resolves updated_by → real name/avatar/specialty (see
  // resolve-updated-by.ts) — reactive on history.updatedBy so it re-resolves
  // automatically right after a save (the RPC always sets updated_by to
  // whoever just saved), not just on the initial load.
  const [updatedBy, setUpdatedBy] = useState<UpdatedByProfessional | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clinicId || !history?.updatedBy) {
        if (!cancelled) setUpdatedBy(null);
        return;
      }
      try {
        const supabase = createClient();
        const resolved = await resolveUpdatedByProfessional(supabase, clinicId, history.updatedBy);
        if (!cancelled) setUpdatedBy(resolved);
      } catch {
        if (!cancelled) setUpdatedBy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, history?.updatedBy]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Antecedentes</p>
            {history ? (
              <div className="mt-1 flex items-center gap-1.5">
                {updatedBy && (
                  <UserAvatar
                    name={updatedBy.name}
                    initials={initialsOf(updatedBy.name)}
                    avatar_url={updatedBy.avatarUrl ?? undefined}
                    sizeClassName="size-5"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Actualizado {UPDATED_FORMATTER.format(new Date(history.updatedAt))}
                  {updatedBy && ` · ${updatedBy.name}`}
                  {updatedBy?.specialtyName && ` · ${updatedBy.specialtyName}`}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Sin actualizaciones registradas</p>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
            >
              {history ? "Actualizar antecedentes" : "Registrar antecedentes"}
            </button>
          )}
        </div>

        {history ? (
          <>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ANAMNESIS_FIELDS.map(({ key, icon, label }) => (
                <ClinicalInfoCard key={key} icon={icon} label={label} value={(history[key] as string | null) ?? "No registrado"} />
              ))}
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold">Condiciones y factores relevantes</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CONDITIONS_FIELDS.map(({ key, icon, label }) => (
                  <ClinicalInfoCard key={key} icon={icon} label={label} value={(history[key] as string | null) ?? "No registrado"} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-border bg-background p-10 text-center">
            <p className="text-sm font-medium text-foreground">Aún no se han registrado antecedentes.</p>
          </div>
        )}
      </div>

      {showEdit && (
        <EditAntecedentesModal
          patientId={patientId}
          history={history}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            onUpdated(updated);
            setShowEdit(false);
          }}
        />
      )}
    </div>
  );
}
