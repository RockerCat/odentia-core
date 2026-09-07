"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { fetchPatients, type Patient } from "@/features/patients/data";
import type { MembershipRole } from "@/features/session/types";
import { createClient } from "@/lib/supabase/client";
import { EmptyChartState, HorizontalRankingChart, TimeSeriesBarChart } from "./report-charts";
import { REPORT_PERIOD_OPTIONS, resolvePeriodRange, type DateRange, type ReportPeriodKey } from "./report-period";
import {
  computeActivitySeries,
  computeDentistActivity,
  computeKpis,
  computePatientsStats,
  computeTreatmentRanking,
} from "./report-selectors";
import {
  fetchAppointmentsInRange,
  fetchFinalizedEncounters,
  fetchProceduresForEncounters,
  fetchUpcomingAppointments,
  type ReportAppointment,
  type ReportEncounter,
  type ReportProcedure,
  type ReportProfessional,
} from "./reports-data";

// Real /reportes — replaces the old mock-data.ts's single synthetic
// ReportEncounter (one entity conflating "cita" and "atención") with the
// actual real tables it always should have been:
//
//   - appointments: cita-level outcomes (Citas programadas/No asistencias/
//     Cancelaciones/Tasa de asistencia) — rule: respect the real 8-value
//     status as-is, never infer completed from date/time.
//   - patient_clinical_encounters (finalized_at IS NOT NULL): actual
//     clinical work performed (Atenciones completadas/Pacientes atendidos/
//     the activity chart/"Actividad por profesional"'s atenciones column)
//     — a draft (Guardar borrador, not yet Finalizar atención) never counts.
//   - patient_clinical_encounter_procedures: Procedimientos realizados —
//     never the treatments catalog, never a treatment plan.
//
// "Tasa de asistencia" and "Atenciones completadas" therefore deliberately
// read from two DIFFERENT real sources (appointments vs encounters) even
// though they sit in the same KPI row — each is individually correct per
// its own rule; see report-selectors.ts's own comment on computeKpis.
//
// clinicId/role/selfProfessionalProfileId/initialProfessionals come from
// the real session (src/app/reportes/page.tsx's resolveClinicContext(),
// never src/dev's mock role) — same server-first pattern as every other
// real screen. Filter changes (período/profesional) refetch client-side,
// same convention as HorarioEditor/RealAppointmentDetailModal's own
// client fetches.
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

const todayIso = new Date();
const defaultCustomStart = toISODate(new Date(todayIso.getFullYear(), todayIso.getMonth(), 1));
const defaultCustomEnd = toISODate(todayIso);

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ok";
      now: Date;
      appointments: ReportAppointment[];
      upcomingAppointments: ReportAppointment[];
      finalizedEncounters: ReportEncounter[];
      allFinalizedEncounters: ReportEncounter[];
      procedures: ReportProcedure[];
      patients: Patient[];
    };

