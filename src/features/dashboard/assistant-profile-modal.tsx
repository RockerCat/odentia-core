"use client";

import { CloseIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { MEMBERSHIP_ROLE_LABELS } from "@/features/session/types";
import { useCurrentUserContext } from "@/features/session/use-current-user-context";

// The Assistant's own "Mi perfil" — real identity only (see PROMPT MASTER
// "Odentia: corregir role bridge stale + Mi perfil real"). Used to read a
// hardcoded mock (CURRENT_ASSISTANT, "Laura Torres") for every field —
// removed entirely: same real, resolved context (useCurrentUserContext() →
// resolveClinicContext()) the Header itself already trusts for the shell
// chrome around this modal.
//
// Read-only, deliberately — same reasoning as AdminProfileModal's own
// comment: the previous "Editar perfil" only ever wrote to an in-memory,
// never-persisted override and never called a real backend. Keeping it
// here would let someone "save" an edit that silently vanishes on refresh.
// No new profile-edit persistence is built here (out of this task's
// scope) — the edit UI is removed until a real one exists.
//
// Deliberately still a separate, smaller modal from AdminProfileModal, not
// a stripped-down version of it — no specialty, registration, room,
// schedule, KPIs, patients, or agenda ever show up here (see CLAUDE.md
// Domain Model: an Assistant is never a clinical professional).
export function AssistantProfileModal({ onClose }: { onClose: () => void }) {
  const context = useCurrentUserContext();
  const ok = context?.status === "ok" ? context : null;
  const loading = context === null;

  const firstName = ok?.profile.firstName ?? "";
  const lastName = ok?.profile.lastName ?? "";
  const fallback = loading ? "Cargando…" : "—";
  const displayName = ok ? `${firstName} ${lastName}`.trim() || fallback : fallback;
  const initials = ok ? `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() : "";
  const displayEmail = ok ? ok.profile.email : fallback;
  const displayPhone = ok ? (ok.profile.phone ?? "—") : fallback;
  const displayAvatar = ok?.profile.avatarUrl ?? undefined;
  const roleLabel = ok ? MEMBERSHIP_ROLE_LABELS[ok.membership.role] : fallback;
  const clinicName = ok ? ok.clinic.name : fallback;

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
            <UserAvatar name={displayName} initials={initials} avatar_url={displayAvatar} sizeClassName="size-16" />
          </div>

          <dl className="mt-5 flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-label-foreground">Nombre</dt>
              <dd className="truncate font-medium">{displayName}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-label-foreground">Correo</dt>
              <dd className="truncate font-medium">{displayEmail}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-label-foreground">Teléfono</dt>
              <dd className="truncate font-medium">{displayPhone}</dd>
            </div>
            {/* Rol y Clínica actual are always fixed — never editable here. */}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-label-foreground">Rol</dt>
              <dd className="truncate font-medium">{roleLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-label-foreground">Clínica actual</dt>
              <dd className="truncate font-medium">{clinicName}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
