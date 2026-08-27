"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloseIcon, PhoneIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { updatePatient } from "./actions";
import type { Patient } from "./data";

function waLink(phone: string, message?: string): string {
  const base = `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

function initialsOf(patient: Patient): string {
  return `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase() || "?";
}

function ageOf(patient: Patient): number | null {
  if (!patient.birthDate) return null;
  const birth = new Date(patient.birthDate);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

const PATIENT_SINCE_FORMATTER = new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric" });

// Real patient detail — identity/contacto/estado only (see CLAUDE.md task
// scope: "Pacientes base real"). Deliberately a SEPARATE component from
// patient-detail-modal.tsx (not a shared one, despite the near-identical
// name/visual language): that file is Agenda's own "Ver paciente"
// quick-profile (appointments-card.tsx), still fully mock and explicitly
// out of scope to touch — its Patient shape (name/age/usualDentistId/…)
// and this real Patient shape (firstName/lastName/birthDate/active/…) are
// no longer compatible now that this side is real. Historia clínica,
// odontograma, resumen clínico, alergias, KPIs de citas y el acceso QR al
// portal quedan fuera de esta pasada — ninguno tiene tabla real todavía.
export function PatientRecordModal({
  patient,
  canEditPatientData,
  onClose,
  onUpdated,
}: {
  patient: Patient;
  canEditPatientData: boolean;
  onClose: () => void;
  onUpdated: (patient: Patient) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [firstNameDraft, setFirstNameDraft] = useState(patient.firstName);
  const [lastNameDraft, setLastNameDraft] = useState(patient.lastName);
  const [phoneDraft, setPhoneDraft] = useState(patient.phone ?? "");
  const [emailDraft, setEmailDraft] = useState(patient.email ?? "");
  const [documentDraft, setDocumentDraft] = useState(patient.documentId ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const age = ageOf(patient);

  const startEditing = () => {
    setFirstNameDraft(patient.firstName);
    setLastNameDraft(patient.lastName);
    setPhoneDraft(patient.phone ?? "");
    setEmailDraft(patient.email ?? "");
    setDocumentDraft(patient.documentId ?? "");
    setSaveError(null);
    setEditing(true);
  };

  const saveEditing = async () => {
    setSaving(true);
    setSaveError(null);
    const outcome = await updatePatient(patient.id, {
      firstName: firstNameDraft.trim() || patient.firstName,
      lastName: lastNameDraft.trim() || patient.lastName,
      phone: phoneDraft.trim() || null,
      email: emailDraft.trim() || null,
      documentId: documentDraft.trim() || null,
    });
    setSaving(false);
    if (outcome.status === "error") {
      setSaveError(outcome.message);
      return;
    }
    onUpdated({
      ...patient,
      firstName: firstNameDraft.trim() || patient.firstName,
      lastName: lastNameDraft.trim() || patient.lastName,
      phone: phoneDraft.trim() || null,
      email: emailDraft.trim() || null,
      documentId: documentDraft.trim() || null,
    });
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={fullName(patient)}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Paciente</p>
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
          <div className="flex flex-col items-center gap-2 text-center">
            <UserAvatar name={fullName(patient)} initials={initialsOf(patient)} sizeClassName="size-20" />

            {editing ? (
              <div className="flex w-full gap-2">
                <input
                  value={firstNameDraft}
                  onChange={(e) => setFirstNameDraft(e.target.value)}
                  placeholder="Nombres"
                  className={`${FIELD_CLASS} text-center`}
                />
                <input
                  value={lastNameDraft}
                  onChange={(e) => setLastNameDraft(e.target.value)}
                  placeholder="Apellidos"
                  className={`${FIELD_CLASS} text-center`}
                />
              </div>
            ) : (
              <p className="text-base font-semibold">{fullName(patient)}</p>
            )}

            {age !== null && <p className="text-sm text-muted-foreground">{age} años</p>}

            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                patient.active ? "border-primary/25 bg-primary/10 text-primary" : "border-danger/25 bg-danger/10 text-danger"
              }`}
            >
              {patient.active ? "Activo" : "Inactivo"}
            </span>

            {!editing && canEditPatientData && (
              <button type="button" onClick={startEditing} className="text-xs font-medium text-primary hover:underline">
                Editar datos
              </button>
            )}
          </div>

          <div className="mt-5 border-t border-border" />

          <dl
            className={`mt-5 flex flex-col gap-4 text-sm ${
              editing ? "rounded-lg border border-primary/15 bg-primary/[0.03] p-3" : ""
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-label-foreground">Teléfono</dt>
                {editing ? (
                  <input
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    className={`${FIELD_CLASS} max-w-[60%]`}
                  />
                ) : (
                  <dd className="truncate font-medium">{patient.phone || "Sin registrar"}</dd>
                )}
              </div>
              {!editing && patient.phone && (
                <a
                  href={waLink(patient.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  <PhoneIcon className="size-3" />
                  WhatsApp
                </a>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <dt className="text-label-foreground">Correo</dt>
              {editing ? (
                <input
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  className={`${FIELD_CLASS} max-w-[60%]`}
                />
              ) : (
                <dd className="truncate font-medium">{patient.email || "Sin registrar"}</dd>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <dt className="text-label-foreground">Documento</dt>
              {editing ? (
                <input
                  value={documentDraft}
                  onChange={(e) => setDocumentDraft(e.target.value)}
                  className={`${FIELD_CLASS} max-w-[60%]`}
                />
              ) : (
                <dd className="truncate font-medium">{patient.documentId || "Sin registrar"}</dd>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <dt className="text-label-foreground">Paciente desde</dt>
              <dd className="truncate font-medium">{PATIENT_SINCE_FORMATTER.format(new Date(patient.createdAt))}</dd>
            </div>
          </dl>

          {editing && (
            <>
              {saveError && <p className="mt-2 text-xs text-danger">{saveError}</p>}
              <div className="mt-4 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveEditing}
                  disabled={saving}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => router.push(`/pacientes/${patient.id}/historia-clinica`)}
            className="w-full rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground/80 hover:bg-foreground/5"
          >
            Ver historia clínica
          </button>
        </div>
      </div>
    </div>
  );
}
