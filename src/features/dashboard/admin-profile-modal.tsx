"use client"; // owns the identity/professional-profile edit drafts below.

import { useRef, useState, type ChangeEvent } from "react";
import { CloseIcon, PencilIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { CURRENT_USER } from "@/lib/current-user";
import { FIELD_CLASS } from "./appointment-detail-modal";
import type { AdminIdentityOverride } from "@/dev/role-context";

// The Clinic Admin's own "Mi perfil" — identity fields only (Nombre/
// Correo/Teléfono/Foto, still mock/local, out of this task's scope). The
// "Perfil profesional" card below is no longer a second, local, non-
// persistent form (see PROMPT NINJA "Clinic Admin → crear perfil
// profesional real"): "Configurar perfil profesional" now navigates
// straight to /mi-perfil-profesional's own real creation flow
// (MyProfessionalProfileSection → create_my_professional_profile(), see
// that migration) — the same real experience an existing Dentist/Admin-
// odontóloga already edits from, never a second, divergent form. This
// modal never changes RoleContext's `role`: an admin who creates one stays
// "Administrador de Clínica", additionally visible as a professional once
// the real professional_profiles row exists.
export function AdminProfileModal({
  onClose,
  onConfigureProfessionalProfile,
  adminIdentityOverride,
  setAdminIdentityOverride,
}: {
  onClose: () => void;
  // "Configurar perfil profesional" — closes this modal and navigates to
  // the real /mi-perfil-profesional creation flow (see header.tsx).
  onConfigureProfessionalProfile: () => void;
  adminIdentityOverride: AdminIdentityOverride;
  setAdminIdentityOverride: (patch: AdminIdentityOverride) => void;
}) {
  const displayName = adminIdentityOverride.name ?? CURRENT_USER.name;
  const displayEmail = adminIdentityOverride.email ?? CURRENT_USER.email;
  const displayPhone = adminIdentityOverride.phone ?? CURRENT_USER.phone;
  const displayAvatar = adminIdentityOverride.avatar_url ?? CURRENT_USER.avatar_url;

  const [editingIdentity, setEditingIdentity] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [emailDraft, setEmailDraft] = useState(displayEmail);
  const [phoneDraft, setPhoneDraft] = useState(displayPhone);
  const [photoDraft, setPhotoDraft] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startEditingIdentity = () => {
    setNameDraft(displayName);
    setEmailDraft(displayEmail);
    setPhoneDraft(displayPhone);
    setPhotoDraft(null);
    setEditingIdentity(true);
  };

  const cancelIdentityEdit = () => {
    setPhotoDraft(null);
    setEditingIdentity(false);
  };

  const saveIdentityEdit = () => {
    setAdminIdentityOverride({
      name: nameDraft.trim() || displayName,
      email: emailDraft.trim() || displayEmail,
      phone: phoneDraft.trim() || displayPhone,
      ...(photoDraft ? { avatar_url: photoDraft } : {}),
    });
    setPhotoDraft(null);
    setEditingIdentity(false);
  };

  const handlePhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPhotoDraft(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mi perfil"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Mi perfil</p>
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
          {/* Identidad administrativa */}
          <div className="flex flex-col items-center gap-2 text-center">
            {editingIdentity ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Cambiar foto de perfil"
                className="group relative rounded-full"
              >
                <UserAvatar
                  name={displayName}
                  initials={CURRENT_USER.initials}
                  avatar_url={photoDraft ?? displayAvatar}
                  sizeClassName="size-16"
                />
                <span className="pointer-events-none absolute inset-0 rounded-full bg-foreground/0 transition-colors group-hover:bg-foreground/40" />
                <span className="pointer-events-none absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                  <PencilIcon className="size-2.5" />
                </span>
              </button>
            ) : (
              <UserAvatar
                name={displayName}
                initials={CURRENT_USER.initials}
                avatar_url={displayAvatar}
                sizeClassName="size-16"
              />
            )}

            {editingIdentity && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handlePhotoSelect}
                className="hidden"
              />
            )}

            {!editingIdentity && (
              <button
                type="button"
                onClick={startEditingIdentity}
                className="text-xs font-medium text-primary hover:underline"
              >
                Editar perfil
              </button>
            )}
          </div>

          <dl
            className={`mt-5 flex flex-col gap-3 text-sm ${
              editingIdentity ? "rounded-lg border border-primary/15 bg-primary/[0.03] p-3" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <dt className="text-label-foreground">Nombre</dt>
              {editingIdentity ? (
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className={`${FIELD_CLASS} max-w-[60%]`}
                />
              ) : (
                <dd className="truncate font-medium">{displayName}</dd>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-label-foreground">Correo</dt>
              {editingIdentity ? (
                <input
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  className={`${FIELD_CLASS} max-w-[60%]`}
                />
              ) : (
                <dd className="truncate font-medium">{displayEmail}</dd>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-label-foreground">Teléfono</dt>
              {editingIdentity ? (
                <input
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  className={`${FIELD_CLASS} max-w-[60%]`}
                />
              ) : (
                <dd className="truncate font-medium">{displayPhone}</dd>
              )}
            </div>
            {/* Rol y Clínica actual are always fixed — never editable here. */}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-label-foreground">Rol</dt>
              <dd className="truncate font-medium">Administrador de Clínica</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-label-foreground">Clínica actual</dt>
              <dd className="truncate font-medium">{CURRENT_USER.clinicName}</dd>
            </div>
          </dl>

          {editingIdentity && (
            <div className="mt-4 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={cancelIdentityEdit}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveIdentityEdit}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Guardar cambios
              </button>
            </div>
          )}

          {/* Perfil profesional — independent card, opt-in, additive.
              "Configurar perfil profesional" navigates straight to the
              real /mi-perfil-profesional creation flow (see
              onConfigureProfessionalProfile/header.tsx) — no local
              draft/form here anymore. */}
          <div className="mt-6 rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold">Perfil profesional</h3>
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">¿También atiendes pacientes en esta clínica?</p>
              <button
                type="button"
                onClick={onConfigureProfessionalProfile}
                className="mt-2.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                Configurar perfil profesional
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
