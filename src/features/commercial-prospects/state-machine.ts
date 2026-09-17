// Platform → Prospectos pipeline — the single, centralized definition of
// which commercial_prospect_status transitions are allowed. Mirrors
// update_commercial_prospect_status()'s own rules exactly (supabase/
// migrations/20260916200000_create_update_commercial_prospect_status_rpc.sql)
// so the UI never offers an action the RPC would reject — but the RPC
// re-validates independently against the real DB row, never trusting
// this client-side copy as authority (see that migration's own comment
// on why: no `currentStatus` sent by the client is ever trusted there).

export type CommercialProspectStatus = "new" | "contacted" | "demo_scheduled" | "demo_completed" | "won" | "lost";

export const COMMERCIAL_PROSPECT_STATUSES: CommercialProspectStatus[] = [
  "new",
  "contacted",
  "demo_scheduled",
  "demo_completed",
  "won",
  "lost",
];

export const COMMERCIAL_PROSPECT_STATUS_LABELS: Record<CommercialProspectStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  demo_scheduled: "Demo agendada",
  demo_completed: "Demo realizada",
  won: "Ganado",
  lost: "Perdido",
};

// Sequential main flow — one forward step at a time, never a skip (e.g.
// new → demo_scheduled is invalid even though both are "earlier" than
// won). `won` is reachable ONLY from `demo_completed`, deliberately: a
// prospect can never be marked won without first going through a real
// completed demo (see CLAUDE.md — this matters for the future
// clinic-conversion checkpoint).
const MAIN_FLOW: Record<CommercialProspectStatus, CommercialProspectStatus | null> = {
  new: "contacted",
  contacted: "demo_scheduled",
  demo_scheduled: "demo_completed",
  demo_completed: "won",
  won: null,
  lost: null,
};

export function isTerminalCommercialProspectStatus(status: CommercialProspectStatus): boolean {
  return status === "won" || status === "lost";
}

// `lost` is reachable from any non-terminal status; the main flow is
// otherwise strictly one step forward. No other transition is ever
// valid — this is the one place that decides that, reused by both the
// list/detail UI (to decide which single action to offer) and this
// feature's own tests, which mirror the RPC's PASS/FAIL cases 1:1.
export function isValidCommercialProspectTransition(
  from: CommercialProspectStatus,
  to: CommercialProspectStatus,
): boolean {
  if (to === "lost") return !isTerminalCommercialProspectStatus(from);
  return MAIN_FLOW[from] === to;
}

export type CommercialProspectNextAction = {
  toStatus: CommercialProspectStatus;
  label: string;
} | null;

const NEXT_ACTION_LABELS: Record<CommercialProspectStatus, string> = {
  contacted: "Marcar como contactado",
  demo_scheduled: "Marcar demo agendada",
  demo_completed: "Marcar demo realizada",
  won: "Marcar como ganado",
  new: "",
  lost: "",
};

// The single "next natural step" for a prospect's current status —
// Platform's detail screen shows this instead of a generic dropdown of
// every status. Null once the flow is terminal (won/lost) or has no
// further forward step defined.
export function getNextCommercialProspectAction(status: CommercialProspectStatus): CommercialProspectNextAction {
  const toStatus = MAIN_FLOW[status];
  if (!toStatus) return null;
  return { toStatus, label: NEXT_ACTION_LABELS[toStatus] };
}

export function canMarkCommercialProspectLost(status: CommercialProspectStatus): boolean {
  return !isTerminalCommercialProspectStatus(status);
}
