"use client";

import { useState, type FormEvent } from "react";
import { CheckCircleIcon, ClipboardIcon } from "@/components/shell/icons";
import { useToast } from "@/components/toast";
import { INPUT_CLASS } from "@/features/onboarding/field-classes";
import { friendlyProvisionAdminError, provisionFirstClinicAdminInvitation } from "@/features/platform/api";

// "Platform — Asignar primer Administrador de Clínica". Renders on
// /platform/clinicas/[slug] only when fetchActiveClinicAdminMembership()
// found no active clinic_admin for this clinic — the page itself decides
// that (Estado A vs C), never this component.
//
// Deliberately does NOT try to detect "a pending invitation already
// exists" before rendering the form (Estado B): clinic_invitations_select_
// admin (foundation RLS migration) has no is_platform_superadmin() branch,
// unlike every sibling table this initiative already audited — a
// Superadmin's own SELECT on clinic_invitations returns zero rows
// regardless of what actually exists. Rather than add that DB scope
// silently, this relies on provision_first_clinic_admin_invitation()'s own
// atomic guard (it already rejects a second pending invitation for this
// clinic) and surfaces that rejection as a normal inline form error — see
// this checkpoint's own report for the proposed one-line RLS fix.
export function AssignClinicAdminCard({ clinicId }: { clinicId: string }) {
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
      const result = await provisionFirstClinicAdminInvitation({
        clinicId,
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        email: trimmedEmail,
        phone: trimmedPhone,
      });
      setLink(`${window.location.origin}/invitacion/${result.rawToken}`);
      setInvitedEmail(result.email);
      showToast("Invitación creada correctamente");
    } catch (err) {
      console.error("[AssignClinicAdminCard] provisionFirstClinicAdminInvitation failed", err);
      setError(friendlyProvisionAdminError(err));
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
      // Clipboard access can fail (permissions, insecure context) — the
      // link is still visible/selectable in the input below either way.
    }
  };

  if (link) {
    return (
      <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircleIcon className="size-5" />
          </span>
          <p className="text-sm font-medium text-foreground">Invitación creada</p>
          <p className="text-xs text-muted-foreground">
            Comparte este enlace con {invitedEmail}. El enlace vence en 7 días y, por seguridad, solo se muestra una
            vez.
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
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">Asignar Administrador de Clínica</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Esta clínica todavía no tiene un Administrador. Crea la invitación con sus datos — ella misma define su
        contraseña al activar la cuenta.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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

        {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creando invitación…" : "Crear invitación"}
          </button>
        </div>
      </form>
    </div>
  );
}
