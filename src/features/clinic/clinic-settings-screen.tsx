"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { BuildingIcon, PencilIcon, PlusIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { AdminProfileModal } from "@/features/dashboard/admin-profile-modal";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { DentistProfileModal, formatScheduleLabel } from "@/features/dashboard/appointments-card";
import { WEEK_APPOINTMENTS } from "@/features/dashboard/mock-data";
import { useAuthenticatedIdentity } from "@/features/dashboard/use-authenticated-identity";
import { CURRENT_USER } from "@/lib/current-user";
import {
  CLINIC_INFO_MOCK,
  CLINIC_ROOMS_MOCK,
  TEAM_ASSISTANTS,
  TEAM_DENTISTS,
  type ClinicInfo,
  type ClinicRoom,
  type TeamAssistant,
  type TeamDentist,
  type TeamStatus,
} from "./mock-data";
import { MemberStatusModal } from "./member-status-modal";
import { RoomModal } from "./room-modal";
import { TeamMemberModal } from "./team-member-modal";

// Clínica: identity, team, and rooms for the clinic — UI/UX only, all mock
// state local to this screen, nothing persisted (see task scope). Four
// section cards in one vertical page, each independently self-contained.
export function ClinicSettingsScreen() {
  return (
    <div className="flex flex-col gap-6">
      <InformacionGeneralSection />
      <EquipoSection />
      <MiPerfilProfesionalSection />
      <ConsultoriosSection />
    </div>
  );
}

