"use client";

import { useState, type FormEvent } from "react";
import { CheckCircleIcon, ClipboardIcon, CloseIcon, PlusIcon } from "@/components/shell/icons";
import { useToast } from "@/components/toast";
import { UserAvatar } from "@/components/user-avatar";
import type { PendingInvitation, TeamMember, TeamMemberRole } from "@/features/clinic/data";
import { regenerateClinicInvitation, setClinicMemberStatus } from "@/features/clinic/team-actions";
import { StatusBadge } from "@/features/clinic/my-professional-profile-section";
import { INPUT_CLASS } from "@/features/onboarding/field-classes";
import { friendlyProvisionTeamMemberError, provisionClinicTeamMember } from "@/features/platform/api";

const ROLE_OPTIONS: { value: TeamMemberRole; label: string }[] = [
  { value: "clinic_admin", label: "Administrador" },
  { value: "dentist", label: "Odontólogo" },
  { value: "assistant", label: "Asistente" },
];

// "Platform → Clínica → Equipo: gestión transversal por Superadmin".
// Reuses fetchTeamMembers()/fetchPendingInvitations() (src/features/clinic/data.ts
// — already clinic-id-parameterized, already readable by a Superadmin
// under current RLS/grants, confirmed by the previous focused audit — no
// new reads invented here) and setClinicMemberStatus()/
// regenerateClinicInvitation() (src/features/clinic/team-actions.ts) —
// both client wrappers reused byte-for-byte unmodified: only the RPCs
// they call gained an `or is_platform_superadmin()` branch
// (20260916180000), never their signatures or return shapes.
//
// Deliberately a light, self-contained duplication of EquipoSection's own
// list rendering (src/features/clinic/clinic-settings-screen.tsx) rather
// than a shared extraction — two consumers isn't enough to justify a new
// abstraction (CLAUDE.md's own anti-overengineering rule), and the two
// screens' available actions already differ (Platform never shows the
// disabled "Editar" stub, and gates "Agregar miembro" on `canAddMembers`
// below in a way `/clinica` never needs to).
//
// canAddMembers is false while the clinic is still in its first-admin
// bootstrap Estado A/B (see PlatformClinicDetailPage) — the page itself
// decides this, never this component, so there is never a second,
// competing "create the first admin" entry point alongside
// AssignClinicAdminCard/the pending-invitation card.
export function PlatformEquipoSection({
  clinicId,
  initialMembers,
  initialPendingInvitations,
  canAddMembers,
}: {
  clinicId: string;
  initialMembers: TeamMember[];
  initialPendingInvitations: PendingInvitation[];
  canAddMembers: boolean;
}) {
  const { showToast } = useToast();
  const [members, setMembers] = useState(initialMembers);
  const [pendingInvitations, setPendingInvitations] = useState(initialPendingInvitations);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyableLinkById, setCopyableLinkById] = useState<Record<string, string>>({});
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const roleLabel = (member: TeamMember): string => {
    const specialty = member.professionalProfile?.specialtyName;
    if (member.role === "clinic_admin") {
      if (!member.professionalProfile) return "Administrador";
      return specialty ? `Administrador · Odontólogo · ${specialty}` : "Administrador · Odontólogo";
    }
    if (member.role === "dentist") return specialty ? `Odontólogo · ${specialty}` : "Odontólogo";
    return "Asistente";
  };

  const handleToggleStatus = async (member: TeamMember) => {
    const nextActive = member.status !== "active";
    setSavingId(member.membershipId);
    setMemberError(null);
    const outcome = await setClinicMemberStatus(member.membershipId, nextActive);
    setSavingId(null);
    if (outcome.status === "error") {
      setMemberError(outcome.message);
      return;
    }
    setMembers((prev) =>
      prev.map((m) => (m.membershipId === member.membershipId ? { ...m, status: outcome.memberStatus } : m)),
    );
    showToast(nextActive ? "Miembro reactivado correctamente" : "Miembro desactivado correctamente");
  };

  const handleRegenerate = async (invitation: PendingInvitation) => {
    setRegeneratingId(invitation.id);
    setPendingError(null);
    const outcome = await regenerateClinicInvitation(invitation.id);
    setRegeneratingId(null);
    if (outcome.status === "error") {
      setPendingError(outcome.message);
      return;
    }
    setPendingInvitations((prev) =>
      prev.map((p) => (p.id === invitation.id ? { ...p, expiresAt: outcome.invitation.expiresAt } : p)),
    );
    setCopyableLinkById((prev) => ({
      ...prev,
      [invitation.id]: `${window.location.origin}/invitacion/${outcome.invitation.rawToken}`,
    }));
    showToast("Enlace regenerado correctamente");
  };

  const handleCopyPending = async (invitationId: string, link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(invitationId);
      setTimeout(() => setCopiedId((cur) => (cur === invitationId ? null : cur)), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the
      // link stays available in this invitation's own state regardless.
    }
  };

  const handleAdded = (invitation: {
    id: string;
    email: string;
    role: TeamMemberRole;
    expiresAt: string;
    rawToken: string;
  }) => {
    setPendingInvitations((prev) => [
      { id: invitation.id, email: invitation.email, role: invitation.role, status: "pending", expiresAt: invitation.expiresAt },
      ...prev,
    ]);
    setCopyableLinkById((prev) => ({ ...prev, [invitation.id]: `${window.location.origin}/invitacion/${invitation.rawToken}` }));
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Equipo</h2>
        {canAddMembers && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
          >
            <PlusIcon className="size-3.5" />
            Agregar miembro
          </button>
        )}
      </div>

      {memberError && <p className="mt-3 text-xs text-danger">{memberError}</p>}

      {members.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Todavía no hay miembros en el equipo de esta clínica.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {members.map((member) => {
            const name = `${member.firstName} ${member.lastName}`.trim() || member.email;
            const initials =
              `${member.firstName[0] ?? ""}${member.lastName[0] ?? ""}`.toUpperCase() || member.email[0]?.toUpperCase() || "?";
            const isActive = member.status === "active";
            const isSaving = savingId === member.membershipId;
            return (
              <li key={member.membershipId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar name={name} initials={initials} avatar_url={member.avatarUrl ?? undefined} sizeClassName="size-9" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email} · {roleLabel(member)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge active={isActive} />
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleToggleStatus(member)}
                    className={`text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${isActive ? "text-danger/80" : "text-primary"}`}
                  >
                    {isSaving ? "Guardando…" : isActive ? "Desactivar" : "Reactivar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold">Invitaciones pendientes</h3>

        {pendingError && <p className="mt-2 text-xs text-danger">{pendingError}</p>}

        {pendingInvitations.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No hay invitaciones pendientes por aceptar.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {pendingInvitations.map((invitation) => {
              const link = copyableLinkById[invitation.id] ?? null;
              const isRegenerating = regeneratingId === invitation.id;
              const expired = new Date(invitation.expiresAt).getTime() < nowMs;
              const roleName = ROLE_OPTIONS.find((r) => r.value === invitation.role)?.label ?? invitation.role;
              return (
                <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{invitation.email}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {roleName} · Pendiente · {expired ? "Venció" : "Vence"} el{" "}
                      {new Date(invitation.expiresAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!link}
                      title={link ? undefined : 'Usa "Regenerar link" para obtener un enlace que puedas copiar'}
                      onClick={() => link && handleCopyPending(invitation.id, link)}
                      className="text-xs font-medium text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {copiedId === invitation.id ? "Copiado" : "Copiar link"}
                    </button>
                    <button
                      type="button"
                      disabled={isRegenerating}
                      onClick={() => handleRegenerate(invitation)}
                      className="text-xs font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isRegenerating ? "Regenerando…" : "Regenerar link"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {adding && <AddTeamMemberModal clinicId={clinicId} onClose={() => setAdding(false)} onAdded={handleAdded} />}
    </div>
  );
}

// "Agregar miembro" — Platform's own version of InviteMemberModal
// (src/features/clinic/invite-member-modal.tsx), calling
// provisionClinicTeamMember() instead of inviteClinicMember(): a role
// picker with all three real roles (never just dentist/assistant), and
// Nombre/Apellido/Teléfono always captured alongside Email — every
// Platform invitation carries complete pre-provisioned identity
// regardless of role (product decision), so a genuinely new user always
// gets the password-only, no-Confirm-Signup activation.
function AddTeamMemberModal({
  clinicId,
  onClose,
  onAdded,
}: {
  clinicId: string;
  onClose: () => void;
  onAdded: (invitation: { id: string; email: string; role: TeamMemberRole; expiresAt: string; rawToken: string }) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<TeamMemberRole>("dentist");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedFirstName || !trimmedLastName || !trimmedEmail || !trimmedPhone) {
      setError("Completa nombre, apellido, correo y teléfono.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await provisionClinicTeamMember({
        clinicId,
        role,
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        email: trimmedEmail,
        phone: trimmedPhone,
      });
      setLink(`${window.location.origin}/invitacion/${result.rawToken}`);
      setInvitedEmail(result.email);
      onAdded(result);
    } catch (err) {
      console.error("[AddTeamMemberModal] provisionClinicTeamMember failed", err);
      setError(friendlyProvisionTeamMemberError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail — the link is still visible/selectable.
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agregar miembro"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Agregar miembro</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        {link ? (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircleIcon className="size-5" />
              </span>
              <p className="text-sm font-medium text-foreground">Invitación creada</p>
              <p className="text-xs text-muted-foreground">
                Comparte este enlace con {invitedEmail}. El enlace vence en 7 días y, por seguridad, solo se muestra
                una vez.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 truncate bg-transparent text-xs text-foreground outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
              >
                <ClipboardIcon className="size-3.5" />
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] text-label-foreground">Nombre</span>
                <input
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    setError(null);
                  }}
                  disabled={submitting}
                  className={INPUT_CLASS}
                  autoComplete="given-name"
                  autoFocus
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] text-label-foreground">Apellido</span>
                <input
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    setError(null);
                  }}
                  disabled={submitting}
                  className={INPUT_CLASS}
                  autoComplete="family-name"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] text-label-foreground">Correo electrónico</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  disabled={submitting}
                  className={INPUT_CLASS}
                  autoComplete="email"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] text-label-foreground">Teléfono</span>
                <input
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setError(null);
                  }}
                  disabled={submitting}
                  className={INPUT_CLASS}
                  autoComplete="tel"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="text-[11px] text-label-foreground">Rol</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as TeamMemberRole)}
                  disabled={submitting}
                  className={INPUT_CLASS}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Creando invitación…" : "Crear invitación"}
              </button>
            </div>
          </form>
        )}

        {link && (
          <div className="flex shrink-0 items-center justify-end border-t border-border p-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
