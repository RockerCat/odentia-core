"use client";

import { useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/form-primitives";
import { updateMyPersonalInfo, type PersonalInfo } from "./personal-info-actions";

// "Editar información personal" — her own name and phone (profiles). Email
// is shown read-only: it is her Auth login, not editable from here.
// Cancel/close discards the draft; nothing is saved until "Guardar".
export function PersonalInfoModal({
  initial,
  email,
  onClose,
  onSaved,
}: {
  initial: PersonalInfo;
  email: string;
  onClose: () => void;
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
      // Stays open with what she typed — never a false success.
      setError(outcome.message);
      return;
    }
    onSaved(outcome.value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={saving ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Editar información personal"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Editar información personal</p>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
            className="flex size-9 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5 disabled:opacity-50"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-4 px-5 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-label-foreground">Nombre</span>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" maxLength={80} required className={FIELD_CLASS} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-label-foreground">Apellido</span>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" maxLength={80} required className={FIELD_CLASS} />
              </label>
            </div>
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
            <div className="flex flex-col gap-1">
              <span className="text-xs text-label-foreground">Correo</span>
              <p className="truncate rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground/70">{email}</p>
              <span className="text-[11px] text-muted-foreground">Es tu correo de inicio de sesión; no se cambia desde aquí.</span>
            </div>
            {error && (
              <p className="text-xs text-danger" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="mt-auto flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={onClose}
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
      </div>
    </div>
  );
}
