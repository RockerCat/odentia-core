import { CheckCircleIcon, ClockIcon, XCircleIcon } from "@/components/shell/icons";
import type { RipsExportHistoryEntry, RipsExportResultStatus } from "./export-actions";

// RIPS #5B — the three states this task's own Section 2/16 requires
// staying visually and terminologically distinct: Odentia's own internal
// validation passing is never presented as a MUV outcome. Shared between
// the real screen (rips-screen.tsx) and the dev-qa fixture preview so both
// render identical markup for identical data (this task's own Section 22).

const STATUS_LABEL: Record<RipsExportResultStatus, string> = {
  generated: "Archivo generado",
  accepted: "Aceptado por MUV",
  rejected: "Rechazado por MUV",
};

const DATETIME_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export function RipsExportStatusBadge({ status }: { status: RipsExportResultStatus }) {
  const classesByStatus: Record<RipsExportResultStatus, string> = {
    generated: "bg-foreground/5 text-foreground/70",
    accepted: "bg-success/10 text-success",
    rejected: "bg-danger/10 text-danger",
  };
  const IconByStatus: Record<RipsExportResultStatus, typeof ClockIcon> = {
    generated: ClockIcon,
    accepted: CheckCircleIcon,
    rejected: XCircleIcon,
  };
  const Icon = IconByStatus[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${classesByStatus[status]}`}>
      <Icon className="size-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function RipsExportHistoryList({
  entries,
  onRecordResult,
}: {
  entries: RipsExportHistoryEntry[];
  onRecordResult: (entry: RipsExportHistoryEntry) => void;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no has generado ningún archivo RIPS.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-2 rounded-lg border border-border px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium capitalize">{entry.periodLabel}</p>
              <RipsExportStatusBadge status={entry.resultStatus} />
            </div>
            <p className="text-xs text-muted-foreground">
              Generado {DATETIME_FORMATTER.format(new Date(entry.generatedAt))} · {entry.patientCount} paciente(s) · {entry.consultationCount}{" "}
              consulta(s) · {entry.procedureCount} procedimiento(s)
            </p>
            {entry.resultStatus === "accepted" && entry.muvCuv && <p className="text-xs text-muted-foreground">CUV: {entry.muvCuv}</p>}
            {entry.resultStatus === "rejected" && entry.muvResultNotes && (
              <p className="text-xs text-muted-foreground">Notas: {entry.muvResultNotes}</p>
            )}
          </div>
          {entry.resultStatus === "generated" && (
            <button
              type="button"
              onClick={() => onRecordResult(entry)}
              className="w-fit shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
            >
              Registrar resultado del MUV
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