// Same border-primary/10 (Activo) vs border-danger/10 (Inactivo) pill
// already used for Dentist/Patient status elsewhere in the app (see
// DentistProfileModal, patient-detail-modal.tsx) — reused here for both
// Equipo and Consultorios rows instead of inventing a second status style.
function StatusBadge({ status }: { status: TeamStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        status === "active" ? "border-primary/25 bg-primary/10 text-primary" : "border-danger/25 bg-danger/10 text-danger"
      }`}
    >
      {status === "active" ? "Activo" : "Inactivo"}
    </span>
  );
}

// 1. Información general — a 3-column grid on desktop: cols 1-2 hold the
// clinic's data fields (each individually inline-editable, see InfoField),
// col 3 holds the logo, integrated in the same card/row rather than a
// separate section below (see task scope). Collapses to one column on
// tablet/mobile, data first then logo, purely from DOM order + grid-cols-1.
function InformacionGeneralSection() {
  const [logoUrl, setLogoUrl] = useState<string | null>(CURRENT_USER.clinicLogoUrl ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clinicName, setClinicName] = useState(CURRENT_USER.clinicName);
  const [info, setInfo] = useState<ClinicInfo>(CLINIC_INFO_MOCK);
  // Only one field editable at a time (see task scope) — a single key here,
  // rather than each InfoField owning its own "isEditing" state.
  const [editingField, setEditingField] = useState<string | null>(null);

  const handleChangeClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setLogoUrl(URL.createObjectURL(file));
    e.target.value = "";
  };

  const handleRemoveLogo = () => setLogoUrl(null);

  const updateInfo = (key: keyof ClinicInfo) => (next: string) => {
    setInfo((prev) => ({ ...prev, [key]: next }));
    setEditingField(null);
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
            onStartEdit={() => setEditingField("name")}
            onSave={(next) => {
              setClinicName(next);
              setEditingField(null);
            }}
            onCancel={() => setEditingField(null)}
            className="sm:col-span-2"
          />
          <InfoField
            label="Teléfono"
            value={info.phone}
            isEditing={editingField === "phone"}
            onStartEdit={() => setEditingField("phone")}
            onSave={updateInfo("phone")}
            onCancel={() => setEditingField(null)}
          />
          <InfoField
            label="WhatsApp"
            value={info.whatsapp}
            isEditing={editingField === "whatsapp"}
            onStartEdit={() => setEditingField("whatsapp")}
            onSave={updateInfo("whatsapp")}
            onCancel={() => setEditingField(null)}
          />
          <InfoField
            label="Correo"
            value={info.email}
            type="email"
            isEditing={editingField === "email"}
            onStartEdit={() => setEditingField("email")}
            onSave={updateInfo("email")}
            onCancel={() => setEditingField(null)}
          />
          <InfoField
            label="Ciudad"
            value={info.city}
            isEditing={editingField === "city"}
            onStartEdit={() => setEditingField("city")}
            onSave={updateInfo("city")}
            onCancel={() => setEditingField(null)}
          />
          <InfoField
            label="Dirección"
            value={info.address}
            isEditing={editingField === "address"}
            onStartEdit={() => setEditingField("address")}
            onSave={updateInfo("address")}
            onCancel={() => setEditingField(null)}
            className="sm:col-span-2"
          />
        </div>

        <div className="lg:col-span-1">
          <p className="text-sm font-medium text-foreground">Logo de la clínica</p>
          <p className="text-xs text-muted-foreground">Se muestra en Agenda, junto al nombre de tu clínica.</p>

          {/* Not a square avatar-style box — logos can be horizontal,
              square, or vertical, so object-contain (never object-cover)
              always shows the full image, uncropped and undistorted, at
              whatever size fits within these bounds. */}
          <div className="mt-3 flex h-24 w-full items-center justify-center rounded-lg border border-border bg-surface p-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local mock preview (object URL / static asset), not worth Next/Image's optimization pipeline
              <img src={logoUrl} alt="Logo de la clínica" className="max-h-full max-w-full object-contain" />
            ) : (
              <BuildingIcon className="size-6 text-muted-foreground" />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleChangeClick}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
            >
              Cambiar logo
            </button>
            <button
              type="button"
              onClick={handleRemoveLogo}
              disabled={!logoUrl}
              className="text-xs font-medium text-danger/80 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              Eliminar logo
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </div>
        </div>
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
function InfoField({
  label,
  value,
  isEditing,
  onStartEdit,
  onSave,
  onCancel,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (next: string) => void;
  onCancel: () => void;
  type?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);

  const startEdit = () => {
    setDraft(value);
    onStartEdit();
  };
  const confirm = () => onSave(draft.trim() || value);

  if (isEditing) {
    return (
      <div className={className}>
        <span className="text-xs text-label-foreground">{label}</span>
        <input
          autoFocus
          type={type}
          value={draft}
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
        <div className="mt-1.5 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2 py-1 text-xs font-medium text-foreground/70 hover:bg-foreground/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Guardar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <dt className="text-xs text-label-foreground">{label}</dt>
      <div className="mt-0.5 flex items-center gap-1.5">
        <dd onClick={startEdit} className="min-w-0 flex-1 cursor-pointer truncate font-medium hover:text-primary">
          {value}
        </dd>
        <button
          type="button"
          onClick={startEdit}
          aria-label={`Editar ${label}`}
          className="shrink-0 text-muted-foreground/50 hover:text-primary"
        >
          <PencilIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}

// 2. Equipo — a single compact list (odontólogos + asistentes together, not
// two separate cards) so the section stays easy to scan; no per-member
// cards (see task scope: "evitar cards gigantes para cada miembro").
type TeamRow = { kind: "dentist"; member: TeamDentist } | { kind: "assistant"; member: TeamAssistant };

function EquipoSection() {
  const [dentists, setDentists] = useState<TeamDentist[]>(TEAM_DENTISTS);
  const [assistants, setAssistants] = useState<TeamAssistant[]>(TEAM_ASSISTANTS);
  // "+ Agregar miembro" (either kind) and editing an existing Asistente
  // still go through the simple TeamMemberModal — this task's scope is
  // only Equipo > Editar for odontólogos (see editingDentist below), which
  // reuses Perfil del profesional instead.
  const [modal, setModal] = useState<"closed" | "create" | { kind: "assistant"; member: TeamAssistant }>("closed");
  // Editar on a dentist row opens the exact same "Perfil del profesional"
  // modal used elsewhere (Agenda board, shell Header) straight into its
  // edit chrome, instead of the old standalone "Editar miembro" modal —
  // see DentistProfileModal's initialEditMode/initialStatus. Estado itself
  // is no longer editable there at all (see task scope) — Activar/
  // Desactivar is this section's own dedicated action below.
  const [editingDentist, setEditingDentist] = useState<TeamDentist | null>(null);
  // Desactivar/Reactivar always goes through a confirmation modal now —
  // never an immediate toggle (see task scope). Carries the full row
  // (not separately-destructured kind/member) so TS keeps the
  // dentist/assistant correlation intact.
  const [statusModal, setStatusModal] = useState<(TeamRow & { action: "deactivate" | "reactivate" }) | null>(null);

  const toggleDentistStatus = (id: string, next: TeamStatus) => {
    setDentists((prev) => prev.map((d) => (d.id === id ? { ...d, status: next } : d)));
  };
  const toggleAssistantStatus = (id: string, next: TeamStatus) => {
    setAssistants((prev) => prev.map((a) => (a.id === id ? { ...a, status: next } : a)));
  };

  const rows: TeamRow[] = [
    ...dentists.map((member): TeamRow => ({ kind: "dentist", member })),
    ...assistants.map((member): TeamRow => ({ kind: "assistant", member })),
  ];

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Equipo</h2>
        <button
          type="button"
          onClick={() => setModal("create")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
        >
          <PlusIcon className="size-3.5" />
          Agregar miembro
        </button>
      </div>

      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {rows.map((row) => (
          <li key={`${row.kind}-${row.member.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar name={row.member.name} initials={row.member.initials} avatar_url={row.member.avatar_url} sizeClassName="size-9" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.member.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.kind === "dentist" ? `Odontólogo · ${row.member.specialty}` : "Asistente"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={row.member.status} />
              <button
                type="button"
                onClick={() => (row.kind === "dentist" ? setEditingDentist(row.member) : setModal(row))}
                className="text-xs font-medium text-primary hover:text-primary/80"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() =>
                  setStatusModal({ ...row, action: row.member.status === "active" ? "deactivate" : "reactivate" })
                }
                className={`text-xs font-medium ${
                  row.member.status === "active" ? "text-danger/80 hover:text-danger" : "text-primary hover:text-primary/80"
                }`}
              >
                {row.member.status === "active" ? "Desactivar" : "Reactivar"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {modal !== "closed" && (
        <TeamMemberModal
          editing={modal === "create" ? null : modal}
          onClose={() => setModal("closed")}
          onCreateDentist={(d) => setDentists((prev) => [...prev, d])}
          onCreateAssistant={(a) => setAssistants((prev) => [...prev, a])}
          onUpdateDentist={(d) => setDentists((prev) => prev.map((x) => (x.id === d.id ? d : x)))}
          onUpdateAssistant={(a) => setAssistants((prev) => prev.map((x) => (x.id === a.id ? a : x)))}
        />
      )}

      {editingDentist && (
        <DentistProfileModal
          dentist={editingDentist}
          initialEditMode
          initialStatus={editingDentist.status}
          onClose={() => setEditingDentist(null)}
          // No "self" identity to sync here — this is always an admin
          // editing someone else's record from Equipo.
          onSelfProfileChange={() => {}}
        />
      )}

      {statusModal && (
        <MemberStatusModal
          action={statusModal.action}
          kind={statusModal.kind}
          memberId={statusModal.member.id}
          memberName={statusModal.member.name}
          appointments={statusModal.kind === "dentist" ? WEEK_APPOINTMENTS : undefined}
          activeDentists={
            statusModal.kind === "dentist"
              ? dentists.filter((d) => d.status === "active" && d.id !== statusModal.member.id)
              : undefined
          }
          onClose={() => setStatusModal(null)}
          onConfirm={() => {
            const next: TeamStatus = statusModal.action === "deactivate" ? "inactive" : "active";
            if (statusModal.kind === "dentist") toggleDentistStatus(statusModal.member.id, next);
            else toggleAssistantStatus(statusModal.member.id, next);
            setStatusModal(null);
          }}
        />
      )}
    </div>
  );
}

