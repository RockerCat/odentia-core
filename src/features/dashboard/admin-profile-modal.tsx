"use client"; // owns the identity/professional-profile edit drafts below.

import { useRef, useState, type ChangeEvent } from "react";
import { CloseIcon, PencilIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { CURRENT_USER } from "@/lib/current-user";
import { FIELD_CLASS } from "./appointment-detail-modal";
import { DAY_ORDER, SCHEDULE_TIME_OPTIONS } from "./appointments-card";
import { ROOMS } from "./mock-data";
import type { AdminIdentityOverride, AdminProfessionalProfile } from "@/dev/role-context";

const DEFAULT_SCHEDULE_DAYS = ["L", "M", "X", "J", "V"];
const DEFAULT_SCHEDULE_START = "8:00 AM";
const DEFAULT_SCHEDULE_END = "5:00 PM";

// The Clinic Admin's own "Mi perfil" — deliberately a separate modal from
// DentistProfileModal (see appointments-card.tsx), and deliberately simple:
// it only ever handles the "no Perfil profesional yet" flow. The moment one
// is configured, header.tsx stops opening this modal altogether and opens
// DentistProfileModal instead (same component the Dentist role's own
// profile already uses) — see onProfessionalProfileConfigured below. It
// never changes RoleContext's `role`: an admin who configures one stays
// "Administrador de Clínica" and is only additionally visible as a
// professional (see effectiveDentists in AppointmentsCard).
export function AdminProfileModal({
  onClose,
  onProfessionalProfileConfigured,
  adminIdentityOverride,
  setAdminIdentityOverride,
  setAdminProfessionalProfile,
}: {
  onClose: () => void;
  // Called right after the first-ever "Perfil profesional" save, so
  // header.tsx can swap this modal out for DentistProfileModal immediately.
  onProfessionalProfileConfigured: () => void;
  adminIdentityOverride: AdminIdentityOverride;
  setAdminIdentityOverride: (patch: AdminIdentityOverride) => void;
  setAdminProfessionalProfile: (profile: AdminProfessionalProfile | null) => void;
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

  const [configuringProfessional, setConfiguringProfessional] = useState(false);
  const [specialtyDraft, setSpecialtyDraft] = useState("");
  const [registrationDraft, setRegistrationDraft] = useState("");
  const [mainRoomDraft, setMainRoomDraft] = useState(ROOMS[0]);
  const [scheduleDaysDraft, setScheduleDaysDraft] = useState<string[]>(DEFAULT_SCHEDULE_DAYS);
  const [scheduleStartDraft, setScheduleStartDraft] = useState(DEFAULT_SCHEDULE_START);
  const [scheduleEndDraft, setScheduleEndDraft] = useState(DEFAULT_SCHEDULE_END);

  // This modal only ever mounts while there's no Perfil profesional yet
  // (see header.tsx), so there's never a previous draft to prefill here.
  const startConfiguringProfessional = () => {
    setSpecialtyDraft("");
    setRegistrationDraft("");
    setMainRoomDraft(ROOMS[0]);
    setScheduleDaysDraft(DEFAULT_SCHEDULE_DAYS);
    setScheduleStartDraft(DEFAULT_SCHEDULE_START);
    setScheduleEndDraft(DEFAULT_SCHEDULE_END);
    setConfiguringProfessional(true);
  };

  const toggleScheduleDraftDay = (day: string) => {
    setScheduleDaysDraft((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const cancelConfiguringProfessional = () => setConfiguringProfessional(false);

  const canSaveProfessionalProfile = Boolean(specialtyDraft.trim() && registrationDraft.trim());

  const saveProfessionalProfile = () => {
    if (!canSaveProfessionalProfile) return;
    setAdminProfessionalProfile({
      specialty: specialtyDraft.trim(),
      registrationNumber: registrationDraft.trim(),
      mainRoom: mainRoomDraft,
      scheduleDays: scheduleDaysDraft,
      scheduleStart: scheduleStartDraft,
      scheduleEnd: scheduleEndDraft,
    });
    setConfiguringProfessional(false);
    // Immediately hand off to DentistProfileModal instead of sticking
    // around to show a summary here — see onProfessionalProfileConfigured.
    onProfessionalProfileConfigured();
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

          {/* Perfil profesional — independent card, opt-in, additive. */}
          <div className="mt-6 rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold">Perfil profesional</h3>

            {configuringProfessional ? (
              <div className="mt-3 flex flex-col gap-3 text-sm">
                <div>
                  <label className="text-[11px] text-label-foreground">Especialidad</label>
                  <input
                    value={specialtyDraft}
                    onChange={(e) => setSpecialtyDraft(e.target.value)}
                    placeholder="Ej. Odontología general"
                    className={`${FIELD_CLASS} mt-1`}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-label-foreground">Registro profesional</label>
                  <input
                    value={registrationDraft}
                    onChange={(e) => setRegistrationDraft(e.target.value)}
                    placeholder="Ej. T.P. 00000"
                    className={`${FIELD_CLASS} mt-1`}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-label-foreground">Consultorio principal</label>
                  <select
                    value={mainRoomDraft}
                    onChange={(e) => setMainRoomDraft(e.target.value)}
                    className={`${FIELD_CLASS} mt-1`}
                  >
                    {ROOMS.map((room) => (
                      <option key={room} value={room}>
                        {room}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-label-foreground">Disponibilidad de atención</label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {DAY_ORDER.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleScheduleDraftDay(day)}
                        className={`flex size-7 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                          scheduleDaysDraft.includes(day)
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-foreground/5"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      value={scheduleStartDraft}
                      onChange={(e) => setScheduleStartDraft(e.target.value)}
                      className={FIELD_CLASS}
                    >
                      {SCHEDULE_TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <span className="text-muted-foreground">-</span>
                    <select
                      value={scheduleEndDraft}
                      onChange={(e) => setScheduleEndDraft(e.target.value)}
                      className={FIELD_CLASS}
                    >
                      {SCHEDULE_TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={cancelConfiguringProfessional}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={saveProfessionalProfile}
                    disabled={!canSaveProfessionalProfile}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground">¿También atiendes pacientes en esta clínica?</p>
                <button
                  type="button"
                  onClick={startConfiguringProfessional}
                  className="mt-2.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  Configurar perfil profesional
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
