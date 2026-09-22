"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import {
  extendClinicTrial,
  friendlyClinicCommercialStatusError,
  setClinicCommercialStatus,
} from "@/features/platform/clinic-commercial-actions";
import { deriveClinicCommercialLabel, type ClinicCommercialLabel } from "@/features/subscription/commercial-status";
import { INPUT_CLASS } from "@/features/onboarding/field-classes";

const LABEL_COPY: Record<ClinicCommercialLabel, { text: string; className: string }> = {
  trial: { text: "En período de prueba", className: "border-info/25 bg-info/10 text-info" },
  trial_expired: { text: "Período de prueba vencido", className: "border-warning/25 bg-warning/10 text-warning" },
  active: { text: "Activa", className: "border-success/25 bg-success/10 text-success" },
  suspended: { text: "Suspendida", className: "border-danger/25 bg-danger/10 text-danger" },
};

// "Platform → Clínica → Estado comercial" — pilot subscription controls
// (see supabase/migrations/20260922100000_add_clinic_pilot_subscription_controls.sql
// and src/features/subscription/commercial-status.ts). Deliberately no
// checkout/pricing UI here — the only two real actions a Superadmin needs
// during a manually-run pilot: activar/suspender, and extender el período
// de prueba. clinics.status is the SAME field resolveClinicContext()/
// resolvePatientContext() already gate real access on — suspending here
// takes effect immediately for that clinic's staff and patients (via
// their own next request), not a separate/parallel "commercial" flag.
export function ClinicCommercialStatusCard({
  clinicId,
  initialStatus,
  initialTrialEndsAt,
}: {
  clinicId: string;
  initialStatus: "active" | "suspended";
  initialTrialEndsAt: string | null;
}) {
  const { showToast } = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [trialEndsAt, setTrialEndsAt] = useState(initialTrialEndsAt);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [trialDraft, setTrialDraft] = useState("");
  const [extendingTrial, setExtendingTrial] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = deriveClinicCommercialLabel({ status, trialEndsAt });
  const copy = LABEL_COPY[label];

  const handleToggleStatus = async () => {
    if (togglingStatus) return;
    const nextStatus = status === "active" ? "suspended" : "active";
    setTogglingStatus(true);
    setError(null);
    try {
      const result = await setClinicCommercialStatus(clinicId, nextStatus);
      setStatus(result.status);
      showToast(result.status === "active" ? "Clínica reactivada" : "Clínica suspendida");
    } catch (err) {
      console.error("[ClinicCommercialStatusCard] setClinicCommercialStatus failed", err);
      setError(friendlyClinicCommercialStatusError(err));
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleExtendTrial = async () => {
    if (extendingTrial || !trialDraft) return;
    setExtendingTrial(true);
    setError(null);
    try {
      const result = await extendClinicTrial(clinicId, new Date(`${trialDraft}T23:59:59`));
      setTrialEndsAt(result.trialEndsAt);
      setTrialDraft("");
      showToast("Período de prueba actualizado");
    } catch (err) {
      console.error("[ClinicCommercialStatusCard] extendClinicTrial failed", err);
      setError(friendlyClinicCommercialStatusError(err));
    } finally {
      setExtendingTrial(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Estado comercial</h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${copy.className}`}>
          {copy.text}
        </span>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {trialEndsAt
          ? `Período de prueba: hasta ${new Date(trialEndsAt).toLocaleDateString("es-CO")}.`
          : "Sin período de prueba registrado."}
      </p>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleToggleStatus()}
          disabled={togglingStatus}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ${
            status === "active" ? "bg-danger text-white" : "bg-primary text-primary-foreground"
          }`}
        >
          {togglingStatus ? "Actualizando…" : status === "active" ? "Suspender clínica" : "Reactivar clínica"}
        </button>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-xs font-medium text-foreground/80">Extender período de prueba</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={trialDraft}
            onChange={(e) => setTrialDraft(e.target.value)}
            disabled={extendingTrial}
            className={`${INPUT_CLASS} w-auto`}
          />
          <button
            type="button"
            onClick={() => void handleExtendTrial()}
            disabled={extendingTrial || !trialDraft}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-50"
          >
            {extendingTrial ? "Guardando…" : "Extender"}
          </button>
        </div>
      </div>
    </div>
  );
}