// 3. Mi perfil profesional — Administrador + Odontólogo, never a role swap
// (see task scope). No inline form of its own anymore: this is now just a
// toggle + a read-only summary, and every actual edit (first-time setup or
// later changes) happens through the exact same "Mi perfil" modal(s) the
// shell Header already opens from the avatar menu — AdminProfileModal for
// the "not configured yet" case, DentistProfileModal (self-view) once it
// is. Both read/write RoleContext's `adminProfessionalProfile` directly,
// so this section, the Header, and the Agenda's dentist columns are all
// looking at the exact same single source of truth — nothing here is a
// second copy of that state or of the form that edits it.
function MiPerfilProfesionalSection() {
  const { adminProfessionalProfile, setAdminProfessionalProfile, adminIdentityOverride, setAdminIdentityOverride } =
    useRole();
  const { professionalRecord } = useAuthenticatedIdentity();
  const isActive = adminProfessionalProfile !== null;

  const [modal, setModal] = useState<"closed" | "configure" | "edit">("closed");

  // Mirrors header.tsx's own handleAdminDentistProfileChange exactly (kept
  // local rather than imported — it's a few lines of RoleContext wiring,
  // not a form/component, so duplicating it here is simpler and safer than
  // reaching into the Header for it): DentistProfileModal's generic name/
  // specialty/avatar edits need routing to the right place — name/avatar
  // are "Mi perfil" identity fields, specialty lives on the professional
  // profile itself.
  const handleAdminDentistProfileChange = (patch: { name?: string; specialty?: string; avatar_url?: string }) => {
    if (patch.name !== undefined || patch.avatar_url !== undefined) {
      setAdminIdentityOverride({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.avatar_url !== undefined ? { avatar_url: patch.avatar_url } : {}),
      });
    }
    if (patch.specialty !== undefined && adminProfessionalProfile) {
      setAdminProfessionalProfile({ ...adminProfessionalProfile, specialty: patch.specialty });
    }
  };

  const handleToggle = () => {
    if (isActive) {
      setAdminProfessionalProfile(null);
      return;
    }
    // Not configured yet — open "Mi perfil" straight away (see task scope).
    setModal("configure");
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold">Mi perfil profesional</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Sigues siendo Administrador — esto solo agrega que también atiendes pacientes en tu clínica.
      </p>

      <label className="mt-4 flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={handleToggle}
          className="size-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
        />
        <span className="font-medium">También atiendo pacientes en esta clínica</span>
      </label>

      {isActive && adminProfessionalProfile && (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-label-foreground">Especialidad</dt>
              <dd className="mt-0.5 font-medium">{adminProfessionalProfile.specialty}</dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Registro profesional</dt>
              <dd className="mt-0.5 font-medium">{adminProfessionalProfile.registrationNumber || "Sin registrar"}</dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Consultorio principal</dt>
              <dd className="mt-0.5 font-medium">{adminProfessionalProfile.mainRoom}</dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Horario</dt>
              <dd className="mt-0.5 font-medium">
                {formatScheduleLabel(
                  adminProfessionalProfile.scheduleDays,
                  adminProfessionalProfile.scheduleStart,
                  adminProfessionalProfile.scheduleEnd,
                )}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => setModal("edit")}
            className="mt-3 text-xs font-medium text-primary hover:text-primary/80"
          >
            Editar perfil profesional
          </button>
        </div>
      )}

      {isActive && (
        <p className="mt-3 text-xs text-muted-foreground">Aparecerás como profesional en la Agenda de tu clínica.</p>
      )}

      {modal === "configure" && (
        <AdminProfileModal
          onClose={() => setModal("closed")}
          onProfessionalProfileConfigured={() => setModal("closed")}
          adminIdentityOverride={adminIdentityOverride}
          setAdminIdentityOverride={setAdminIdentityOverride}
          setAdminProfessionalProfile={setAdminProfessionalProfile}
          // Skip the "¿También atiendes pacientes...?" empty state — the
          // checkbox above is itself that same intent already confirmed
          // (see task scope), so land straight in the Perfil profesional
          // form instead of asking again.
          autoConfigureProfessional
        />
      )}

      {modal === "edit" && professionalRecord && adminProfessionalProfile && (
        <DentistProfileModal
          dentist={professionalRecord}
          initialEditMode
          initialProfile={{
            registrationNumber: adminProfessionalProfile.registrationNumber,
            mainRoom: adminProfessionalProfile.mainRoom,
            scheduleDays: adminProfessionalProfile.scheduleDays,
            scheduleStart: adminProfessionalProfile.scheduleStart,
            scheduleEnd: adminProfessionalProfile.scheduleEnd,
            // Reuse the real "Mi perfil" identity — never re-collected
            // here (see task scope).
            email: adminIdentityOverride.email ?? CURRENT_USER.email,
            phone: adminIdentityOverride.phone ?? CURRENT_USER.phone,
          }}
          onClose={() => setModal("closed")}
          onSelfProfileChange={handleAdminDentistProfileChange}
        />
      )}
    </div>
  );
}

