import {
  AlertTriangleIcon,
  CalendarIcon,
  ClipboardIcon,
  ClockIcon,
  FlagIcon,
  NoteIcon,
  PlayCircleIcon,
  ToothIcon,
} from "@/components/shell/icons";
import { ClinicalInfoCard } from "./clinical-info-card";
import type { PatientMedicalHistory } from "./medical-history-data";

// Restores the approved demo's Resumen grid (clinical-record-screen.tsx's
// ResumenTab/ClinicalKpiCard) — same 8-card grid, same icons, same labels,
// same layout — fed by real data where it exists and honest empty states
// where it doesn't yet (see CLAUDE.md task scope: preserve the approved
// design, replace mock → real, never a generic placeholder). Reads the
// SAME medicalHistory the Antecedentes tab reads/writes (see
// patient-clinical-record-screen.tsx) — no second fetch, no duplicated
// state, so an edit there shows up here immediately.
export function ResumenTab({ history }: { history: PatientMedicalHistory | null }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ClinicalInfoCard icon={AlertTriangleIcon} label="Alergias" value={history?.allergies ?? "Sin registrar"} />
      <ClinicalInfoCard
        icon={ClipboardIcon}
        label="Medicamentos actuales"
        value={history?.currentMedications ?? "Sin registrar"}
      />
      <ClinicalInfoCard
        icon={FlagIcon}
        label="Condiciones médicas relevantes"
        value={history?.medicalConditions ?? "Sin registrar"}
      />
      {/* No appointments/odontograma/notas schema yet — honest empty
          states, never mock (see CLAUDE.md task scope). */}
      <ClinicalInfoCard icon={ClockIcon} label="Última atención" value="Sin atenciones registradas" />
      <ClinicalInfoCard icon={PlayCircleIcon} label="Tratamientos activos" value="Ninguno registrado" />
      <ClinicalInfoCard icon={CalendarIcon} label="Próxima cita" value="Sin cita programada" />
      <ClinicalInfoCard icon={ToothIcon} label="Última actualización del odontograma" value="Sin odontograma registrado" />
      <ClinicalInfoCard icon={NoteIcon} label="Notas clínicas importantes" value="No registradas" relaxedLeading />
    </div>
  );
}
