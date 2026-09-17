import { COMMERCIAL_PROSPECT_STATUS_LABELS, type CommercialProspectStatus } from "@/features/commercial-prospects/state-machine";

// Same rounded-pill badge convention as the rest of Platform (e.g.
// /platform/clinicas' own inline status span) — one color triple per
// status, no new palette invented.
const STATUS_CLASSES: Record<CommercialProspectStatus, string> = {
  new: "border-info/25 bg-info/10 text-info",
  contacted: "border-primary/25 bg-primary/10 text-primary",
  demo_scheduled: "border-primary/25 bg-primary/10 text-primary",
  demo_completed: "border-warning/25 bg-warning/10 text-warning",
  won: "border-success/25 bg-success/10 text-success",
  lost: "border-danger/25 bg-danger/10 text-danger",
};

export function ProspectStatusBadge({ status }: { status: CommercialProspectStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_CLASSES[status]}`}
    >
      {COMMERCIAL_PROSPECT_STATUS_LABELS[status]}
    </span>
  );
}
