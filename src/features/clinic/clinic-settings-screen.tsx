"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { BuildingIcon, PencilIcon, PlusIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { updateClinicInfo } from "@/features/clinic/actions";
import type { ClinicDetail, PrimaryLocation, TeamMember } from "@/features/clinic/data";
import { CLINIC_LOGO_ACCEPTED_TYPES, CLINIC_LOGO_MAX_BYTES, removeClinicLogo, uploadClinicLogo } from "@/features/clinic/logo";
import { PrimaryLocationSection } from "@/features/clinic/primary-location-section";
import { createRoom, renameRoom, setRoomActive } from "@/features/rooms/actions";
import type { Room } from "@/features/rooms/data";

// Clínica — 100% real data or an honest empty state, no mock fallback
// anywhere in this tree (see CLAUDE.md task scope: "cero fallbacks mock").
// Does not import useRole()/session.ts/mock-data.ts/CURRENT_USER — the DEV
// · Cambiar rol switcher (src/dev/role-switcher.tsx) can keep existing
// globally for other screens' previews, but changing it must never affect
// what this screen shows (see task scope, section 15). Four section cards
// in one vertical page, each independently self-contained, visually
// unchanged from the approved design — a card showing less because a
// backend piece (invitations, membership status RPC, professional_profiles
// RPC) doesn't exist yet is the correct, honest state, not a bug (see task
// scope, section 13). Consultorios (below) is the one section with real
// INSERT/UPDATE wired from day one — see the rooms migration and
// ConsultoriosSection's own comment; no extra client-side role gate here
// beyond the rest of this file's own convention (this whole route is
// already Clinic Admin only, see src/app/clinica/page.tsx's
// allowedRoles={["clinic-admin"]}) — rooms_insert_admin/rooms_update_admin
// RLS is the real enforcement either way.
export function ClinicSettingsScreen({
  clinic,
  location,
  members,
  selfMember,
  rooms,
}: {
  clinic: ClinicDetail;
  location: PrimaryLocation | null;
  members: TeamMember[];
  selfMember: TeamMember | null;
  rooms: Room[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <InformacionGeneralSection clinic={clinic} location={location} />
      <EquipoSection members={members} />
      <MiPerfilProfesionalSection selfMember={selfMember} />
      <ConsultoriosSection clinicId={clinic.id} initialRooms={rooms} />
    </div>
  );
}

// Same border-primary/10 (Activo) vs border-danger/10 (Inactivo) pill
// already used for Dentist/Patient status elsewhere in the app (see
// DentistProfileModal, patient-detail-modal.tsx) — reused here for both
// Equipo's membership.status and Mi perfil profesional's
// professional_profile.active (two distinct real booleans/enums, both
// collapsed to this same two-state visual — it never had a third state).
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        active ? "border-primary/25 bg-primary/10 text-primary" : "border-danger/25 bg-danger/10 text-danger"
      }`}
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

// 1. Información general — a 3-column grid on desktop: cols 1-2 hold the
// clinic's editable fields (each individually inline-editable, see
// InfoField), col 3 holds the logo, integrated in the same card/row rather
// than a separate section below (see task scope). Below that grid, a
// dedicated "Ubicación de la sede principal" sub-section (see
// PrimaryLocationSection) bundles address/city/state with the map — a
// logically separate "sede" entity in the real schema
// (clinic_locations, under clinic_locations_update_admin RLS), and address/
// city/state/lat/lng need to change together (editing the text invalidates
// the pin — see that component), which doesn't fit InfoField's one-field-
// at-a-time model. Collapses to one column on tablet/mobile, data first
// then logo, purely from DOM order + grid-cols-1. WhatsApp has no column
// anywhere in the schema — kept as local-only state, never persisted (see
// task scope, section 1). legal_name/tax_id/status are real clinics
// columns with no editor in this approved screen — not wired here; see the
// task report.
function InformacionGeneralSection({ clinic, location }: { clinic: ClinicDetail; location: PrimaryLocation | null }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(clinic.logoUrl);
  // Which logo action is in flight, not just whether one is — "Cambiar
  // logo" and "Eliminar logo" used to share a single boolean, so removing
  // the logo showed "Guardando…" on the OTHER (Cambiar logo) button while
  // Eliminar logo itself just went disabled with no label change of its
  // own — looked like the wrong action was running.
  const [logoAction, setLogoAction] = useState<"uploading" | "removing" | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clinicName, setClinicName] = useState(clinic.name);
  const [phone, setPhone] = useState(clinic.phone ?? "");
  const [email, setEmail] = useState(clinic.email ?? "");

  // Only one field editable at a time (see task scope) — a single key here,
  // rather than each InfoField owning its own "isEditing" state.
  const [editingField, setEditingField] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const saveClinicField = async (key: "name" | "phone" | "email", next: string, apply: () => void) => {
    setSavingField(key);
    setFieldError(null);
    const outcome = await updateClinicInfo(clinic.id, { [key]: next });
    setSavingField(null);
    if (outcome.status === "error") {
      setFieldError("No pudimos guardar el cambio. Intenta de nuevo.");
      return;
    }
    apply();
    setEditingField(null);
  };

  const handleChangeClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!CLINIC_LOGO_ACCEPTED_TYPES.includes(file.type)) {
      setLogoError("El archivo debe ser PNG, JPG o SVG.");
      return;
    }
    if (file.size > CLINIC_LOGO_MAX_BYTES) {
      setLogoError("El logo no puede superar los 2 MB.");
      return;
    }

    setLogoAction("uploading");
    setLogoError(null);
    const outcome = await uploadClinicLogo(clinic.id, file);
    setLogoAction(null);
    if ("failed" in outcome) {
      setLogoError("No pudimos subir el logo. Intenta de nuevo.");
      return;
    }
    setLogoUrl(outcome.logoUrl);
  };

  const handleRemoveLogo = async () => {
    setLogoAction("removing");
    setLogoError(null);
    const outcome = await removeClinicLogo(clinic.id);
    setLogoAction(null);
    if (outcome.status === "error") {
      setLogoError("No pudimos quitar el logo. Intenta de nuevo.");
      return;
    }
    setLogoUrl(null);
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold">Información general</h2>

      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 text-sm sm:grid-cols-2 lg:col-span-2">
          <InfoField
            label="Nombre de la clínica"
            value={clinicName}
            isEditing={editingField === "name"}
            saving={savingField === "name"}
            error={editingField === "name" ? fieldError : null}
            onStartEdit={() => setEditingField("name")}
            onSave={(next) => saveClinicField("name", next, () => setClinicName(next))}
            onCancel={() => setEditingField(null)}
            className="sm:col-span-2"
          />
          <InfoField
            label="Teléfono"
            value={phone}
            isEditing={editingField === "phone"}
            saving={savingField === "phone"}
            error={editingField === "phone" ? fieldError : null}
            onStartEdit={() => setEditingField("phone")}
            onSave={(next) => saveClinicField("phone", next, () => setPhone(next))}
            onCancel={() => setEditingField(null)}
          />
          {/* No columna real para WhatsApp en el schema (clinics solo tiene
              phone) y no existe una decisión real de reusar el teléfono
              como WhatsApp — mostrar "No configurado" en vez de un campo
              editable que nunca se guardaría (ver task scope, sección 9). */}
          <div>
            <dt className="text-xs text-label-foreground">WhatsApp</dt>
            <dd className="mt-0.5 truncate font-medium text-muted-foreground">No configurado</dd>
          </div>
          <InfoField
            label="Correo"
            value={email}
            type="email"
            isEditing={editingField === "email"}
            saving={savingField === "email"}
            error={editingField === "email" ? fieldError : null}
            onStartEdit={() => setEditingField("email")}
            onSave={(next) => saveClinicField("email", next, () => setEmail(next))}
            onCancel={() => setEditingField(null)}
          />
        </div>

        <div className="lg:col-span-1">
          <p className="text-sm font-medium text-foreground">Logo de la clínica</p>
          <p className="text-xs text-muted-foreground">Se muestra al paciente en la Agenda, junto al nombre de tu clínica.</p>

          {/* Not a square avatar-style box — logos can be horizontal,
              square, or vertical, so object-contain (never object-cover)
              always shows the full image, uncropped and undistorted, at
              whatever size fits within these bounds. Height is the box's
              only real constraint (width already fills the column) — a
              taller ceiling here is what lets a square/vertical logo
              render meaningfully bigger; a horizontal logo, already
              width-bound well under the old 96px height, looks basically
              the same as before. */}
          <div className="mt-3 flex h-48 w-full items-center justify-center rounded-lg border border-border bg-surface p-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Storage public URL, not worth Next/Image's optimization pipeline
              <img src={logoUrl} alt="Logo de la clínica" className="max-h-full max-w-full object-contain" />
            ) : (
              <BuildingIcon className="size-6 text-muted-foreground" />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleChangeClick}
              disabled={logoAction !== null}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-50"
            >
              {logoAction === "uploading" ? "Guardando…" : "Cambiar logo"}
            </button>
            <button
              type="button"
              onClick={handleRemoveLogo}
              disabled={!logoUrl || logoAction !== null}
              className="text-xs font-medium text-danger/80 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              {logoAction === "removing" ? "Eliminando…" : "Eliminar logo"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={CLINIC_LOGO_ACCEPTED_TYPES.join(",")}
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
          {logoError && <p className="mt-1.5 text-xs text-danger">{logoError}</p>}
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <PrimaryLocationSection location={location} />
      </div>
    </div>
  );
}

// A single field that reads as plain text (dt label + dd value) until
// clicked — on the value itself or the small pencil — at which point it
// (only it, see editingField above) turns into an input with compact
// Cancelar/Guardar actions. Mirrors the pencil-triggered inline-edit
// language already established in appointments-card.tsx's
// EditableProfileRow, extended with Enter/Escape (see task scope).
// `saving`/`error` reflect a real async save (see InformacionGeneralSection
// above) — Guardar disables and shows "Guardando…" mid-request, and a
// failure keeps the field open with a friendly message instead of silently
// reverting (see task scope, section 4: no double-submit, no raw errors).
function InfoField({
  label,
  value,
  isEditing,
  saving = false,
  error = null,
  disabled = false,
  onStartEdit,
  onSave,
  onCancel,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  isEditing: boolean;
  saving?: boolean;
  error?: string | null;
  disabled?: boolean;
  onStartEdit: () => void;
  onSave: (next: string) => void;
  onCancel: () => void;
  type?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);

  const startEdit = () => {
    if (disabled) return;
    setDraft(value);
    onStartEdit();
  };
  const confirm = () => {
    if (saving) return;
    onSave(draft.trim() || value);
  };

  if (isEditing) {
    return (
      <div className={className}>
        <span className="text-xs text-label-foreground">{label}</span>
        <input
          autoFocus
          type={type}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirm();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          className={`${FIELD_CLASS} mt-0.5`}
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        <div className="mt-1.5 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md px-2 py-1 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving}
            className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <dt className="text-xs text-label-foreground">{label}</dt>
      <div className="mt-0.5 flex items-center gap-1.5">
        <dd
          onClick={startEdit}
          className={`min-w-0 flex-1 truncate font-medium ${value ? "" : "text-muted-foreground"} ${disabled ? "" : "cursor-pointer hover:text-primary"}`}
        >
          {value || "No configurado"}
        </dd>
        {!disabled && (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`Editar ${label}`}
            className="shrink-0 text-muted-foreground/50 hover:text-primary"
          >
            <PencilIcon className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// 2. Equipo — a single compact list (odontólogos + asistentes together, not
// two separate cards) so the section stays easy to scan; no per-member
// cards (see task scope: "evitar cards gigantes para cada miembro").
//
// Real data: one row per clinic_membership (see
// src/features/clinic/data.ts's fetchTeamMembers) — a Clinic Admin who
// also has a professional_profile is naturally a single row with both
// role and specialty, never a separate "dentist" entry (see task scope,
// section 7 — no dedup logic needed, the real data model already
// guarantees this). "Agregar miembro"/"Editar"/"Activar"/"Desactivar" are
// visible but disabled: none of them are safely wireable yet — real
// invitations don't exist (clinic_invitations' accept flow is a future
// task, see section 9), and clinic_memberships/professional_profiles both
// have no UPDATE policy at all today, deliberately reserved for a future
// RPC (see task scope, sections 8/10) — never opened via a broad policy or
// a direct client UPDATE for convenience.
function EquipoSection({ members }: { members: TeamMember[] }) {
  const roleLabel = (member: TeamMember): string => {
    const specialty = member.professionalProfile?.specialtyName;
    if (member.role === "clinic_admin") {
      if (!member.professionalProfile) return "Administrador";
      return specialty ? `Administrador · Odontólogo · ${specialty}` : "Administrador · Odontólogo";
    }
    if (member.role === "dentist") return specialty ? `Odontólogo · ${specialty}` : "Odontólogo";
    return "Asistente";
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Equipo</h2>
        <button
          type="button"
          disabled
          title="El flujo de invitaciones todavía no está disponible."
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 opacity-50 disabled:cursor-not-allowed"
        >
          <PlusIcon className="size-3.5" />
          Agregar miembro
        </button>
      </div>

      {members.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Todavía no tienes otros miembros en tu equipo.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {members.map((member) => {
            const name = `${member.firstName} ${member.lastName}`.trim() || member.email;
            const initials =
              `${member.firstName[0] ?? ""}${member.lastName[0] ?? ""}`.toUpperCase() || member.email[0]?.toUpperCase() || "?";
            const isActive = member.status === "active";
            return (
              <li key={member.membershipId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar name={name} initials={initials} avatar_url={member.avatarUrl ?? undefined} sizeClassName="size-9" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">{roleLabel(member)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge active={isActive} />
                  <button
                    type="button"
                    disabled
                    title="La edición de miembros del equipo todavía no está disponible."
                    className="text-xs font-medium text-primary opacity-50 disabled:cursor-not-allowed"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Cambiar el estado de un miembro requiere una función segura que todavía no existe."
                    className={`text-xs font-medium opacity-50 disabled:cursor-not-allowed ${isActive ? "text-danger/80" : "text-primary"}`}
                  >
                    {isActive ? "Desactivar" : "Reactivar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// 3. Mi perfil profesional — Administrador + Odontólogo, never a role swap
// (see task scope). Real display only: selfMember comes from the real
// team list, matched server-side by the authenticated profile.id (see
// src/app/clinica/page.tsx) — never RoleContext/useRole() (see task
// scope, sections 5/15). Editing stays disabled: professional_profiles
// has no INSERT/UPDATE RLS policy at all yet (deliberately reserved for a
// future RPC with a column whitelist — see the foundation RLS migration),
// so this never opens a mutation, real or mock.
function MiPerfilProfesionalSection({ selfMember }: { selfMember: TeamMember | null }) {
  const professionalProfile = selfMember?.professionalProfile ?? null;
  // Real equivalent of the old mock "Administrador Odontólogo Único"
  // framing — she's always the practicing dentist here by definition, so
  // the "también atiendo pacientes" checkbox copy doesn't apply.
  const isAdminWithProfile = selfMember?.role === "clinic_admin" && professionalProfile !== null;
  const selfName = selfMember ? `${selfMember.firstName} ${selfMember.lastName}`.trim() || selfMember.email : "";
  const selfInitials =
    selfMember && (`${selfMember.firstName[0] ?? ""}${selfMember.lastName[0] ?? ""}`.toUpperCase() || selfMember.email[0]?.toUpperCase() || "?");

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      {isAdminWithProfile ? (
        <>
          <h2 className="text-base font-semibold">Mi información profesional</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tu especialidad, registro y horario como odontóloga de la clínica.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-base font-semibold">Mi perfil profesional</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tu especialidad y registro como profesional, si atiendes pacientes en esta clínica.
          </p>
        </>
      )}

      {selfMember && (
        <div className="mt-4 flex items-center gap-3">
          <UserAvatar name={selfName} initials={selfInitials || "?"} avatar_url={selfMember.avatarUrl ?? undefined} sizeClassName="size-10" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selfName}</p>
            <p className="truncate text-xs text-muted-foreground">{selfMember.email}</p>
          </div>
        </div>
      )}

      {professionalProfile ? (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-label-foreground">Especialidad</dt>
              <dd className="mt-0.5 font-medium">{professionalProfile.specialtyName ?? "Sin especialidad configurada"}</dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Registro profesional</dt>
              <dd className="mt-0.5 font-medium">{professionalProfile.licenseNumber || "No configurado"}</dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Duración de cita</dt>
              <dd className="mt-0.5 font-medium">
                {professionalProfile.defaultAppointmentDurationMinutes
                  ? `${professionalProfile.defaultAppointmentDurationMinutes} min`
                  : "No configurado"}
              </dd>
            </div>
            {/* No hay modelo real de horarios todavía (ver task scope,
                sección 7) — honesto en vez de inventar un horario. */}
            <div>
              <dt className="text-xs text-label-foreground">Horario</dt>
              <dd className="mt-0.5 font-medium text-muted-foreground">Horario aún no configurado</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-label-foreground">Biografía</dt>
              <dd className="mt-0.5 font-medium">{professionalProfile.bio || "No configurado"}</dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Estado</dt>
              <dd className="mt-1">
                <StatusBadge active={professionalProfile.active} />
              </dd>
            </div>
          </dl>
          <button
            type="button"
            disabled
            title="La edición de tu perfil profesional todavía no está disponible."
            className="mt-3 text-xs font-medium text-primary opacity-50 disabled:cursor-not-allowed"
          >
            Editar perfil profesional
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          <p>Todavía no tienes un perfil profesional configurado en esta clínica.</p>
          <button
            type="button"
            disabled
            title="Configurar tu perfil profesional todavía no está disponible."
            className="mt-3 text-xs font-medium text-primary opacity-50 disabled:cursor-not-allowed"
          >
            Configurar perfil profesional
          </button>
        </div>
      )}
    </div>
  );
}

// 4. Consultorios — real, tenant-scoped catalog (public.rooms, see the
// rooms migration) backing "Nueva cita"'s Consultorio picker (see
// real-new-appointment-modal.tsx/real-appointment-detail-modal.tsx, which
// read the active names from this same table instead of
// dashboard/mock-data.ts's old ROOMS). Same list/actions pattern already
// used for Configuración's own Tratamientos section
// (src/features/treatments/treatments-section.tsx) — reused here, not
// duplicated into a second copy under /configuracion (see this task's own
// scope): same card/divide-y-list/StatusBadge visual language as Equipo
// above, same inline add/rename forms, same active=false lifecycle (no
// physical delete — a room that already backs an appointment's `room`
// snapshot must stay findable).
function ConsultoriosSection({ clinicId, initialRooms }: { clinicId: string; initialRooms: Room[] }) {
  const [rooms, setRooms] = useState(initialRooms);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startAdd = () => {
    setError(null);
    setNewName("");
    setAdding(true);
  };

  const cancelAdd = () => {
    setAdding(false);
    setNewName("");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    const outcome = await createRoom(clinicId, name);
    setCreating(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setRooms((prev) => [...prev, outcome.room].sort((a, b) => a.name.localeCompare(b.name)));
    setAdding(false);
    setNewName("");
  };

  const startEdit = (room: Room) => {
    setError(null);
    setEditingId(room.id);
    setEditingName(room.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleRename = async (e: FormEvent, room: Room) => {
    e.preventDefault();
    const name = editingName.trim();
    if (!name || savingId) return;
    if (name === room.name) {
      cancelEdit();
      return;
    }
    setSavingId(room.id);
    setError(null);
    const outcome = await renameRoom(room.id, name);
    setSavingId(null);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, name } : r)).sort((a, b) => a.name.localeCompare(b.name)));
    cancelEdit();
  };

  const handleToggleActive = async (room: Room) => {
    setSavingId(room.id);
    setError(null);
    const outcome = await setRoomActive(room.id, !room.active);
    setSavingId(null);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, active: !r.active } : r)));
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Consultorios</h2>
        {!adding && (
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
          >
            <PlusIcon className="size-3.5" />
            Agregar consultorio
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleCreate} className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del consultorio"
            autoFocus
            className={FIELD_CLASS}
          />
          <button
            type="submit"
            disabled={!newName.trim() || creating}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={cancelAdd}
            disabled={creating}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
          >
            Cancelar
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {rooms.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Aún no hay consultorios configurados.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {rooms.map((room) => (
            <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              {editingId === room.id ? (
                <form onSubmit={(e) => handleRename(e, room)} className="flex flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                    className={FIELD_CLASS}
                  />
                  <button
                    type="submit"
                    disabled={!editingName.trim() || savingId === room.id}
                    className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {savingId === room.id ? "Guardando…" : "Guardar"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={savingId === room.id}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <p className="min-w-0 truncate text-sm font-medium">{room.name}</p>
                  <div className="flex items-center gap-3">
                    <StatusBadge active={room.active} />
                    <button
                      type="button"
                      onClick={() => startEdit(room)}
                      disabled={savingId === room.id}
                      className="text-xs font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(room)}
                      disabled={savingId === room.id}
                      className={`text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                        room.active ? "text-danger/80" : "text-primary"
                      }`}
                    >
                      {savingId === room.id ? "Guardando…" : room.active ? "Desactivar" : "Reactivar"}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