// 4. Consultorios — same compact-list shape as Equipo, one field per room.
function ConsultoriosSection() {
  const [rooms, setRooms] = useState<ClinicRoom[]>(CLINIC_ROOMS_MOCK);
  const [modal, setModal] = useState<"closed" | "create" | ClinicRoom>("closed");

  const toggleStatus = (id: string) => {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, status: r.status === "active" ? "inactive" : "active" } : r)));
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Consultorios</h2>
        <button
          type="button"
          onClick={() => setModal("create")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
        >
          <PlusIcon className="size-3.5" />
          Agregar consultorio
        </button>
      </div>

      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {rooms.map((room) => (
          <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm font-medium">{room.name}</p>
            <div className="flex items-center gap-3">
              <StatusBadge status={room.status} />
              <button type="button" onClick={() => setModal(room)} className="text-xs font-medium text-primary hover:text-primary/80">
                Editar
              </button>
              <button
                type="button"
                onClick={() => toggleStatus(room.id)}
                className={`text-xs font-medium ${
                  room.status === "active" ? "text-danger/80 hover:text-danger" : "text-primary hover:text-primary/80"
                }`}
              >
                {room.status === "active" ? "Desactivar" : "Reactivar"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {modal !== "closed" && (
        <RoomModal
          editing={modal === "create" ? null : modal}
          onClose={() => setModal("closed")}
          onCreate={(room) => setRooms((prev) => [...prev, room])}
          onUpdate={(room) => setRooms((prev) => prev.map((r) => (r.id === room.id ? room : r)))}
        />
      )}
    </div>
  );
}
