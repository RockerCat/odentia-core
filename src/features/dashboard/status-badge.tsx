import type { AppointmentStatus } from "./mock-data";

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; className: string }> = {
  confirmed: { label: "Confirmada", className: "bg-success/10 text-success" },
  pending: { label: "Pendiente", className: "bg-warning/10 text-warning" },
  "in-progress": { label: "En curso", className: "bg-info/10 text-info" },
  completed: { label: "Completada", className: "bg-foreground/5 text-muted-foreground" },
  cancelled: { label: "Cancelada", className: "bg-danger/10 text-danger" },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, className } = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}
