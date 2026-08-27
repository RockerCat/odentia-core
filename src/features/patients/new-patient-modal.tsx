"use client";

import { useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { createPatient } from "./actions";
import type { Patient } from "./data";

// Short intake form on purpose — full clinical intake/odontogram is a
// later module (see PROJECT_STATUS.md). Real write via createPatient()
// (public.patients, under patients_insert_admin_or_assistant RLS). Two
// separate Nombres/Apellidos fields rather than one "Nombre completo" —
// the real schema has first_name/last_name as separate required columns,
// and guessing a split from free text would risk silently wrong data on
// a real record (unlike the old local-only mock). No "Alergias" field —
// patients has no column for it yet; collecting it here would just
// silently drop what the user typed (see CLAUDE.md task scope: never
// fake a capability that doesn't persist).
export function NewPatientModal({
  clinicId,
  onClose,
  onCreate,
}: {
  clinicId: string;
  onClose: () => void;
  onCreate: (patient: Patient) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = Boolean(firstName.trim() && lastName.trim() && documentId.trim() && phone.trim()) && !creating;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    setError(null);

    const outcome = await createPatient({
      clinicId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      documentId: documentId.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      birthDate: birthDate || null,
    });

    setCreating(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    onCreate(outcome.patient);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo paciente"
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Nuevo paciente</p>
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
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-label-foreground">Nombres</span>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={FIELD_CLASS}
                  placeholder="Nombres"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-label-foreground">Apellidos</span>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={FIELD_CLASS}
                  placeholder="Apellidos"
                  required
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Documento</span>
              <input
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className={FIELD_CLASS}
                placeholder="CC 1.234.567"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-label-foreground">Fecha de nacimiento</span>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-label-foreground">Teléfono</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={FIELD_CLASS}
                  placeholder="+57 300 000 0000"
                  required
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Correo</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD_CLASS}
                placeholder="correo@ejemplo.com"
              />
            </label>

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canCreate}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creando…" : "Crear paciente"}
          </button>
        </div>
      </form>
    </div>
  );
}
