"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon, ClipboardIcon } from "@/components/shell/icons";
import { createClient } from "@/lib/supabase/client";
import {
  createPatientPortalInvitation,
  fetchPatientPortalLinkStatus,
} from "./patient-portal-access";

// "Acceso del paciente" — real now (was an honest "todavía no está
// disponible" placeholder). Same card/position inside PatientRecordModal,
// not a redesign: only its body changes across 3 real states.
//
//   1. SIN ACCESO — CTA "Dar acceso al Portal".
//   2. INVITACIÓN CREADA — the raw link, shown exactly once (only its
//      hash is ever persisted — see create_patient_access_invitation()'s
//      own migration comment), with the same readonly-input + "Copiar"
//      pattern InviteMemberModal already uses for Equipo, reused rather
//      than a second visual language. Says "Invitación creada"/"Copiar
//      enlace", never "enviada" — there is no outbound email integration.
//   3. VINCULADO — "Acceso al Portal activo". No CTA offered again; a
//      linked patient can never be re-invited (backend refuses it too,
//      not just this hidden button).
//
// canGrantAccess (role !== dentist — the same canEditPatientData already
// threaded through this whole modal) only hides the CTA; the real
// boundary is create_patient_access_invitation()'s own has_clinic_role()
// check, re-verified server-side regardless of what this prop says.
export function PatientPortalAccessCard({
  patientId,
  canGrantAccess,
}: {
  patientId: string;
  canGrantAccess: boolean;
}) {
  const [checkingLink, setCheckingLink] = useState(true);
  const [linked, setLinked] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [invitation, setInvitation] = useState<{ link: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const status = await fetchPatientPortalLinkStatus(supabase, patientId);
        if (!cancelled) setLinked(status.linked);
      } catch {
        // Fails closed on the CTA side (see canGrantAccess above still
        // gating it), never fabricates "ya vinculado" on a query error.
        if (!cancelled) setLinked(false);
      } finally {
        if (!cancelled) setCheckingLink(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    const outcome = await createPatientPortalInvitation(patientId);
    setGenerating(false);

    if (outcome.status === "already-linked") {
      setLinked(true);
      return;
    }
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setInvitation({ link: outcome.link, expiresAt: outcome.expiresAt });
  };

  const handleCopy = async () => {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the
      // link stays visible/selectable in the input either way, same
      // fallback InviteMemberModal already relies on.
    }
  };

  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm font-semibold">Acceso del paciente</p>

      {checkingLink ? (
        <p className="mt-2 text-xs text-muted-foreground">Verificando…</p>
      ) : linked ? (
        <div className="mt-2 flex items-center gap-1.5">
          <CheckCircleIcon className="size-3.5 shrink-0 text-primary" />
          <p className="text-xs font-medium text-primary">Acceso al Portal activo</p>
        </div>
      ) : invitation ? (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            Invitación creada — vence en 7 días, y este enlace solo se muestra esta vez. Todavía no enviamos correos
            automáticamente: cópialo y compártelo tú mismo.
          </p>
          <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <input
              readOnly
              value={invitation.link}
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
        </>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            Este paciente todavía no tiene acceso al Portal.
          </p>
          {canGrantAccess && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="mt-2.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? "Generando…" : "Dar acceso al Portal"}
            </button>
          )}
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </>
      )}
    </div>
  );
}
