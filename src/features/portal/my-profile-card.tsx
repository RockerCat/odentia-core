"use client";

import { useState, type FormEvent } from "react";
import { useToast } from "@/components/toast";
import { ProfilePhotoField } from "@/features/clinic/profile-photo-field";
import { FIELD_CLASS } from "@/features/dashboard/form-primitives";
import { notifyIdentityChanged } from "@/features/session/identity-events";
import { updateMyPatientPhone } from "./my-contact-actions";

export type MyProfileCardData = {
  name: string;
  initials: string;
  age: number | null;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  // Human-readable date ("12 de marzo de 2006"), null when not registered.
  birthDateLabel: string | null;
  // RIPS TipoDocumento label + number when set; otherwise the legacy
  // free-text document (documentType null, documentNumber = that value).
  documentTypeLabel: string | null;
  documentNumber: string | null;
  clinicName: string;
  // Same "odontólogo habitual" rule as Historia Clínica / /portal/clinica;
  // null → the row is simply omitted.
  usualDentist: { name: string; specialty: string | null } | null;
};

// /portal/perfil — same family as Mi perfil profesional: identity column
// (large photo, name, age, "Editar información personal") beside "Mi
// información" + "Mi clínica"; one column (identity first) until lg.
// Only the phone is editable (her own patients.phone, update_my_patient_phone);
// the rest is read-only (Auth login / clinic-managed identity).
export function MyProfileCard({ data }: { data: MyProfileCardData }) {
  const { showToast } = useToast();
  const [phone, setPhone] = useState(data.phone);
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

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6 lg:p-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] lg:gap-10">
        <section aria-label="Mi identidad" className="flex min-w-0 flex-col items-center gap-4 text-center lg:border-r lg:border-border lg:pr-10">
          {/* Her own profile photo (set_my_avatar) — also in the Portal header.
              160px on mobile, 208px from lg (next/image gets both sizes). */}
          <ProfilePhotoField
            name={data.name}
            initials={data.initials}
            initialAvatarUrl={data.avatarUrl}
            sizeClassName="size-40 lg:size-52"
            textClassName="text-4xl font-semibold lg:text-5xl"
            imageSizes={{ sizes: "(min-width: 1024px) 416px, 320px", px: 208 }}
          >
            <div className="mb-1 flex min-w-0 max-w-full flex-col items-center gap-1">
              <p className="max-w-full text-xl leading-tight font-semibold break-words">{data.name}</p>
              {data.age !== null && <p className="text-sm text-muted-foreground">{data.age} años</p>}
            </div>
          </ProfilePhotoField>

          {editing ? (
            <form onSubmit={handleSubmit} aria-label="Editar información personal" className="flex w-full flex-col gap-3 text-left text-sm">
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
                <input value={data.email ?? ""} readOnly disabled className={`${FIELD_CLASS} cursor-not-allowed opacity-70`} />
                <span className="text-[11px] text-muted-foreground">Es tu correo de inicio de sesión; no se cambia desde aquí.</span>
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
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground/80 hover:bg-foreground/5 sm:w-auto"
            >
              Editar información personal
            </button>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-8">
          <section aria-label="Mi información" className="min-w-0">
            <h2 className="text-lg font-semibold">Mi información</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Tus datos personales y la información registrada por tu clínica.</p>
            <dl className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm sm:grid-cols-2 sm:p-5">
              <InfoItem label="Fecha de nacimiento" value={data.birthDateLabel} />
              <InfoItem label="Teléfono" value={phone} />
              {data.documentTypeLabel ? (
                <>
                  <InfoItem label="Tipo de documento" value={data.documentTypeLabel} />
                  <InfoItem label="Número de documento" value={data.documentNumber} />
                </>
              ) : (
                <InfoItem label="Documento" value={data.documentNumber} />
              )}
              <InfoItem label="Correo" value={data.email} wide email />
            </dl>
          </section>

          <section aria-label="Mi clínica" className="min-w-0">
            <h2 className="text-lg font-semibold">Mi clínica</h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm sm:grid-cols-2 sm:p-5">
              <InfoItem label="Clínica" value={data.clinicName} />
              {data.usualDentist && (
                <div className="min-w-0">
                  <dt className="text-xs text-label-foreground">Tu odontólogo habitual</dt>
                  <dd className="mt-0.5 font-medium break-words">{data.usualDentist.name}</dd>
                  {data.usualDentist.specialty && <dd className="text-xs font-medium text-primary">{data.usualDentist.specialty}</dd>}
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

// One read-only field; a missing value reads "No registrado", never invented.
// overflow-wrap:anywhere breaks a long document only where it must; an
// email gets a preferred break right after "@" (user / domain) instead of
// splitting the domain.
function InfoItem({ label, value, wide = false, email = false }: { label: string; value: string | null; wide?: boolean; email?: boolean }) {
  const at = email && value ? value.indexOf("@") : -1;
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs text-label-foreground">{label}</dt>
      <dd className={`mt-0.5 font-medium [overflow-wrap:anywhere] ${value ? "" : "text-muted-foreground"}`}>
        {value && at > 0 ? (
          <>
            {value.slice(0, at + 1)}
            <wbr />
            {value.slice(at + 1)}
          </>
        ) : (
          value || "No registrado"
        )}
      </dd>
    </div>
  );
}
