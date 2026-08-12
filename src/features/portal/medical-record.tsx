import { NoteIcon } from "@/components/shell/icons";
import { chronologicalKey, WEEK_APPOINTMENTS, WEEK_DAYS } from "@/features/dashboard/mock-data";
import { CURRENT_PATIENT } from "@/lib/current-user";
import { AppointmentSection } from "./my-appointments-screen";
import { MY_PATIENT_RECORD } from "./mock-data";

// Mi Historia Clínica — the formal shared clinical record (atenciones,
// procedimientos, diagnósticos, indicaciones/documentos), deliberately
// distinct from Mi salud dental's brief snapshot (see dental-health.tsx):
// that screen is a quick "what's my status" teaser, this one is the fuller
// record. Read-only, same as Mi salud dental — a Patient never edits
// clinical info here.
export function MedicalRecord() {
  const attentions = WEEK_APPOINTMENTS.filter((a) => a.patientName === CURRENT_PATIENT.name).sort(
    (a, b) => chronologicalKey(b, WEEK_DAYS) - chronologicalKey(a, WEEK_DAYS),
  );
  const procedures = Array.from(
    new Set(attentions.filter((a) => a.status === "completed").map((a) => a.type).filter(Boolean)),
  ) as string[];

  return (
    <div className="flex flex-col gap-6">
      {MY_PATIENT_RECORD.allergies && (
        <div className="rounded-lg border border-warning/25 bg-warning/10 px-3.5 py-2.5">
          <p className="text-xs font-semibold text-warning uppercase">Alertas / alergias</p>
          <p className="mt-0.5 text-sm text-warning">{MY_PATIENT_RECORD.allergies}</p>
        </div>
      )}

      <AppointmentSection title="Atenciones" items={attentions} emptyLabel="Aún no tienes atenciones registradas." />

      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">Procedimientos realizados</h2>
        {procedures.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Aún no tienes procedimientos registrados.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {procedures.map((procedure) => (
              <span
                key={procedure}
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-foreground/80"
              >
                {procedure}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">Diagnósticos</h2>
        <p className="mt-3 text-sm text-muted-foreground">Aún no hay diagnósticos registrados.</p>
      </div>

      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">Indicaciones y documentos</h2>
        <ul className="mt-3 flex flex-col gap-2">
          <li className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <NoteIcon className="size-4" />
            </span>
            <p className="text-sm font-medium text-foreground">Nueva indicación de tu odontólogo</p>
          </li>
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">Aún no hay documentos compartidos por tu clínica.</p>
      </div>
    </div>
  );
}
