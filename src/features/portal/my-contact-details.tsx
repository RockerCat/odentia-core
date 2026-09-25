"use client";

import { useState, type FormEvent } from "react";
import { useToast } from "@/components/toast";
import { FIELD_CLASS } from "@/features/dashboard/form-primitives";
import { notifyIdentityChanged } from "@/features/session/identity-events";
import { updateMyPatientPhone } from "./my-contact-actions";

// /portal/perfil's personal data, read ↔ edit INLINE in the same card
// (same interaction as Mi perfil profesional). Only the phone is editable
// (her own patients.phone, update_my_patient_phone); email is her Auth
// login and the document is her clinic-managed identity — both read-only.
export function MyContactDetails({ phone: initialPhone, email, documentId }: { phone: string | null; email: string | null; documentId: string | null }) {
  const { showToast } = useToast();
  const [phone, setPhone] = useState(initialPhone);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setDraft(phone ?? "");
    setError(null);
    setEditing(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const outcome = await updateMyPatientPhone(draft);
    setSaving(false);
    if (outcome.status === "error") {
      // Stays in edit mode with what she typed — never a false success.
      setError(outcome.message);
      return;
    }
    setPhone(outcome.value);
    setEditing(false);
    // Portal chrome re-resolves the same patient record.
    notifyIdentityChanged();
    showToast("Información personal actualizada");
  };

  if (editing) {
    return (
      <form onSubmit={handleSubmit} aria-label="Editar información personal" className="mt-5 flex flex-col gap-3 border-t border-border pt-5 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-label-foreground">Teléfono</span>
          <input
            type="tel"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="tel"
            inputMode="tel"
            maxLength={30}
            placeholder="+57 300 123 4567"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-label-foreground">Correo</span>
          <input value={email ?? ""} readOnly disabled className={`${FIELD_CLASS} cursor-not-allowed opacity-70`} />
          <span className="text-[11px] text-muted-foreground">Es tu correo de inicio de sesión; no se cambia desde aquí.</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-label-foreground">Documento</span>
          <input value={documentId ?? ""} readOnly disabled className={`${FIELD_CLASS} cursor-not-allowed opacity-70`} />
        </label>
        <p className="text-[11px] text-muted-foreground">Tu nombre, documento y fecha de nacimiento los actualiza tu clínica.</p>
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="min-h-11 flex-1 rounded-lg border border-border px-4 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 flex-1 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={startEdit}
          className="min-h-11 w-full rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground/80 hover:bg-foreground/5 sm:w-auto"
        >
          Editar información personal
        </button>
      </div>

      <div className="mt-5 border-t border-border" />

      <dl className="mt-5 flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="shrink-0 text-label-foreground">Teléfono</dt>
          <dd className="min-w-0 text-right font-medium break-words">{phone || "No registrado"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="shrink-0 text-label-foreground">Correo</dt>
          <dd className="min-w-0 text-right font-medium break-all">{email || "No registrado"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="shrink-0 text-label-foreground">Documento</dt>
          <dd className="min-w-0 text-right font-medium break-all">{documentId || "No registrado"}</dd>
        </div>
      </dl>
    </>
  );
}
