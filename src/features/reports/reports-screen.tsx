"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ProfessionalSelect } from "@/components/professional-select";
import {
  AlertTriangleIcon,
  BarChartIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  PlusIcon,
  RefreshIcon,
  UsersIcon,
  XCircleIcon,
} from "@/components/shell/icons";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { DENTISTS } from "@/features/dashboard/mock-data";
import { PATIENTS } from "@/features/patients/mock-data";
import { EmptyChartState, HorizontalRankingChart, TimeSeriesBarChart } from "./report-charts";
import { REPORT_ENCOUNTERS, REPORT_PERIOD_OPTIONS, resolvePeriodRange, type ReportPeriodKey } from "./mock-data";
import {
  computeActivitySeries,
  computeDentistActivity,
  computeKpis,
  computePatientsStats,
  computeTreatmentRanking,
  filterEncounters,
} from "./report-selectors";

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const today = new Date();
const defaultCustomStart = toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
const defaultCustomEnd = toISODate(today);

export function ReportsScreen() {
  const { role, dentistId } = useRole();
  // Odontólogo always sees only their own activity — never a selectable
  // filter, so there's nothing for them to widen back to "todos" (see task
  // scope: the Profesional filter is hidden entirely for this role, not
  // just defaulted).
  const isDentist = role === "dentist";

  const [period, setPeriod] = useState<ReportPeriodKey>("this-month");
  const [professionalFilter, setProfessionalFilter] = useState(""); // "" = todos los profesionales — Clinic Admin only
  const [customStart, setCustomStart] = useState(defaultCustomStart);
  const [customEnd, setCustomEnd] = useState(defaultCustomEnd);

  const scopedDentistId = isDentist ? dentistId : professionalFilter;

  const range = useMemo(() => {
    if (period !== "custom") return resolvePeriodRange(period);
    const start = fromISODate(customStart);
    const end = fromISODate(customEnd);
    return resolvePeriodRange("custom", end.getTime() >= start.getTime() ? { start, end } : { start: end, end: start });
  }, [period, customStart, customEnd]);

  const filtered = useMemo(
    () => filterEncounters(REPORT_ENCOUNTERS, range, scopedDentistId),
    [range, scopedDentistId],
  );

  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const activitySeries = useMemo(() => computeActivitySeries(filtered, range), [filtered, range]);
  const dentistRows = scopedDentistId ? DENTISTS.filter((d) => d.id === scopedDentistId) : DENTISTS;
  const dentistActivity = useMemo(() => computeDentistActivity(filtered, dentistRows), [filtered, dentistRows]);
  const treatmentRanking = useMemo(() => computeTreatmentRanking(filtered), [filtered]);
  const patientsStats = useMemo(
    () => computePatientsStats(REPORT_ENCOUNTERS, range, scopedDentistId, PATIENTS),
    [range, scopedDentistId],
  );

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {isDentist ? "Analiza tu actividad y evolución clínica." : "Analiza la actividad y evolución de tu clínica."}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="w-full sm:w-48">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ReportPeriodKey)}
            className={FIELD_CLASS}
          >
            {REPORT_PERIOD_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {period === "custom" && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)}
              className={`${FIELD_CLASS} w-full sm:w-40`}
            />
            <span className="text-xs text-muted-foreground">a</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              onChange={(e) => setCustomEnd(e.target.value)}
              className={`${FIELD_CLASS} w-full sm:w-40`}
            />
          </div>
        )}

        {!isDentist && (
          <div className="w-full sm:w-64">
            <ProfessionalSelect
              dentists={DENTISTS}
              selectedId={professionalFilter}
              onSelect={setProfessionalFilter}
              includeAllOption
              allOptionLabel="Todos los profesionales"
              compactTrigger
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={CalendarIcon} value={String(kpis.scheduled)} label="Citas programadas" />
        <KpiCard icon={CheckCircleIcon} value={String(kpis.completed)} label="Atenciones completadas" />
        <KpiCard icon={BarChartIcon} value={`${kpis.attendanceRate}%`} label="Tasa de asistencia" />
        <KpiCard icon={ClockIcon} value={String(kpis.noShow)} label="No asistencias" />
        <KpiCard icon={XCircleIcon} value={String(kpis.cancelled)} label="Cancelaciones" />
        <KpiCard icon={UsersIcon} value={String(kpis.patientsAttended)} label="Pacientes atendidos" />
      </div>

      {isDentist ? (
        // No comparative "Actividad por profesional" for Odontólogo (never
        // sees other dentists' individual metrics — see task scope), so
        // "Mi actividad" is free to use the full row instead of the 50/50
        // split below. A dedicated replacement for that second column is a
        // later iteration, not this one.
        <ReportSection title="Mi actividad" description="Atenciones completadas a través del tiempo.">
          <TimeSeriesBarChart data={activitySeries} />
        </ReportSection>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.15fr] lg:items-stretch">
          <ReportSection title="Actividad de la clínica" description="Atenciones completadas a través del tiempo.">
            <TimeSeriesBarChart data={activitySeries} />
          </ReportSection>

          <ReportSection title="Actividad por profesional">
            <DentistActivityTable rows={dentistActivity} />
          </ReportSection>
        </div>
      )}

      <ReportSection title={isDentist ? "Mis pacientes" : "Pacientes"}>
        <div className="grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-5 sm:gap-x-0 sm:divide-x sm:divide-border">
          <PatientStat
            icon={UsersIcon}
            value={String(patientsStats.active)}
            label={isDentist ? "Atendidos" : "Activos"}
          />
          <PatientStat icon={PlusIcon} value={String(patientsStats.newInPeriod)} label="Nuevos en el período" />
          <PatientStat icon={RefreshIcon} value={String(patientsStats.recurrent)} label="Recurrentes" />
          <PatientStat
            icon={AlertTriangleIcon}
            value={String(patientsStats.staleOver6Months)}
            label="Sin atención +6 meses"
          />
          <PatientStat icon={CalendarIcon} value={String(patientsStats.withUpcoming)} label="Con próxima cita" />
        </div>
      </ReportSection>

      <ReportSection title={isDentist ? "Mis tratamientos más realizados" : "Tratamientos más realizados"}>
        <HorizontalRankingChart rows={treatmentRanking} />
      </ReportSection>
    </div>
  );
}

function ReportSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof BarChartIcon;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-background p-3.5 text-center">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-label-foreground">{label}</p>
    </div>
  );
}

// Secondary to the 6 main KPI cards above (see KpiCard): same teal
// icon-circle language, but smaller and without the bordered/shadowed card
// chrome, so a plain sm:divide-x row (or a bare wrapping grid on mobile,
// where dividers don't read cleanly) is enough to separate the five
// without them reading as five more heavy KPI blocks.
function PatientStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof BarChartIcon;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-2 text-center sm:px-4">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-3.5" />
      </span>
      <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="text-[11px] text-label-foreground">{label}</p>
    </div>
  );
}

function DentistActivityTable({ rows }: { rows: ReturnType<typeof computeDentistActivity> }) {
  if (rows.every((row) => row.atenciones === 0 && row.noShow === 0 && row.cancelled === 0)) {
    return <EmptyChartState message="Sin actividad registrada en este período." />;
  }

  // @container (not a plain sm:/lg: viewport breakpoint) so this switches
  // from stacked cards to the grid-table based on the ACTUAL width its
  // column gets — needed since this now sits in a 50/50 desktop row (see
  // ReportsScreen) instead of always spanning the full page width; a
  // viewport breakpoint alone can't tell those two cases apart.
  return (
    <div className="@container overflow-hidden rounded-xl border border-border">
      <div className="hidden grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] gap-2 border-b border-border bg-surface px-3 py-2.5 text-[11px] font-semibold tracking-wide text-label-foreground uppercase @lg:grid">
        <span>Profesional</span>
        <span>Atenciones</span>
        <span>No asistió</span>
        <span>Canceladas</span>
        <span>Pacientes atendidos</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map(({ dentist, atenciones, noShow, cancelled, patientsAttended }) => (
          <li
            key={dentist.id}
            className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 @lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] @lg:items-center @lg:gap-2 @lg:px-3"
          >
            <p className="col-span-2 truncate text-sm font-medium @lg:col-span-1">{dentist.name}</p>
            <Stat label="Atenciones" value={atenciones} />
            <Stat label="No asistió" value={noShow} />
            <Stat label="Canceladas" value={cancelled} />
            <Stat label="Pacientes atendidos" value={patientsAttended} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between @lg:block">
      <span className="text-[11px] text-label-foreground @lg:hidden">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
