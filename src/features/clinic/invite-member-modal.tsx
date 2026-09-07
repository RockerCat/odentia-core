"use client";

import { useState, type FormEvent } from "react";
import { CheckCircleIcon, ClipboardIcon, CloseIcon } from "@/components/shell/icons";
import { useToast } from "@/components/toast";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { inviteClinicMember } from "./team-actions";

// "Agregar miembro" — creates a real, persisted clinic_invitations row via
// invite_clinic_member() (see the team-invitation-rpcs migration). There is
// no outbound email integration in this project yet (no service_role key,
// no SMTP/email provider configured — see this task's own report), so this
// deliberately does NOT claim to have emailed anything: on success it shows
// the real invitation link so the admin can copy and share it themselves
// (WhatsApp, email client, however they'd reach that person today) — the
// one honest way to close this loop with the infrastructure that actually
// exists right now. That link/token is never shown again after this modal
// closes (only its hash is persisted) — the confirmation copy says so.
export function InviteMemberModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"dentist" | "assistant">("dentist");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inviting) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Ingresa un correo electrónico.");
      return;
    }
    setInviting(true);
    setError(null);
    const outcome = await inviteClinicMember(trimmed, role);
    setInviting(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setLink(`${window.location.origin}/invitacion/${outcome.invitation.rawToken}`);
    showToast("Invitación creada correctamente");
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the
      // link is still visible/selectable in the input below either way,
      // so this never blocks the admin from sharing it manually.
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
                Todavía no enviamos correos automáticamente — comparte este enlace tú mismo con {email.trim()} (vence en
                7 días, y solo se muestra esta vez).
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
              <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="flex-1 truncate bg-transparent text-xs text-foreground outline-none" />
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
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] text-label-foreground">Correo electrónico</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder="nombre@correo.com"
                  disabled={inviting}
                  className={FIELD_CLASS}
                  autoFocus
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] text-label-foreground">Rol</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "dentist" | "assistant")}
                  disabled={inviting}
                  className={FIELD_CLASS}
                >
                  <option value="dentist">Odontólogo</option>
                  <option value="assistant">Asistente</option>
                </select>
              </label>

              {error && <p className="text-xs text-danger">{error}</p>}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={inviting}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={inviting}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {inviting ? "Invitando…" : "Invitar"}
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
