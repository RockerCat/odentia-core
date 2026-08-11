"use client"; // owns the identity edit draft below.

import { useRef, useState, type ChangeEvent } from "react";
import { CloseIcon, PencilIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { ROLE_LABELS } from "@/dev/role"; // DEV TOOL — see src/dev/role.ts
import type { AssistantIdentityOverride } from "@/dev/role-context";
import { CURRENT_ASSISTANT } from "@/lib/current-user";
import { FIELD_CLASS } from "./appointment-detail-modal";

// The Assistant's own "Mi perfil" — simple and purely administrative on
// purpose (see CLAUDE.md Domain Model: an Assistant is never a clinical
// professional). Deliberately a separate, smaller modal from
// DentistProfileModal/AdminProfileModal, not a stripped-down version of
// either — no specialty, registration, room, schedule, KPIs, patients, or
// agenda ever show up here.
export function AssistantProfileModal({
  onClose,
  assistantIdentityOverride,
  setAssistantIdentityOverride,
}: {
  onClose: () => void;
  assistantIdentityOverride: AssistantIdentityOverride;
  setAssistantIdentityOverride: (patch: AssistantIdentityOverride) => void;
}) {
  const displayName = assistantIdentityOverride.name ?? CURRENT_ASSISTANT.name;
  const displayEmail = assistantIdentityOverride.email ?? CURRENT_ASSISTANT.email;
  const displayPhone = assistantIdentityOverride.phone ?? CURRENT_ASSISTANT.phone;
  const displayAvatar = assistantIdentityOverride.avatar_url ?? CURRENT_ASSISTANT.avatar_url;

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
    setAssistantIdentityOverride({
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
                  initials={CURRENT_ASSISTANT.initials}
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
                initials={CURRENT_ASSISTANT.initials}
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
              <dd className="truncate font-medium">{ROLE_LABELS.assistant}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-label-foreground">Clínica actual</dt>
              <dd className="truncate font-medium">{CURRENT_ASSISTANT.clinicName}</dd>
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
        </div>
      </div>
    </div>
  );
}
