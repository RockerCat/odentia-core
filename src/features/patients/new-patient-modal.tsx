"use client";

import { useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS, simulateSave } from "@/features/dashboard/appointment-detail-modal";
import type { Patient } from "./mock-data";

function computeInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

// Short intake form on purpose — full clinical intake/odontogram is a later
// module (see PROJECT_STATUS.md). Not wired to a real backend: creates a
// local mock Patient the same way NewAppointmentModal simulates creating an
// appointment.
export function NewPatientModal({
  defaultDentistId,
  onClose,
  onCreate,
}: {
  // No profesional field in this short form — every new patient starts
  // assigned to the clinic's first professional; reassigning is a normal
  // "Editar datos" edit afterwards.
  defaultDentistId: string;
  onClose: () => void;
  onCreate: (patient: Patient) => void;
}) {
  const [name, setName] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [allergies, setAllergies] = useState("");
  const [creating, setCreating] = useState(false);

  const canCreate = Boolean(name.trim() && documentId.trim() && phone.trim()) && !creating;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    const age = birthDate ? Math.max(0, new Date().getFullYear() - new Date(birthDate).getFullYear()) : 0;
    const created = await simulateSave<Patient>({
      id: `new-${Date.now()}`,
      name: name.trim(),
      initials: computeInitials(name.trim()),
      age,
      phone: phone.trim(),
      email: email.trim(),
      documentId: documentId.trim(),
      patientSinceLabel: "Ago 2026",
      isNewThisMonth: true,
      usualDentistId: defaultDentistId,
      allergies: allergies.trim() || undefined,
      status: "active",
    });
    onCreate(created);
    setCreating(false);
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
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Nombre completo</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={FIELD_CLASS}
                placeholder="Nombre y apellidos"
                required
              />
            </label>
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
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Alergias / alertas importantes</span>
              <textarea
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                className={`${FIELD_CLASS} resize-none`}
                rows={2}
                placeholder="Ej. Alergia a la penicilina"
              />
            </label>
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
