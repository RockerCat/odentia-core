"use client";

import { useRef, useState } from "react";
import { Tooltip } from "@/components/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import { ChevronDownIcon, ChevronIcon, CloseIcon, PlusIcon } from "@/components/shell/icons";
import { firstName } from "@/lib/format";
import type { MembershipRole } from "@/features/session/types";
import type { Patient } from "@/features/patients/data";
import { PatientRecordModal } from "@/features/patients/patient-record-modal";
import { AnchoredPopover } from "./appointment-detail-modal";
import type { Appointment, AppointmentStatus, ClinicalProfessional } from "./appointments-data";
import { getDisplayStatus, getStatusStyle, REAL_STATUS_LABELS } from "./real-status";
import { dateKeyOf, isPastSlot, toBoardProfessional, type BoardProfessional } from "./real-format";
import type { WeekDay } from "./real-week";
import { TIME_SLOTS } from "./schedule-config";
import { RealAppointmentDetailModal } from "./real-appointment-detail-modal";
import { RealNewAppointmentModal } from "./real-new-appointment-modal";

// Real /agenda board — separate, distinctly-named component from
// appointments-card.tsx (still 100% mock, still imported by the Patient
// Portal/clinical-encounter-screen/etc. — never shared between a converted
// real consumer and a still-mock one, see PROJECT_STATUS.md's Development
// Rules). Preserves the approved demo's exact layout/classNames; only the
// data layer underneath is real (Supabase, tenant-scoped, RLS-enforced).
// State ownership fix vs. the mock: appointment DATA (`appointments`) and
// week navigation live in the parent (real-agenda-screen.tsx) and are
// passed down as props, so this board and RealSummaryCards read/mutate ONE
// shared source instead of each keeping an independent local copy (a real
// correctness issue the mock's own local-state-per-component pattern never
// had to worry about — see appointments-card.tsx/summary-cards.tsx's own
// separate `allAppointments` state).

// BoardProfessional/toBoardProfessional now live in real-format.ts (a
// plain module, no "use client") so a Server Component can call the
// mapper directly — see that file's own comment. Re-exported here so this
// board's existing client-side importers (real-summary-cards.tsx,
// real-clinical-encounter-screen.tsx) don't need to change where they
// import from.
export { toBoardProfessional, type BoardProfessional };

const LEGEND = [
  { label: "Libre", className: "border border-dashed border-border" },
  { label: "Confirmada", className: "bg-primary" },
  { label: "Pendiente", className: "bg-warning" },
  { label: "En curso", className: "bg-info" },
  { label: "Sin cerrar", className: "bg-noshow" },
  { label: "Cancelada", className: "bg-danger/60" },
];

// Matches schedule-config.ts's own private parseSlotToMinutes exactly
// (that function isn't exported) — used to match an appointment's real
// `startsAt` to a "H:MM AM/PM" slot label by minutes-since-midnight,
// rather than fragile string formatting equality.
function slotToMinutes(slot: string): number {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(slot);
  if (!match) return 0;
  const [, hourStr, minuteStr, period] = match;
  let hour = Number(hourStr) % 12;
  if (period === "PM") hour += 12;
  return hour * 60 + Number(minuteStr);
}

