import type { AppointmentStatus } from "./mock-data";

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "bg-success/10 text-success" },
  pending: { label: "Pending confirmation", className: "bg-warning/10 text-warning" },
  "in-progress": { label: "In progress", className: "bg-info/10 text-info" },
  completed: { label: "Completed", className: "bg-foreground/5 text-muted-foreground" },
  cancelled: { label: "Cancelled", className: "bg-danger/10 text-danger" },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, className } = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}
