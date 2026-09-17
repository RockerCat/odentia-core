"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { updateCommercialProspectStatus } from "@/features/commercial-prospects/platform-actions";
import {
  canMarkCommercialProspectLost,
  getNextCommercialProspectAction,
  isTerminalCommercialProspectStatus,
  type CommercialProspectStatus,
} from "@/features/commercial-prospects/state-machine";
import { ProspectStatusBadge } from "./prospect-status-badge";

// Platform → Prospectos detail — the only place a Prospecto's status
// changes. Shows exactly the ONE natural next step for the current
// status (never a generic "pick any status" dropdown — see
// getNextCommercialProspectAction()) plus "Marcar como perdido" while
// still non-terminal. update_commercial_prospect_status() re-validates
// the transition against the real row server-side regardless of what
// this component believes the current status is.
export function ProspectStatusActions({ prospectId, initialStatus }: { prospectId: string; initialStatus: CommercialProspectStatus }) {
  const { showToast } = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [pendingTarget, setPendingTarget] = useState<CommercialProspectStatus | null>(null);

  const nextAction = getNextCommercialProspectAction(status);
  const canMarkLost = canMarkCommercialProspectLost(status);
  const terminal = isTerminalCommercialProspectStatus(status);

  const handleTransition = async (toStatus: CommercialProspectStatus) => {
    if (pendingTarget) return;
    setPendingTarget(toStatus);
    try {
      const outcome = await updateCommercialProspectStatus(prospectId, toStatus);
      if (outcome.status === "error") {
        showToast(outcome.message, "error");
        return;
      }
      setStatus(outcome.newStatus);
      showToast("Estado actualizado correctamente");
    } finally {
      setPendingTarget(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-label-foreground uppercase">Estado actual</span>
        <ProspectStatusBadge status={status} />
      </div>

      {terminal ? (
        <p className="text-sm text-muted-foreground">
          {status === "won" ? "Este prospecto fue marcado como ganado." : "Este prospecto fue marcado como perdido."}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {nextAction && (
            <button
              type="button"
              disabled={pendingTarget !== null}
              onClick={() => handleTransition(nextAction.toStatus)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {pendingTarget === nextAction.toStatus ? "Actualizando…" : nextAction.label}
            </button>
          )}
          {canMarkLost && (
            <button
              type="button"
              disabled={pendingTarget !== null}
              onClick={() => handleTransition("lost")}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-60"
            >
              {pendingTarget === "lost" ? "Actualizando…" : "Marcar como perdido"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