function startMinutesLocal(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

type FilterOption<T extends string> = { value: T; label: string };

function FilterChip<T extends string>({
  label,
  value,
  options,
  onSelect,
  onClear,
}: {
  label: string;
  value: T;
  options: FilterOption<T>[];
  onSelect: (value: T) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isActive = value !== "all";
  const displayValue = isActive ? (options.find((o) => o.value === value)?.label ?? label) : label;

  return (
    <div
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border py-1 pr-1 pl-2.5 text-xs font-medium transition-colors ${
        isActive ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-foreground/70"
      }`}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1 py-0.5 hover:opacity-80"
      >
        <span>{displayValue}</span>
        {!isActive && <ChevronDownIcon className="size-3 text-muted-foreground" />}
      </button>
      {isActive && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Quitar filtro de ${label}`}
          className="flex size-4 items-center justify-center rounded-full hover:bg-primary/20"
        >
          <CloseIcon className="size-2.5" />
        </button>
      )}

      <AnchoredPopover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} widthClass="w-48">
        <ul className="flex flex-col gap-0.5">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => {
                  onSelect(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-foreground/5 ${
                  opt.value === value ? "font-medium text-primary" : ""
                }`}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      </AnchoredPopover>
    </div>
  );
}

function ProfessionalFilterChips({
  professionals,
  selectedIds,
  onToggle,
}: {
  professionals: BoardProfessional[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = professionals.filter((p) => selectedIds.includes(p.professionalProfileId));

  return (
    <div className="flex flex-wrap items-center gap-1.5 md:flex-nowrap">
      {selected.length === 0 ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border py-1 pr-1 pl-2.5 text-xs font-medium text-foreground/70 hover:opacity-80"
        >
          <span>Profesional</span>
          <ChevronDownIcon className="size-3 text-muted-foreground" />
        </button>
      ) : (
        <>
          {selected.map((p) => (
            <span
              key={p.professionalProfileId}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-1 pr-1 pl-2.5 text-xs font-medium text-primary"
            >
              {p.name}
              <button
                type="button"
                onClick={() => onToggle(p.professionalProfileId)}
                aria-label={`Quitar ${p.name}`}
                className="flex size-4 items-center justify-center rounded-full hover:bg-primary/20"
              >
                <CloseIcon className="size-2.5" />
              </button>
            </span>
          ))}
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label="Agregar profesional al filtro"
            className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <ChevronDownIcon className="size-3" />
          </button>
        </>
      )}

      <AnchoredPopover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} widthClass="w-48">
        <ul className="flex flex-col gap-0.5">
          {professionals.map((p) => {
            const checked = selectedIds.includes(p.professionalProfileId);
            return (
              <li key={p.professionalProfileId}>
                <button
                  type="button"
                  onClick={() => onToggle(p.professionalProfileId)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-foreground/5 ${
                    checked ? "font-medium text-primary" : ""
                  }`}
                >
                  <span className={`size-3.5 shrink-0 rounded border ${checked ? "border-primary bg-primary" : "border-border"}`} />
                  {p.name}
                </button>
              </li>
            );
          })}
        </ul>
      </AnchoredPopover>
    </div>
  );
}

