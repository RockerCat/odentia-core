"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { FIELD_CLASS, simulateSave } from "@/features/dashboard/appointment-detail-modal";
import type { TeamAssistant, TeamDentist } from "./mock-data";

type TeamMemberKind = "dentist" | "assistant";

export type TeamMemberEditing =
  | { kind: "dentist"; member: TeamDentist }
  | { kind: "assistant"; member: TeamAssistant };

function computeInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

// Single modal for both "+ Agregar miembro" and "Editar" (see task scope):
// creating lets you pick Odontólogo/Asistente up front; editing keeps
// whichever kind the member already is (reclassifying an existing member
// isn't a real-world action). Not wired to a backend — simulateSave fakes
// the round trip the same way NewPatientModal/NewAppointmentModal do.
export function TeamMemberModal({
  editing,
  onClose,
  onCreateDentist,
  onCreateAssistant,
  onUpdateDentist,
  onUpdateAssistant,
}: {
  editing: TeamMemberEditing | null;
  onClose: () => void;
  onCreateDentist: (dentist: TeamDentist) => void;
  onCreateAssistant: (assistant: TeamAssistant) => void;
  onUpdateDentist: (dentist: TeamDentist) => void;
  onUpdateAssistant: (assistant: TeamAssistant) => void;
}) {
  const [kind, setKind] = useState<TeamMemberKind>(editing?.kind ?? "dentist");
  const [name, setName] = useState(editing?.member.name ?? "");
  const [email, setEmail] = useState(editing?.member.email ?? "");
  const [phone, setPhone] = useState(editing?.member.phone ?? "");
  const [specialty, setSpecialty] = useState(editing?.kind === "dentist" ? editing.member.specialty : "");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(editing?.member.avatar_url);
  const [saving, setSaving] = useState(false);

  const canSave =
    Boolean(name.trim() && email.trim() && phone.trim() && (kind === "assistant" || specialty.trim())) && !saving;

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(typeof reader.result === "string" ? reader.result : undefined);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);

    if (kind === "dentist") {
      const dentist = await simulateSave<TeamDentist>({
        id: editing?.kind === "dentist" ? editing.member.id : `new-dentist-${Date.now()}`,
        name: name.trim(),
        initials: computeInitials(name.trim()),
        specialty: specialty.trim(),
        email: email.trim(),
        phone: phone.trim(),
        avatar_url: avatarUrl,
        status: editing?.member.status ?? "active",
      });
      if (editing?.kind === "dentist") onUpdateDentist(dentist);
      else onCreateDentist(dentist);
    } else {
      const assistant = await simulateSave<TeamAssistant>({
        id: editing?.kind === "assistant" ? editing.member.id : `new-assistant-${Date.now()}`,
        name: name.trim(),
        initials: computeInitials(name.trim()),
        email: email.trim(),
        phone: phone.trim(),
        avatar_url: avatarUrl,
        status: editing?.member.status ?? "active",
      });
      if (editing?.kind === "assistant") onUpdateAssistant(assistant);
      else onCreateAssistant(assistant);
    }

    setSaving(false);
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
        aria-label={editing ? "Editar miembro" : "Agregar miembro"}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">{editing ? "Editar miembro" : "Agregar miembro"}</p>
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
            {editing ? (
              <p className="text-xs text-label-foreground">{editing.kind === "dentist" ? "Odontólogo" : "Asistente"}</p>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setKind("dentist")}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    kind === "dentist"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border text-foreground/70 hover:bg-foreground/5"
                  }`}
                >
                  Odontólogo
                </button>
                <button
                  type="button"
                  onClick={() => setKind("assistant")}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    kind === "assistant"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border text-foreground/70 hover:bg-foreground/5"
                  }`}
                >
                  Asistente
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <UserAvatar name={name || "?"} initials={computeInitials(name) || "?"} avatar_url={avatarUrl} sizeClassName="size-12" />
              <label className="text-xs font-medium text-primary hover:text-primary/80">
                {avatarUrl ? "Cambiar foto" : "Agregar foto (opcional)"}
                <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              </label>
            </div>

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

            {kind === "dentist" && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-label-foreground">Especialidad</span>
                <input
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className={FIELD_CLASS}
                  placeholder="Ej. Ortodoncia"
                  required
                />
              </label>
            )}

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Correo</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD_CLASS}
                placeholder="correo@ejemplo.com"
                required
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
            disabled={!canSave}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando…" : editing ? "Guardar cambios" : "Agregar miembro"}
          </button>
        </div>
      </form>
    </div>
  );
}