export function ReportsScreen({
  clinicId,
  role,
  selfProfessionalProfileId,
  initialProfessionals,
}: {
  clinicId: string | null;
  role: MembershipRole;
  selfProfessionalProfileId: string | null;
  initialProfessionals: ReportProfessional[];
}) {
  const isDentist = role === "dentist";
  const professionals = initialProfessionals;
  // A one-person clinic has no comparison to make either — same
  // simplified view as a plain Dentist (see task scope: never a selectable
  // Profesional filter, no comparative "Actividad por profesional").
  const isSoloView = isDentist || professionals.length <= 1;

  const [period, setPeriod] = useState<ReportPeriodKey>("this-month");
  const [professionalFilter, setProfessionalFilter] = useState(""); // "" = todos los profesionales — Clinic Admin only
  const [customStart, setCustomStart] = useState(defaultCustomStart);
  const [customEnd, setCustomEnd] = useState(defaultCustomEnd);

  const scopedProfessionalId = isDentist ? (selfProfessionalProfileId ?? "") : professionalFilter;
  const scopedProfileId = useMemo(
    () => professionals.find((p) => p.id === scopedProfessionalId)?.profileId ?? null,
    [professionals, scopedProfessionalId],
  );

  const range = useMemo<DateRange>(() => {
    const now = new Date();
    if (period !== "custom") return resolvePeriodRange(period, now);
    const start = fromISODate(customStart);
    const end = fromISODate(customEnd);
    return resolvePeriodRange("custom", now, end.getTime() >= start.getTime() ? { start, end } : { start: end, end: start });
  }, [period, customStart, customEnd]);

  // clinicId is resolved server-side once and never toggles within this
  // component's lifetime — lazy initializer instead of an effect reset,
  // same pattern as dentist-settings-screen.tsx's own loadingAbsences.
  const [loadState, setLoadState] = useState<LoadState>(() => (clinicId ? { status: "loading" } : { status: "error" }));

  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    (async () => {
      setLoadState({ status: "loading" });
      try {
        const supabase = createClient();
        const now = new Date();
        const professionalProfileId = scopedProfessionalId || null;
        const [appointments, upcomingAppointments, finalizedEncounters, allFinalizedEncounters, patients] = await Promise.all([
          fetchAppointmentsInRange(supabase, clinicId, range, professionalProfileId),
          fetchUpcomingAppointments(supabase, clinicId, now, professionalProfileId),
          fetchFinalizedEncounters(supabase, clinicId, range, scopedProfileId),
          fetchFinalizedEncounters(supabase, clinicId, null, scopedProfileId),
          fetchPatients(supabase, clinicId),
        ]);
        const procedures = await fetchProceduresForEncounters(
          supabase,
          clinicId,
          finalizedEncounters.map((e) => e.id),
        );
        if (!cancelled) {
          setLoadState({
            status: "ok",
            now,
            appointments,
            upcomingAppointments,
            finalizedEncounters,
            allFinalizedEncounters,
            procedures,
            patients,
          });
        }
      } catch (error) {
        console.error("[/reportes] failed to load real report data", error);
        if (!cancelled) setLoadState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, range, scopedProfessionalId, scopedProfileId]);

  const dentistRows = scopedProfessionalId ? professionals.filter((p) => p.id === scopedProfessionalId) : professionals;

  const kpis = loadState.status === "ok" ? computeKpis(loadState.appointments, loadState.finalizedEncounters) : null;
  const activitySeries =
    loadState.status === "ok" ? computeActivitySeries(loadState.finalizedEncounters, range) : [];
  const dentistActivity =
    loadState.status === "ok" ? computeDentistActivity(dentistRows, loadState.appointments, loadState.finalizedEncounters) : [];
  const treatmentRanking = loadState.status === "ok" ? computeTreatmentRanking(loadState.procedures) : [];
  const patientsStats =
    loadState.status === "ok"
      ? computePatientsStats(
          loadState.allFinalizedEncounters,
          loadState.finalizedEncounters,
          loadState.upcomingAppointments,
          loadState.patients,
          range,
          scopedProfessionalId ? new Set(loadState.allFinalizedEncounters.map((e) => e.patientId)) : null,
          loadState.now,
        )
      : null;

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {isSoloView ? "Analiza tu actividad y evolución clínica." : "Analiza la actividad y evolución de tu clínica."}
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

        {!isSoloView && (
          <div className="w-full sm:w-64">
            <ProfessionalSelect
              dentists={professionals}
              selectedId={professionalFilter}
              onSelect={setProfessionalFilter}
              includeAllOption
              allOptionLabel="Todos los profesionales"
              compactTrigger
            />
          </div>
        )}
      </div>

      {loadState.status === "error" && (
        <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
          No pudimos cargar los reportes. Intenta de nuevo más tarde.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={CalendarIcon} value={kpis ? String(kpis.scheduled) : "—"} label="Citas programadas" />
        <KpiCard icon={CheckCircleIcon} value={kpis ? String(kpis.completed) : "—"} label="Atenciones completadas" />
        <KpiCard icon={BarChartIcon} value={kpis ? `${kpis.attendanceRate}%` : "—"} label="Tasa de asistencia" />
        <KpiCard icon={ClockIcon} value={kpis ? String(kpis.noShow) : "—"} label="No asistencias" />
        <KpiCard icon={XCircleIcon} value={kpis ? String(kpis.cancelled) : "—"} label="Cancelaciones" />
        <KpiCard icon={UsersIcon} value={kpis ? String(kpis.patientsAttended) : "—"} label="Pacientes atendidos" />
      </div>

      {isSoloView ? (
        <ReportSection title="Mi actividad" description="Atenciones completadas a través del tiempo.">
          {loadState.status === "loading" ? (
            <LoadingChartState />
          ) : (
            <TimeSeriesBarChart data={activitySeries} />
          )}
        </ReportSection>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.15fr] lg:items-stretch">
          <ReportSection title="Actividad de la clínica" description="Atenciones completadas a través del tiempo.">
            {loadState.status === "loading" ? <LoadingChartState /> : <TimeSeriesBarChart data={activitySeries} />}
          </ReportSection>

          <ReportSection title="Actividad por profesional">
            {loadState.status === "loading" ? <LoadingChartState /> : <DentistActivityTable rows={dentistActivity} />}
          </ReportSection>
        </div>
      )}

      {/* "Pacientes atendidos", not "Mis pacientes" — the real model never
          assigns a patient to a professional (Dentist scope, or the Clinic
          Admin's own Profesional filter, both derive it from "has ≥1
          historical finalized encounter with this professional", see
          report-selectors.ts's own computePatientsStats comment) — "Mis"
          reads as ownership/assignment that doesn't exist. Logic/scoping
          unchanged, label only. */}
      <ReportSection title={isSoloView ? "Pacientes atendidos" : "Pacientes"}>
        <div className="grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-5 sm:gap-x-0 sm:divide-x sm:divide-border">
          <PatientStat
            icon={UsersIcon}
            value={patientsStats ? String(patientsStats.active) : "—"}
            label={isSoloView ? "Atendidos" : "Activos"}
          />
          <PatientStat icon={PlusIcon} value={patientsStats ? String(patientsStats.newInPeriod) : "—"} label="Nuevos en el período" />
          <PatientStat icon={RefreshIcon} value={patientsStats ? String(patientsStats.recurrent) : "—"} label="Recurrentes" />
          <PatientStat
            icon={AlertTriangleIcon}
            value={patientsStats ? String(patientsStats.staleOver6Months) : "—"}
            label="Sin atención +6 meses"
          />
          <PatientStat icon={CalendarIcon} value={patientsStats ? String(patientsStats.withUpcoming) : "—"} label="Con próxima cita" />
        </div>
      </ReportSection>

      <ReportSection title={isSoloView ? "Mis tratamientos más realizados" : "Tratamientos más realizados"}>
        {loadState.status === "loading" ? <LoadingChartState /> : <HorizontalRankingChart rows={treatmentRanking} />}
      </ReportSection>
    </div>
  );
}

function LoadingChartState() {
  return <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>;
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
        {rows.map(({ professional, atenciones, noShow, cancelled, patientsAttended }) => (
          <li
            key={professional.id}
            className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 @lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] @lg:items-center @lg:gap-2 @lg:px-3"
          >
            <p className="col-span-2 truncate text-sm font-medium @lg:col-span-1">{professional.name}</p>
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