export function RealAppointmentsBoard({
  clinicId,
  role,
  ownProfessionalProfileId,
  professionals: rawProfessionals,
  weekDays,
  weekLabel,
  weekOffset,
  onChangeWeek,
  onGoToday,
  selectedDay,
  onSelectDay,
  appointments,
  onAppointmentUpdated,
  onAppointmentCreated,
  initialPatients,
  treatmentOptions,
  roomOptions,
  canEditPatientData,
}: {
  clinicId: string;
  role: MembershipRole;
  ownProfessionalProfileId: string | null;
  professionals: ClinicalProfessional[];
  weekDays: WeekDay[];
  weekLabel: string;
  weekOffset: number;
  onChangeWeek: (nextOffset: number) => void;
  onGoToday: () => void;
  selectedDay: string;
  onSelectDay: (dayKey: string) => void;
  appointments: Appointment[];
  onAppointmentUpdated: (updated: Appointment) => void;
  onAppointmentCreated: (created: Appointment) => void;
  initialPatients: Patient[];
  treatmentOptions: string[];
  roomOptions: string[];
  canEditPatientData: boolean;
}) {
  const professionals = rawProfessionals.map(toBoardProfessional);
  const isDentist = role === "dentist";
  const scopedProfessionals = isDentist
    ? professionals.filter((p) => p.professionalProfileId === ownProfessionalProfileId)
    : professionals;

  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [professionalFilter, setProfessionalFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "all">("all");
  const [showNewAppointment, setShowNewAppointment] = useState(false);
  const [newAppointmentPrefill, setNewAppointmentPrefill] = useState<{
    professionalProfileId?: string;
    dayKey?: string;
    time?: string;
  } | null>(null);
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [viewingPatientId, setViewingPatientId] = useState<string | null>(null);

  const toggleProfessionalFilter = (id: string) => {
    setProfessionalFilter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const clearFilters = () => {
    setProfessionalFilter([]);
    setStatusFilter("all");
  };

  const openNewAppointment = (prefill: { professionalProfileId?: string; dayKey?: string; time?: string } | null) => {
    setNewAppointmentPrefill(prefill);
    setShowNewAppointment(true);
  };

  const closeNewAppointment = () => {
    setShowNewAppointment(false);
    setNewAppointmentPrefill(null);
  };

  const dayAppointmentsAll = isDentist
    ? appointments.filter((a) => a.professionalProfileId === ownProfessionalProfileId)
    : appointments;
  const countForDay = (dayKey: string) => dayAppointmentsAll.filter((a) => dateKeyOf(a.startsAt) === dayKey).length;
  const maxDayCount = Math.max(...weekDays.map((day) => countForDay(day.key)), 1);

  const dayAppointments = dayAppointmentsAll.filter((a) => dateKeyOf(a.startsAt) === selectedDay);
  const selectedAppointment = appointments.find((a) => a.id === selectedAppointmentId) ?? null;
  const viewingPatient = patients.find((p) => p.id === viewingPatientId) ?? null;

  const statusFilteredDayAppointments = dayAppointments.filter((a) => statusFilter === "all" || a.status === statusFilter);
  const hasActiveFilters = professionalFilter.length > 0 || statusFilter !== "all";

  const sortedProfessionals = [...scopedProfessionals].sort(
    (a, b) =>
      statusFilteredDayAppointments.filter((appt) => appt.professionalProfileId === b.professionalProfileId).length -
      statusFilteredDayAppointments.filter((appt) => appt.professionalProfileId === a.professionalProfileId).length,
  );
  // A Clinic Admin who also practices always sees her own column first —
  // matches the approved demo's own pinning of the admin's synthetic
  // column (see appointments-card.tsx's adminDentistEntry), now backed by
  // her real professional_profile instead of a synthetic mock entry.
  const orderedProfessionals =
    role === "clinic_admin" && ownProfessionalProfileId
      ? [
          ...sortedProfessionals.filter((p) => p.professionalProfileId === ownProfessionalProfileId),
          ...sortedProfessionals.filter((p) => p.professionalProfileId !== ownProfessionalProfileId),
        ]
      : sortedProfessionals;
  const visibleProfessionals =
    professionalFilter.length === 0 ? orderedProfessionals : orderedProfessionals.filter((p) => professionalFilter.includes(p.professionalProfileId));

  const slotGridColsClass =
    visibleProfessionals.length === 1
      ? "grid-cols-3 md:grid-cols-8"
      : visibleProfessionals.length === 2
        ? "grid-cols-3 md:grid-cols-4"
        : "grid-cols-3";

  const statusFilterOptions: FilterOption<AppointmentStatus | "all">[] = [
    { value: "all", label: "Todos" },
    ...(Object.keys(REAL_STATUS_LABELS) as AppointmentStatus[]).map((status) => ({
      value: status,
      label: REAL_STATUS_LABELS[status],
    })),
  ];

  const ownProfessionalDisplay = professionals.find((p) => p.professionalProfileId === ownProfessionalProfileId) ?? null;

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="border-b border-border px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChangeWeek(weekOffset - 1)}
              aria-label="Semana anterior"
              className="flex size-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5"
            >
              <ChevronIcon className="size-4" />
            </button>
            <span className="min-w-[11rem] px-1 text-center text-base font-semibold tracking-tight">{weekLabel}</span>
            <button
              type="button"
              onClick={() => onChangeWeek(weekOffset + 1)}
              aria-label="Semana siguiente"
              className="flex size-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5"
            >
              <ChevronIcon className="size-4 rotate-180" />
            </button>
            <button
              type="button"
              onClick={onGoToday}
              className="ml-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
            >
              Hoy
            </button>
          </div>

          <button
            type="button"
            onClick={() => openNewAppointment(null)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <PlusIcon className="size-4" />
            <span className="hidden sm:inline">Nueva cita</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const active = day.key === selectedDay;
            const level = Math.round((countForDay(day.key) / maxDayCount) * 6);
            return (
              <button
                key={day.key}
                type="button"
                onClick={() => onSelectDay(day.key)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 transition-colors ${
                  active ? "border-primary/30 bg-primary/5" : "border-border hover:bg-foreground/[0.03]"
                }`}
              >
                <span className={`text-[10px] font-medium tracking-wide uppercase ${active ? "text-primary" : "text-label-foreground"}`}>
                  {day.shortLabel}
                </span>
                <span className={`text-sm font-semibold ${active ? "text-primary" : ""}`}>{day.dateNumber}</span>
                <span className="flex h-2.5 items-end gap-[2px]">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span
                      key={i}
                      className={`w-[3px] rounded-full ${i < level ? (active ? "bg-primary" : "bg-primary/40") : "bg-border"}`}
                      style={{ height: `${((i % 3) + 1) * 3}px` }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-start gap-2 md:flex-nowrap md:justify-end md:gap-3">
          {!isDentist && professionals.length > 1 && (
            <ProfessionalFilterChips professionals={professionals} selectedIds={professionalFilter} onToggle={toggleProfessionalFilter} />
          )}
          <FilterChip label="Estado" value={statusFilter} options={statusFilterOptions} onSelect={setStatusFilter} onClear={() => setStatusFilter("all")} />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              aria-label="Limpiar filtros"
              className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            >
              <CloseIcon className="size-3" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 p-5">
        {visibleProfessionals.length === 0 ? (
          <p className="col-span-full rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Tu clínica todavía no tiene profesionales activos con perfil clínico configurado.
          </p>
        ) : (
          visibleProfessionals.map((professional) => {
            const professionalAppointments = statusFilteredDayAppointments.filter(
              (a) => a.professionalProfileId === professional.professionalProfileId,
            );
            const occupied = professionalAppointments.length;

            return (
              <div key={professional.professionalProfileId} className="min-w-0 rounded-lg border border-border">
                <div className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left">
                  <UserAvatar name={professional.name} initials={professional.initials} avatar_url={professional.avatarUrl ?? undefined} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{professional.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{professional.specialty}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {occupied}/{TIME_SLOTS.length}
                  </span>
                </div>

                <div className={`grid ${slotGridColsClass} gap-1.5 p-3`}>
                  {TIME_SLOTS.map((slot) => {
                    const appointment = professionalAppointments.find((a) => startMinutesLocal(a.startsAt) === slotToMinutes(slot));
                    if (!appointment) {
                      const past = isPastSlot(selectedDay, slot);
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={past}
                          aria-disabled={past}
                          onClick={() => openNewAppointment({ professionalProfileId: professional.professionalProfileId, dayKey: selectedDay, time: slot })}
                          className={`flex h-12 flex-col items-center justify-center rounded-md border border-dashed transition-colors ${
                            past
                              ? "cursor-not-allowed border-border/60 text-muted-foreground/30"
                              : "border-border text-muted-foreground/70 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                          }`}
                        >
                          <span className="text-[10px] font-medium">{slot}</span>
                        </button>
                      );
                    }
                    return (
                      <Tooltip
                        key={slot}
                        content={
                          <>
                            <span className="block font-semibold">{appointment.patientName}</span>
                            {appointment.reason && <span className="block text-background/75">{appointment.reason}</span>}
                            {appointment.patientArrivedAt && <span className="block text-background/75">Paciente llegó</span>}
                          </>
                        }
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedAppointmentId(appointment.id)}
                          className={`relative flex h-12 flex-col items-center justify-center rounded-md border px-1 text-center transition-opacity ${getStatusStyle(getDisplayStatus(appointment))} ${
                            appointment.status === "cancelled" ? "opacity-70" : ""
                          }`}
                        >
                          {appointment.patientArrivedAt && (
                            <span aria-hidden="true" className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-background bg-success" />
                          )}
                          <span className="text-[9px] font-medium opacity-80">{slot}</span>
                          <span className="max-w-full truncate text-[11px] font-semibold">{firstName(appointment.patientName)}</span>
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-nowrap items-center justify-center gap-x-3 border-t border-border px-5 py-3">
        {LEGEND.map((item) => (
          <span key={item.label} className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`size-2 shrink-0 rounded-full ${item.className}`} />
            {item.label}
          </span>
        ))}
      </div>

      {selectedAppointment && !viewingPatientId && (
        <RealAppointmentDetailModal
          appointment={selectedAppointment}
          professional={professionals.find((p) => p.professionalProfileId === selectedAppointment.professionalProfileId) ?? null}
          role={role}
          treatmentOptions={treatmentOptions}
          roomOptions={roomOptions}
          onClose={() => setSelectedAppointmentId(null)}
          onUpdated={(updated) => onAppointmentUpdated(updated)}
          onViewPatient={(patientId) => setViewingPatientId(patientId)}
        />
      )}

      {viewingPatient && (
        <PatientRecordModal
          patient={viewingPatient}
          clinicId={clinicId}
          canEditPatientData={canEditPatientData}
          onClose={() => {
            setViewingPatientId(null);
            setSelectedAppointmentId(null);
          }}
          onUpdated={(updated) => setPatients((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
        />
      )}

      {showNewAppointment && (
        <RealNewAppointmentModal
          clinicId={clinicId}
          patients={patients}
          professionals={scopedProfessionals}
          lockedProfessional={isDentist ? ownProfessionalDisplay : null}
          weekDays={weekDays}
          treatmentOptions={treatmentOptions}
          roomOptions={roomOptions}
          prefill={newAppointmentPrefill}
          onClose={closeNewAppointment}
          onCreated={(created) => {
            onAppointmentCreated(created);
            closeNewAppointment();
          }}
        />
      )}
    </div>
  );
}
