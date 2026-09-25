"use client";

import { useState, type FormEvent } from "react";
import { FIELD_CLASS } from "@/features/dashboard/form-primitives";
import { updateMyPersonalInfo, type PersonalInfo } from "./personal-info-actions";

// "Información personal" in edit mode, INLINE in Mi perfil profesional's
// identity column: her own name and phone (profiles, via
// update_my_personal_info — always auth.uid()). Email is shown read-only:
// it is her Auth login. Cancelar discards the local draft without calling
// the backend; a failed save stays open with what she typed.
export function PersonalInfoForm({
  initial,
  email,
  onCancel,
  onSaved,
}: {
  initial: PersonalInfo;
  email: string;
  onCancel: () => void;
  onSaved: (value: PersonalInfo) => void;
}) {
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const outcome = await updateMyPersonalInfo({ firstName, lastName, phone });
    setSaving(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    onSaved(outcome.value);
  };

  return (
    <form onSubmit={handleSubmit} aria-label="Editar información personal" className="flex w-full flex-col gap-3 text-left">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-label-foreground">Nombre</span>
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" maxLength={80} required className={FIELD_CLASS} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-label-foreground">Apellido</span>
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" maxLength={80} required className={FIELD_CLASS} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-label-foreground">Teléfono</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          inputMode="tel"
          maxLength={30}
          placeholder="+57 300 123 4567"
          className={FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-label-foreground">Correo</span>
        <input value={email} readOnly disabled className={`${FIELD_CLASS} cursor-not-allowed opacity-70`} />
        <span className="text-[11px] text-muted-foreground">Es tu correo de inicio de sesión; no se cambia desde aquí.</span>
      </label>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="min-h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
