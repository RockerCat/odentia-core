"use client"; // needed for day-selection state and the useRole() gate below.

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Tooltip } from "@/components/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import { ChevronDownIcon, ChevronIcon, CloseIcon, PencilIcon, PhoneIcon, PlusIcon } from "@/components/shell/icons";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { firstName } from "@/lib/format";
import { CURRENT_USER } from "@/lib/current-user";
import { AnchoredPopover, AppointmentDetailModal, FIELD_CLASS } from "./appointment-detail-modal";
import { ClinicalEncounterScreen } from "./clinical-encounter-screen";
import type { Appointment, AppointmentStatus, Dentist, WeekDay } from "./mock-data";
import { ADMIN_DENTIST_ID, STATUS_LABELS, STATUS_STYLES } from "./mock-data";
import { NewAppointmentModal } from "./new-appointment-modal";
import { TIME_SLOTS } from "./schedule-config";

const LEGEND = [
  { label: "Libre", className: "border border-dashed border-border" },
  { label: "Confirmada", className: "bg-primary" },
  { label: "Pendiente", className: "bg-warning" },
  { label: "En curso", className: "bg-info" },
  { label: "Cancelada", className: "bg-danger/60" },
];

// Monday of the one real week this prototype's mock data models (see
// WEEK_DAYS/CURRENT_WEEK_LABEL in mock-data.ts — August 3–9, 2026).
const REFERENCE_MONDAY = new Date(2026, 7, 3);

const DAY_META = [
  { key: "monday", label: "Lunes", shortLabel: "Lun" },
  { key: "tuesday", label: "Martes", shortLabel: "Mar" },
  { key: "wednesday", label: "Miércoles", shortLabel: "Mié" },
  { key: "thursday", label: "Jueves", shortLabel: "Jue" },
  { key: "friday", label: "Viernes", shortLabel: "Vie" },
  { key: "saturday", label: "Sábado", shortLabel: "Sáb" },
  { key: "sunday", label: "Domingo", shortLabel: "Dom" },
];

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// This prototype's mock data only models the one real week above —
// browsing to any other week still navigates for real (real dates, real
// header range), it just correctly shows no appointments rather than
// fabricating data that was never modeled.
function buildWeekDaysForOffset(offset: number, baseWeekDays: WeekDay[]): WeekDay[] {
  if (offset === 0) return baseWeekDays;
  const today = addDays(REFERENCE_MONDAY, 2); // Wednesday of the reference week
  const monday = addDays(REFERENCE_MONDAY, offset * 7);
  return DAY_META.map((meta, i) => {
    const date = addDays(monday, i);
    return {
      key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      label: meta.label,
      shortLabel: meta.shortLabel,
      dateNumber: String(date.getDate()),
      dateLabel: `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`,
      isToday: isSameCalendarDay(date, today),
    };
  });
}

function buildWeekLabelForOffset(offset: number, baseWeekLabel: string): string {
  if (offset === 0) return baseWeekLabel;
  const monday = addDays(REFERENCE_MONDAY, offset * 7);
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()} – ${sunday.getDate()} ${MONTH_NAMES[sunday.getMonth()]} ${sunday.getFullYear()}`;
  }
  return `${monday.getDate()} ${MONTH_NAMES[monday.getMonth()]} – ${sunday.getDate()} ${MONTH_NAMES[sunday.getMonth()]} ${sunday.getFullYear()}`;
}

type FilterOption<T extends string> = { value: T; label: string };

// Active-filter chip: reuses AnchoredPopover (the same positioned-dropdown
// component the detail modal's Fecha/Horario editors use) for its option
// list, rendered as a pill instead of a traditional <select>.
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
  // No "Label: " prefix — the chip shows its own name as a placeholder
  // when unset, and just the picked value once a filter is active.
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

// Multi-select variant of the filter chip above, used only for Profesional:
// each picked dentist renders as its own removable chip, and a small
// chevron trigger (re)opens the same AnchoredPopover dropdown to keep
// adding or removing dentists without closing after every pick.
function ProfessionalFilterChips({
  dentists,
  selectedIds,
  onToggle,
}: {
  dentists: Dentist[];
  selectedIds: string[];
  onToggle: (dentistId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedDentists = dentists.filter((d) => selectedIds.includes(d.id));

  return (
    <div className="flex flex-wrap items-center gap-1.5 md:flex-nowrap">
      {selectedDentists.length === 0 ? (
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
          {selectedDentists.map((dentist) => (
            <span
              key={dentist.id}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-1 pr-1 pl-2.5 text-xs font-medium text-primary"
            >
              {dentist.name}
              <button
                type="button"
                onClick={() => onToggle(dentist.id)}
                aria-label={`Quitar ${dentist.name}`}
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
          {dentists.map((dentist) => {
            const checked = selectedIds.includes(dentist.id);
            return (
              <li key={dentist.id}>
                <button
                  type="button"
                  onClick={() => onToggle(dentist.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-foreground/5 ${
                    checked ? "font-medium text-primary" : ""
                  }`}
                >
                  <span
                    className={`size-3.5 shrink-0 rounded border ${
                      checked ? "border-primary bg-primary" : "border-border"
                    }`}
                  />
                  {dentist.name}
                </button>
              </li>
            );
          })}
        </ul>
      </AnchoredPopover>
    </div>
  );
}

export function AppointmentsCard({
  appointments,
  dentists,
  weekDays,
  weekLabel,
}: {
  appointments: Appointment[];
  dentists: Dentist[];
  weekDays: WeekDay[];
  weekLabel: string;
}) {
  const {
    role,
    dentistId: currentDentistId,
    selfDentistOverride,
    setSelfDentistOverride,
    adminIdentityOverride,
    adminProfessionalProfile,
  } = useRole();
  // DEV TOOL — Superadmin doesn't do clinical scheduling (see CLAUDE.md Domain Model).
  const canCreateAppointments = process.env.NODE_ENV !== "development" || role !== "superadmin";
  // DEV TOOL — a Dentist only manages their own clinical operation (see
  // CLAUDE.md Domain Model): the board, filters and KPIs all scope down to
  // this one dentist instead of the whole clinic.
  const isDentist = role === "dentist";
  // DEV TOOL — a Dentist changing their own name/specialty/photo (see
  // DentistProfileModal's onSelfProfileChange below) has nowhere real to
  // persist to yet, so selfDentistOverride (shared via RoleContext with the
  // shell Header) stands in for those fields of the mock DENTISTS record —
  // applied wherever this dentist is rendered for the rest of the session
  // (board columns, filters, modals), same as a real save would.
  const dentistsWithPhotoOverride = dentists.map((d) =>
    d.id === currentDentistId ? { ...d, ...selfDentistOverride } : d,
  );
  // DEV TOOL — once the Clinic Admin configures "Perfil profesional" from
  // "Mi perfil" (see AdminProfileModal), they should visually show up as a
  // professional too — a synthetic Dentist entry, additive to DENTISTS,
  // never replacing the admin's actual role.
  const adminDentistEntry: Dentist | null = adminProfessionalProfile
    ? {
        id: ADMIN_DENTIST_ID,
        name: adminIdentityOverride.name ?? CURRENT_USER.name,
        initials: CURRENT_USER.initials,
        specialty: adminProfessionalProfile.specialty,
        avatar_url: adminIdentityOverride.avatar_url ?? CURRENT_USER.avatar_url,
      }
    : null;
  const effectiveDentists = adminDentistEntry
    ? [...dentistsWithPhotoOverride, adminDentistEntry]
    : dentistsWithPhotoOverride;
  const currentDentist = effectiveDentists.find((d) => d.id === currentDentistId) ?? null;
  const scopedDentists = isDentist && currentDentist ? [currentDentist] : effectiveDentists;

  const [selectedDay, setSelectedDay] = useState(
    weekDays.find((day) => day.isToday)?.key ?? weekDays[0]?.key,
  );
  // 0 = the one real week this prototype models (weekDays/weekLabel props,
  // unchanged); any other offset is navigated for real but has no
  // appointment data behind it (see buildWeekDaysForOffset above).
  const [weekOffset, setWeekOffset] = useState(0);

  // Owns the list locally so edits made in the detail modal show up in the
  // board immediately — this prototype phase simulates CRUD with local
  // state instead of a real backend (see PROJECT_STATUS.md).
  const [allAppointments, setAllAppointments] = useState(appointments);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  // Set when the clinical encounter screen ("Iniciar atención") is open —
  // separate from selectedAppointmentId so opening it can close the detail
  // modal underneath rather than stacking on top of it.
  const [encounterAppointmentId, setEncounterAppointmentId] = useState<string | null>(null);
  const [selectedDentistId, setSelectedDentistId] = useState<string | null>(null);
  // Empty array means no filter applied (shown as "Todos") — doesn't
  // affect selectedDay/weekOffset. Multi-select: 0..N dentist ids.
  const [professionalFilter, setProfessionalFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "all">("all");
  const [showNewAppointment, setShowNewAppointment] = useState(false);
  // Set only when opened from an empty calendar slot; the "Nueva cita"
  // button always opens with this null, keeping that flow exactly as it
  // was before this change.
  const [newAppointmentPrefill, setNewAppointmentPrefill] = useState<{
    dentistId: string;
    day: string;
    time: string;
  } | null>(null);

  const updateAppointment = (updated: Appointment) => {
    setAllAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  const addAppointment = (created: Appointment) => {
    setAllAppointments((prev) => [...prev, created]);
  };

  const toggleProfessionalFilter = (dentistId: string) => {
    setProfessionalFilter((prev) =>
      prev.includes(dentistId) ? prev.filter((id) => id !== dentistId) : [...prev, dentistId],
    );
  };

  const clearFilters = () => {
    setProfessionalFilter([]);
    setStatusFilter("all");
  };

  // Simulates the side effect of inactivating a professional: their active
  // upcoming appointments are cancelled automatically (see the confirmation
  // flow in DentistProfileModal below).
  const deactivateDentistAppointments = (dentistId: string) => {
    setAllAppointments((prev) =>
      prev.map((a) =>
        a.dentistId === dentistId && (a.status === "confirmed" || a.status === "pending" || a.status === "in-progress")
          ? { ...a, status: "cancelled" }
          : a,
      ),
    );
  };

  const openNewAppointment = (prefill: { dentistId: string; day: string; time: string } | null) => {
    setNewAppointmentPrefill(prefill);
    setShowNewAppointment(true);
  };

  const closeNewAppointment = () => {
    setShowNewAppointment(false);
    setNewAppointmentPrefill(null);
  };

  const currentWeekDays = buildWeekDaysForOffset(weekOffset, weekDays);
  const currentWeekLabel = buildWeekLabelForOffset(weekOffset, weekLabel);
  // Only the real week (offset 0) has appointment data at all — see
  // buildWeekDaysForOffset's comment. Scoped to just this dentist's own
  // appointments when role is "dentist", so the day-selector's activity
  // bars below reflect only their own load too.
  const weekAppointments = (weekOffset === 0 ? allAppointments : []).filter(
    (a) => !isDentist || a.dentistId === currentDentistId,
  );

  const changeWeek = (nextOffset: number) => {
    const nextWeekDays = buildWeekDaysForOffset(nextOffset, weekDays);
    const previousIndex = currentWeekDays.findIndex((day) => day.key === selectedDay);
    setWeekOffset(nextOffset);
    setSelectedDay(nextWeekDays[previousIndex >= 0 ? previousIndex : 0]?.key ?? nextWeekDays[0]?.key);
  };

  const goToToday = () => {
    setWeekOffset(0);
    setSelectedDay(weekDays.find((day) => day.isToday)?.key ?? weekDays[0]?.key);
  };

  const countForDay = (dayKey: string) => weekAppointments.filter((a) => a.day === dayKey).length;
  const maxDayCount = Math.max(...currentWeekDays.map((day) => countForDay(day.key)), 1);

  const dayAppointments = weekAppointments.filter((a) => a.day === selectedDay);
  const selectedAppointment = allAppointments.find((a) => a.id === selectedAppointmentId) ?? null;
  const selectedDentist = effectiveDentists.find((d) => d.id === selectedDentistId) ?? null;
  const encounterAppointment = allAppointments.find((a) => a.id === encounterAppointmentId) ?? null;

  // Estado filter thins out which appointments show in each dentist's slot
  // grid (non-matching slots simply render as free); Profesional filter
  // hides other dentists' cards entirely instead of leaving them empty.
  const statusFilteredDayAppointments = dayAppointments.filter(
    (a) => statusFilter === "all" || a.status === statusFilter,
  );
  const hasActiveFilters = professionalFilter.length > 0 || statusFilter !== "all";

  const sortedDentists = [...scopedDentists].sort(
    (a, b) =>
      statusFilteredDayAppointments.filter((appt) => appt.dentistId === b.id).length -
      statusFilteredDayAppointments.filter((appt) => appt.dentistId === a.id).length,
  );
  // A Clinic Admin who's also configured a "Perfil profesional" (see
  // adminDentistEntry above) always sees their own column first — pinned by
  // id, not by name, since it's derived from the authenticated user's own
  // profile — with every other professional keeping the relative order the
  // count-based sort above already gave them.
  const orderedDentists =
    role === "clinic-admin" && adminDentistEntry
      ? [
          ...sortedDentists.filter((d) => d.id === ADMIN_DENTIST_ID),
          ...sortedDentists.filter((d) => d.id !== ADMIN_DENTIST_ID),
        ]
      : sortedDentists;
  const visibleDentists =
    professionalFilter.length === 0
      ? orderedDentists
      : orderedDentists.filter((d) => professionalFilter.includes(d.id));

  // Adaptive time-slot grid: fewer visible dentist cards means each one
  // can afford more columns without shrinking the row height — only the
  // column count changes, everything else about the slot grid stays as is.
  // Mobile always stays at 3 columns regardless of count; the adaptive
  // 8/4/3 behavior only kicks in at the md: breakpoint (desktop).
  const slotGridColsClass =
    visibleDentists.length === 1
      ? "grid-cols-3 md:grid-cols-8"
      : visibleDentists.length === 2
        ? "grid-cols-3 md:grid-cols-4"
        : "grid-cols-3";

  const statusFilterOptions: FilterOption<AppointmentStatus | "all">[] = [
    { value: "all", label: "Todos" },
    ...(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((status) => ({
      value: status,
      label: STATUS_LABELS[status],
    })),
  ];

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="border-b border-border px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => changeWeek(weekOffset - 1)}
              aria-label="Semana anterior"
              className="flex size-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5"
            >
              <ChevronIcon className="size-4" />
            </button>
            <span className="min-w-[11rem] px-1 text-center text-base font-semibold tracking-tight">
              {currentWeekLabel}
            </span>
            <button
              type="button"
              onClick={() => changeWeek(weekOffset + 1)}
              aria-label="Semana siguiente"
              className="flex size-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5"
            >
              <ChevronIcon className="size-4 rotate-180" />
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="ml-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
            >
              Hoy
            </button>
          </div>

          {canCreateAppointments && (
            <button
              type="button"
              onClick={() => openNewAppointment(null)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <PlusIcon className="size-4" />
              <span className="hidden sm:inline">Nueva cita</span>
            </button>
          )}
        </div>

        {/* Day selector — picks which day's board is shown below. Spans the
            full width so the first/last day align with the card's edges. */}
        <div className="mt-4 grid grid-cols-7 gap-2">
          {currentWeekDays.map((day) => {
            const active = day.key === selectedDay;
            const level = Math.round((countForDay(day.key) / maxDayCount) * 6);
            return (
              <button
                key={day.key}
                type="button"
                onClick={() => setSelectedDay(day.key)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 transition-colors ${
                  active
                    ? "border-primary/30 bg-primary/5"
                    : "border-border hover:bg-foreground/[0.03]"
                }`}
              >
                <span
                  className={`text-[10px] font-medium tracking-wide uppercase ${
                    active ? "text-primary" : "text-label-foreground"
                  }`}
                >
                  {day.shortLabel}
                </span>
                <span className={`text-sm font-semibold ${active ? "text-primary" : ""}`}>
                  {day.dateNumber}
                </span>
                <span className="flex h-2.5 items-end gap-[2px]">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span
                      key={i}
                      className={`w-[3px] rounded-full ${
                        i < level ? (active ? "bg-primary" : "bg-primary/40") : "bg-border"
                      }`}
                      style={{ height: `${((i % 3) + 1) * 3}px` }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filtros — esta fila queda exclusivamente para Profesional y
            Estado; la leyenda de convenciones vive debajo de la grilla. */}
        <div className="mt-3 flex flex-wrap items-center justify-start gap-2 md:flex-nowrap md:justify-end md:gap-3">
          {!isDentist && (
            <ProfessionalFilterChips
              dentists={effectiveDentists}
              selectedIds={professionalFilter}
              onToggle={toggleProfessionalFilter}
            />
          )}
          <FilterChip
            label="Estado"
            value={statusFilter}
            options={statusFilterOptions}
            onSelect={setStatusFilter}
            onClear={() => setStatusFilter("all")}
          />
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

      {/* Operations board — one card per dentist, single continuous slot
          grid. Cards wrap onto new rows instead of overflowing sideways;
          the page itself scrolls, nothing scrolls internally. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 p-5">
        {visibleDentists.map((dentist) => {
          const dentistAppointments = statusFilteredDayAppointments.filter((a) => a.dentistId === dentist.id);
          const occupied = dentistAppointments.length;

          return (
            <div key={dentist.id} className="min-w-0 rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setSelectedDentistId(dentist.id)}
                className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
              >
                <UserAvatar
                  name={dentist.name}
                  initials={dentist.initials}
                  avatar_url={dentist.avatar_url}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{dentist.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{dentist.specialty}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {occupied}/{TIME_SLOTS.length}
                </span>
              </button>

              <div className={`grid ${slotGridColsClass} gap-1.5 p-3`}>
                {TIME_SLOTS.map((slot) => {
                  const appointment = dentistAppointments.find((a) => a.time === slot);
                  if (!appointment) {
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={
                          canCreateAppointments && weekOffset === 0
                            ? () => openNewAppointment({ dentistId: dentist.id, day: selectedDay, time: slot })
                            : undefined
                        }
                        className="flex h-12 flex-col items-center justify-center rounded-md border border-dashed border-border text-muted-foreground/70 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
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
                          {appointment.type && (
                            <span className="block text-background/75">{appointment.type}</span>
                          )}
                          {appointment.waitingRoom && (
                            <span className="block text-background/75">En sala de espera</span>
                          )}
                        </>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedAppointmentId(appointment.id)}
                        className={`relative flex h-12 flex-col items-center justify-center rounded-md border px-1 text-center transition-opacity ${STATUS_STYLES[appointment.status]} ${
                          appointment.status === "cancelled" ? "opacity-70" : ""
                        }`}
                      >
                        {appointment.waitingRoom && (
                          <span
                            aria-hidden="true"
                            className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-background bg-success"
                          />
                        )}
                        <span className="text-[9px] font-medium opacity-80">{slot}</span>
                        <span className="max-w-full truncate text-[11px] font-semibold">
                          {firstName(appointment.patientName)}
                        </span>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Convenciones — debajo de la grilla completa de profesionales y
          horarios, en una sola línea centrada y compacta. */}
      <div className="flex flex-nowrap items-center justify-center gap-x-3 border-t border-border px-5 py-3">
        {LEGEND.map((item) => (
          <span key={item.label} className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`size-2 shrink-0 rounded-full ${item.className}`} />
            {item.label}
          </span>
        ))}
      </div>

      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          allAppointments={allAppointments}
          dentists={scopedDentists}
          weekDays={weekDays}
          onClose={() => setSelectedAppointmentId(null)}
          onUpdate={updateAppointment}
          onStartEncounter={() => {
            setSelectedAppointmentId(null);
            setEncounterAppointmentId(selectedAppointment.id);
          }}
        />
      )}

      {encounterAppointment && (
        <ClinicalEncounterScreen
          appointment={encounterAppointment}
          dentists={scopedDentists}
          allAppointments={allAppointments}
          weekDays={weekDays}
          onExit={() => setEncounterAppointmentId(null)}
          onComplete={() => {
            updateAppointment({ ...encounterAppointment, status: "completed" });
            setEncounterAppointmentId(null);
          }}
          onCreateAppointment={addAppointment}
          onUpdateAppointment={updateAppointment}
        />
      )}

      {showNewAppointment && (
        <NewAppointmentModal
          dentists={scopedDentists}
          weekDays={weekDays}
          existingAppointments={allAppointments}
          prefill={newAppointmentPrefill ?? undefined}
          lockedDentist={isDentist ? (currentDentist ?? undefined) : undefined}
          onClose={closeNewAppointment}
          onCreate={addAppointment}
        />
      )}

      {selectedDentist && (
        <DentistProfileModal
          dentist={selectedDentist}
          allAppointments={allAppointments}
          onClose={() => setSelectedDentistId(null)}
          onDeactivate={() => deactivateDentistAppointments(selectedDentist.id)}
          onSelfProfileChange={setSelfDentistOverride}
        />
      )}
    </div>
  );
}

// Exported so AdminProfileModal's "Disponibilidad de atención" step can
// reuse this exact day/hours picker instead of redefining it.
export const DAY_ORDER = ["L", "M", "X", "J", "V", "S", "D"];
const DAY_SHORT_LABELS: Record<string, string> = {
  L: "Lun",
  M: "Mar",
  X: "Mié",
  J: "Jue",
  V: "Vie",
  S: "Sáb",
  D: "Dom",
};
export const SCHEDULE_TIME_OPTIONS = [
  "7:00 AM",
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
  "7:00 PM",
  "8:00 PM",
];

export function formatScheduleLabel(days: string[], start: string, end: string): string {
  if (days.length === 0) return "Sin horario definido";
  const sorted = DAY_ORDER.filter((day) => days.includes(day));
  const isContiguous = sorted.every(
    (day, i) => i === 0 || DAY_ORDER.indexOf(day) === DAY_ORDER.indexOf(sorted[i - 1]) + 1,
  );
  const daysLabel =
    sorted.length > 1 && isContiguous
      ? `${DAY_SHORT_LABELS[sorted[0]]} - ${DAY_SHORT_LABELS[sorted[sorted.length - 1]]}`
      : sorted.map((day) => DAY_SHORT_LABELS[day]).join(", ");
  return `${daysLabel} · ${start} - ${end}`;
}

type TodayAgendaItem = {
  time: string;
  patient: string;
  treatment: string;
  status: AppointmentStatus;
  isNext?: boolean;
};

type SeenPatient = { name: string; initials: string; lastVisit: string };

type MonthAppointmentItem = {
  date: string;
  time: string;
  patient: string;
  treatment: string;
  status: AppointmentStatus;
};

type DentistStatus = "active" | "inactive";

type DentistProfileMock = {
  registrationNumber: string;
  phone: string;
  email: string;
  mainRoom: string;
  scheduleDays: string[];
  scheduleStart: string;
  scheduleEnd: string;
  appointmentsToday: number;
  patientsSeenToday: number;
  activePatients: number;
  appointmentsThisMonth: number;
  patientsSeenTodayList: SeenPatient[];
  todayAgenda: TodayAgendaItem[];
  // Representative samples, not exhaustive listings of the full counts
  // above — same simplification this prototype already applies elsewhere
  // (e.g. HISTORY_LIMIT for the patient history timeline).
  activePatientsList: SeenPatient[];
  monthAppointments: MonthAppointmentItem[];
};

// Placeholder profile details for the modal below, while it connects to
// real dentist records (see PROJECT_STATUS.md's mock-data-only phase) —
// keyed by id, with a generic fallback for any dentist not listed here.
const DENTIST_PROFILE_MOCK: Record<string, DentistProfileMock> = {
  d1: {
    registrationNumber: "T.P. 45231",
    phone: "+57 300 123 4567",
    email: "camila.vargas@odentia.com",
    mainRoom: "Consultorio 1",
    scheduleDays: ["L", "M", "X", "J", "V"],
    scheduleStart: "8:00 AM",
    scheduleEnd: "5:00 PM",
    appointmentsToday: 6,
    patientsSeenToday: 3,
    activePatients: 128,
    appointmentsThisMonth: 42,
    patientsSeenTodayList: [
      { name: "Laura Gómez", initials: "LG", lastVisit: "22 Jul 2026" },
      { name: "Andrés Pineda", initials: "AP", lastVisit: "15 Jul 2026" },
      { name: "Sofía Ramírez", initials: "SR", lastVisit: "30 Jun 2026" },
    ],
    todayAgenda: [
      { time: "08:00", patient: "Laura Gómez", treatment: "Limpieza dental", status: "completed" },
      { time: "09:00", patient: "Andrés Pineda", treatment: "Control ortodóncico", status: "completed" },
      { time: "10:00", patient: "Sofía Ramírez", treatment: "Resina", status: "completed" },
      { time: "11:00", patient: "Diego Morales", treatment: "Valoración general", status: "confirmed", isNext: true },
      { time: "12:30", patient: "Mariana Duarte", treatment: "Extracción", status: "pending" },
      { time: "15:00", patient: "Esteban Correa", treatment: "Blanqueamiento", status: "cancelled" },
    ],
    activePatientsList: [
      { name: "Laura Gómez", initials: "LG", lastVisit: "22 Jul 2026" },
      { name: "Andrés Pineda", initials: "AP", lastVisit: "15 Jul 2026" },
      { name: "Sofía Ramírez", initials: "SR", lastVisit: "30 Jun 2026" },
      { name: "Camilo Rueda", initials: "CR", lastVisit: "28 Jun 2026" },
      { name: "Valentina Cruz", initials: "VC", lastVisit: "20 Jun 2026" },
      { name: "Diego Morales", initials: "DM", lastVisit: "12 Jun 2026" },
      { name: "Mariana Duarte", initials: "MD", lastVisit: "5 Jun 2026" },
      { name: "Paula Jiménez", initials: "PJ", lastVisit: "30 May 2026" },
    ],
    monthAppointments: [
      { date: "3 Ago", time: "09:00", patient: "Valentina Cruz", treatment: "Limpieza dental", status: "completed" },
      { date: "4 Ago", time: "10:30", patient: "Camilo Rueda", treatment: "Control", status: "completed" },
      { date: "5 Ago", time: "08:00", patient: "Laura Gómez", treatment: "Limpieza dental", status: "completed" },
      { date: "5 Ago", time: "11:00", patient: "Diego Morales", treatment: "Valoración general", status: "confirmed" },
      { date: "7 Ago", time: "09:00", patient: "Mariana Duarte", treatment: "Extracción", status: "pending" },
      { date: "10 Ago", time: "14:00", patient: "Esteban Correa", treatment: "Blanqueamiento", status: "pending" },
      { date: "14 Ago", time: "10:00", patient: "Paula Jiménez", treatment: "Resina", status: "pending" },
      { date: "20 Ago", time: "11:30", patient: "Sebastián Rojas", treatment: "Control ortodóncico", status: "pending" },
    ],
  },
  d2: {
    registrationNumber: "T.P. 51890",
    phone: "+57 301 456 7890",
    email: "julian.restrepo@odentia.com",
    mainRoom: "Consultorio 2",
    scheduleDays: ["L", "M", "X", "J", "V", "S"],
    scheduleStart: "9:00 AM",
    scheduleEnd: "6:00 PM",
    appointmentsToday: 5,
    patientsSeenToday: 2,
    activePatients: 96,
    appointmentsThisMonth: 37,
    patientsSeenTodayList: [
      { name: "Valentina Ríos", initials: "VR", lastVisit: "18 Jul 2026" },
      { name: "Santiago Nieto", initials: "SN", lastVisit: "10 Jul 2026" },
    ],
    todayAgenda: [
      { time: "08:30", patient: "Valentina Ríos", treatment: "Ajuste de brackets", status: "completed" },
      { time: "09:30", patient: "Santiago Nieto", treatment: "Control ortodóncico", status: "completed" },
      { time: "11:00", patient: "Camila Herrera", treatment: "Instalación de brackets", status: "confirmed", isNext: true },
      { time: "13:00", patient: "Felipe Cárdenas", treatment: "Retiro de brackets", status: "pending" },
      { time: "16:00", patient: "Isabella Cortés", treatment: "Valoración", status: "cancelled" },
    ],
    activePatientsList: [
      { name: "Valentina Ríos", initials: "VR", lastVisit: "18 Jul 2026" },
      { name: "Santiago Nieto", initials: "SN", lastVisit: "10 Jul 2026" },
      { name: "Camila Herrera", initials: "CH", lastVisit: "2 Jul 2026" },
      { name: "Felipe Cárdenas", initials: "FC", lastVisit: "25 Jun 2026" },
      { name: "Isabella Cortés", initials: "IC", lastVisit: "18 Jun 2026" },
      { name: "Juliana Poveda", initials: "JP", lastVisit: "10 Jun 2026" },
    ],
    monthAppointments: [
      { date: "3 Ago", time: "09:00", patient: "Isabella Cortés", treatment: "Valoración", status: "completed" },
      { date: "4 Ago", time: "11:00", patient: "Felipe Cárdenas", treatment: "Retiro de brackets", status: "completed" },
      { date: "5 Ago", time: "08:30", patient: "Valentina Ríos", treatment: "Ajuste de brackets", status: "completed" },
      { date: "5 Ago", time: "11:00", patient: "Camila Herrera", treatment: "Instalación de brackets", status: "confirmed" },
      { date: "8 Ago", time: "10:00", patient: "Santiago Nieto", treatment: "Control ortodóncico", status: "pending" },
      { date: "13 Ago", time: "09:30", patient: "Juliana Poveda", treatment: "Instalación de brackets", status: "pending" },
      { date: "18 Ago", time: "15:00", patient: "Andrés Salcedo", treatment: "Ajuste de brackets", status: "pending" },
    ],
  },
  d3: {
    registrationNumber: "T.P. 48765",
    phone: "+57 302 789 1234",
    email: "paula.escobar@odentia.com",
    mainRoom: "Consultorio 3",
    scheduleDays: ["M", "X", "J", "V", "S"],
    scheduleStart: "8:00 AM",
    scheduleEnd: "4:00 PM",
    appointmentsToday: 4,
    patientsSeenToday: 1,
    activePatients: 74,
    appointmentsThisMonth: 29,
    patientsSeenTodayList: [{ name: "Mateo Salazar", initials: "MS", lastVisit: "5 Jul 2026" }],
    todayAgenda: [
      { time: "08:00", patient: "Mateo Salazar", treatment: "Conducto radicular", status: "completed" },
      { time: "10:00", patient: "Daniela Ortiz", treatment: "Endodoncia", status: "confirmed", isNext: true },
      { time: "13:30", patient: "Nicolás Vega", treatment: "Retratamiento", status: "pending" },
      { time: "15:30", patient: "Gabriela Muñoz", treatment: "Valoración", status: "cancelled" },
    ],
    activePatientsList: [
      { name: "Mateo Salazar", initials: "MS", lastVisit: "5 Jul 2026" },
      { name: "Daniela Ortiz", initials: "DO", lastVisit: "28 Jun 2026" },
      { name: "Nicolás Vega", initials: "NV", lastVisit: "20 Jun 2026" },
      { name: "Gabriela Muñoz", initials: "GM", lastVisit: "12 Jun 2026" },
    ],
    monthAppointments: [
      { date: "3 Ago", time: "09:00", patient: "Nicolás Vega", treatment: "Retratamiento", status: "completed" },
      { date: "5 Ago", time: "08:00", patient: "Mateo Salazar", treatment: "Conducto radicular", status: "completed" },
      { date: "5 Ago", time: "10:00", patient: "Daniela Ortiz", treatment: "Endodoncia", status: "confirmed" },
      { date: "11 Ago", time: "13:00", patient: "Gabriela Muñoz", treatment: "Valoración", status: "pending" },
      { date: "19 Ago", time: "09:00", patient: "Camilo Vargas", treatment: "Endodoncia", status: "pending" },
    ],
  },
};

const DEFAULT_DENTIST_PROFILE_MOCK: DentistProfileMock = {
  registrationNumber: "T.P. 00000",
  phone: "+57 300 000 0000",
  email: "contacto@odentia.com",
  mainRoom: "Consultorio 1",
  scheduleDays: ["L", "M", "X", "J", "V"],
  scheduleStart: "8:00 AM",
  scheduleEnd: "5:00 PM",
  appointmentsToday: 0,
  patientsSeenToday: 0,
  activePatients: 0,
  appointmentsThisMonth: 0,
  patientsSeenTodayList: [],
  todayAgenda: [],
  activePatientsList: [],
  monthAppointments: [],
};

// Matches the pencil-trigger convention already used in
// appointment-detail-modal.tsx's inline field editors.
function FieldPencilButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="text-muted-foreground/50 hover:text-primary">
      <PencilIcon className="size-3" />
    </button>
  );
}

function EditableProfileRow({
  label,
  value,
  editable,
  isEditing,
  draftValue,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
  variant = "stacked",
}: {
  label: string;
  value: string;
  editable: boolean;
  isEditing: boolean;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  // "stacked" (default): value as the primary line, small gray label
  // underneath — the credential-style list below the badge header.
  // "heading"/"subheading": Nombre/Especialidad inside that badge header
  // instead — centered, no <dt>/<dd> since they don't sit inside a <dl>.
  variant?: "stacked" | "heading" | "subheading";
}) {
  const centered = variant !== "stacked";

  if (isEditing) {
    return (
      <div className={`flex flex-col gap-1.5 ${centered ? "items-center text-center" : ""}`}>
        <span className="text-[11px] text-label-foreground">{label}</span>
        <input
          autoFocus
          value={draftValue}
          onChange={(e) => onDraftChange(e.target.value)}
          className={`${FIELD_CLASS} ${centered ? "text-center" : ""}`}
        />
        <div className={`flex gap-1.5 ${centered ? "justify-center" : "justify-end"}`}>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-foreground/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Guardar
          </button>
        </div>
      </div>
    );
  }

  if (variant === "heading") {
    return (
      <div className="flex items-center justify-center gap-1.5">
        <p className="text-lg leading-tight font-semibold break-words">{value}</p>
        {editable && <FieldPencilButton label={`Editar ${label}`} onClick={onStartEdit} />}
      </div>
    );
  }

  if (variant === "subheading") {
    return (
      <div className="flex items-center justify-center gap-1.5">
        <p className="text-sm text-muted-foreground">{value}</p>
        {editable && <FieldPencilButton label={`Editar ${label}`} onClick={onStartEdit} />}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <dd className="text-sm font-medium break-words">{value}</dd>
        <dt className="mt-0.5 text-[11px] text-label-foreground">{label}</dt>
      </div>
      {editable && (
        <span className="shrink-0">
          <FieldPencilButton label={`Editar ${label}`} onClick={onStartEdit} />
        </span>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  selected,
  onSelect,
}: {
  label: string;
  value: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col items-center rounded-lg border px-3 py-2.5 text-center transition-colors ${
        selected
          ? "border-primary/40 bg-primary/10"
          : "border-border hover:border-primary/30 hover:bg-primary/[0.03]"
      }`}
    >
      <p className={`text-2xl font-bold tracking-tight ${selected ? "text-primary" : ""}`}>{value}</p>
      <p
        className={`mt-1 truncate text-[10px] leading-tight font-medium ${selected ? "text-primary" : "text-label-foreground"}`}
      >
        {label}
      </p>
    </button>
  );
}

function EmptyDetailState({ message }: { message: string }) {
  return (
    <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
      {message}
    </p>
  );
}

function SeenPatientRow({ patient }: { patient: SeenPatient }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
        {patient.initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{patient.name}</span>
        <span className="block truncate text-xs text-muted-foreground">Última visita: {patient.lastVisit}</span>
      </span>
    </li>
  );
}

function MonthAppointmentRow({ item }: { item: MonthAppointmentItem }) {
  return (
    <li className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {item.date} · {item.time} · {item.patient}
        </p>
        <p className="truncate text-xs text-muted-foreground">{item.treatment}</p>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[item.status]}`}
      >
        {STATUS_LABELS[item.status]}
      </span>
    </li>
  );
}

function TodayAgendaRow({ item }: { item: TodayAgendaItem }) {
  return (
    <li
      className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
        item.isNext
          ? "border-primary/40 bg-primary/[0.07] shadow-sm"
          : item.status === "cancelled"
            ? "border-border opacity-60"
            : "border-border"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-medium">
            {item.time} · {item.patient}
          </p>
          {item.isNext && (
            <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground">
              Próxima
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{item.treatment}</p>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[item.status]}`}
      >
        {STATUS_LABELS[item.status]}
      </span>
    </li>
  );
}

type EditableFieldKey = "name" | "specialty" | "registrationNumber" | "phone" | "email" | "mainRoom";
type KpiDetailKey = "citas-hoy" | "pacientes-atendidos" | "pacientes-activos" | "citas-mes";

const KPI_HEADINGS: Record<KpiDetailKey, string> = {
  "citas-hoy": "Agenda del día",
  "pacientes-atendidos": "Pacientes atendidos hoy",
  "pacientes-activos": "Pacientes activos",
  "citas-mes": "Citas este mes",
};

// Exported so the shell Header can open this exact same modal for the
// authenticated dentist's own profile (see header.tsx) instead of building
// a second one — same component, same behavior, just a different mount
// point reading/writing the same RoleContext-shared self-profile data.
export function DentistProfileModal({
  dentist,
  allAppointments,
  onClose,
  onDeactivate,
  onSelfProfileChange,
  initialProfile,
}: {
  dentist: Dentist;
  allAppointments: Appointment[];
  onClose: () => void;
  onDeactivate: () => void;
  // DEV TOOL — called with whichever of name/specialty/avatar_url changed
  // once the self-view edit flow saves, so every place this dentist is
  // rendered (Agenda board, filters, shell Header) reflects it for the
  // rest of the session — there's no real backend to persist to yet.
  onSelfProfileChange: (patch: { name?: string; specialty?: string; avatar_url?: string }) => void;
  // DEV TOOL — seeds registrationNumber/mainRoom/schedule when `dentist.id`
  // isn't one of DENTIST_PROFILE_MOCK's seeded entries (the Clinic Admin's
  // own synthetic professional profile, see header.tsx) so this shows what
  // they actually entered in "Configurar perfil profesional" instead of the
  // generic DEFAULT_DENTIST_PROFILE_MOCK placeholders.
  initialProfile?: {
    registrationNumber?: string;
    mainRoom?: string;
    scheduleDays?: string[];
    scheduleStart?: string;
    scheduleEnd?: string;
  };
}) {
  const { role, dentistId: currentDentistId } = useRole();
  // DEV TOOL — see src/dev/role.ts. Viewing/editing someone ELSE's record is
  // an admin-only action (always-visible pencils, deactivation). Viewing
  // your OWN record — a Dentist previewing
  // themselves, or a Clinic Admin who has also configured a "Perfil
  // profesional" for themselves (see ADMIN_DENTIST_ID) — always gets the
  // narrower self-service edit path below (editingProfile) instead, even
  // though the latter is still nominally "an admin".
  const isSelfView =
    (role === "dentist" && dentist.id === currentDentistId) ||
    (role === "clinic-admin" && dentist.id === ADMIN_DENTIST_ID);
  const isAdminView = role === "clinic-admin" && !isSelfView;
  // Discreet context line shown only for the Admin-as-professional case —
  // see the header chrome below.
  const isAdminActingAsProfessional = role === "clinic-admin" && dentist.id === ADMIN_DENTIST_ID;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const baseProfile =
    DENTIST_PROFILE_MOCK[dentist.id] ?? { ...DEFAULT_DENTIST_PROFILE_MOCK, ...initialProfile };
  const [profile, setProfile] = useState({
    ...baseProfile,
    name: dentist.name,
    specialty: dentist.specialty,
    status: "active" as DentistStatus,
    avatarUrl: dentist.avatar_url,
  });

  const [editingField, setEditingField] = useState<EditableFieldKey | null>(null);
  const [draftValue, setDraftValue] = useState("");
  // DEV TOOL — "Editar perfil" toggle for the self-view (Dentist editing
  // their own record): reuses the exact same EditableProfileRow pencils as
  // isAdminView, just gated behind an explicit "enter edit mode" tap
  // instead of always-visible.
  const [editingProfile, setEditingProfile] = useState(false);
  // DEV TOOL — the newly picked photo, previewed immediately but not
  // applied to `profile.avatarUrl` (and not reported via onAvatarChange)
  // until "Guardar foto"; "Cancelar" or exiting edit mode just discards it.
  const [photoDraft, setPhotoDraft] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingStatus, setEditingStatus] = useState(false);
  const [pendingDeactivation, setPendingDeactivation] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [draftDays, setDraftDays] = useState<string[]>([]);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [selectedKpi, setSelectedKpi] = useState<KpiDetailKey>("citas-hoy");

  const startEditing = (field: EditableFieldKey, currentValue: string) => {
    setEditingField(field);
    setDraftValue(currentValue);
  };

  const saveField = () => {
    if (!editingField) return;
    const trimmed = draftValue.trim();
    if (trimmed) {
      setProfile((prev) => ({ ...prev, [editingField]: trimmed }));
      // Only the two fields the shell Header also displays need to sync
      // there — and only when it's really the authenticated dentist
      // editing their own record, not an admin editing someone else's.
      if (isSelfView && editingField === "name") onSelfProfileChange({ name: trimmed });
      if (isSelfView && editingField === "specialty") onSelfProfileChange({ specialty: trimmed });
    }
    setEditingField(null);
  };

  const cancelEditing = () => setEditingField(null);

  const handlePhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPhotoDraft(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const savePhotoChange = () => {
    if (!photoDraft) return;
    setProfile((prev) => ({ ...prev, avatarUrl: photoDraft }));
    onSelfProfileChange({ avatar_url: photoDraft });
    setPhotoDraft(null);
  };

  const cancelPhotoChange = () => setPhotoDraft(null);

  // This prototype's mock data only models a single week — "citas futuras"
  // is approximated as this dentist's appointments that haven't already
  // completed or been cancelled (see PROJECT_STATUS.md's mock-data phase).
  const hasActiveUpcomingAppointments = allAppointments.some(
    (a) =>
      a.dentistId === dentist.id &&
      (a.status === "confirmed" || a.status === "pending" || a.status === "in-progress"),
  );

  const requestStatusChange = (next: DentistStatus) => {
    setEditingStatus(false);
    if (next === "inactive" && hasActiveUpcomingAppointments) {
      setPendingDeactivation(true);
      return;
    }
    setProfile((prev) => ({ ...prev, status: next }));
  };

  const confirmDeactivation = () => {
    setProfile((prev) => ({ ...prev, status: "inactive" }));
    onDeactivate();
    setPendingDeactivation(false);
  };

  const startEditingSchedule = () => {
    setDraftDays(profile.scheduleDays);
    setDraftStart(profile.scheduleStart);
    setDraftEnd(profile.scheduleEnd);
    setEditingSchedule(true);
  };

  const toggleDraftDay = (day: string) => {
    setDraftDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const saveSchedule = () => {
    setProfile((prev) => ({ ...prev, scheduleDays: draftDays, scheduleStart: draftStart, scheduleEnd: draftEnd }));
    setEditingSchedule(false);
  };

  const kpiTiles: { key: KpiDetailKey; label: string; value: string }[] = [
    { key: "citas-hoy", label: "Citas programadas hoy", value: String(profile.appointmentsToday) },
    { key: "pacientes-atendidos", label: "Pacientes atendidos hoy", value: String(profile.patientsSeenToday) },
    { key: "pacientes-activos", label: "Pacientes activos", value: String(profile.activePatients) },
    { key: "citas-mes", label: "Citas este mes", value: String(profile.appointmentsThisMonth) },
  ];


  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dentist.name}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[80vh] sm:w-full sm:max-w-2xl sm:rounded-xl md:max-w-4xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <div>
            <p className="text-sm font-semibold">Perfil del profesional</p>
            {isAdminActingAsProfessional && (
              <p className="text-[11px] text-muted-foreground">Administrador de Clínica · Profesional clínico</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto md:grid md:grid-cols-[1fr_1.15fr_1.15fr] md:overflow-hidden">
          {/* Left — Tarjeta de identidad profesional (credencial) */}
          <div className="border-b border-border p-5 md:min-h-0 md:overflow-y-auto md:border-r md:border-b-0">
            <div className="rounded-xl border border-border bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] p-4 shadow-sm">
              {/* Encabezado tipo credencial — siempre centrado, incluso en desktop. */}
              <div className="flex flex-col items-center gap-2 text-center">
              {isSelfView && editingProfile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Cambiar foto de perfil"
                  className="group relative rounded-full"
                >
                  <UserAvatar
                    name={dentist.name}
                    initials={dentist.initials}
                    avatar_url={photoDraft ?? profile.avatarUrl}
                    sizeClassName="size-20"
                  />
                  <span className="pointer-events-none absolute inset-0 rounded-full bg-foreground/0 transition-colors group-hover:bg-foreground/40" />
                  <span className="pointer-events-none absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                    <PencilIcon className="size-2.5" />
                  </span>
                </button>
              ) : (
                <UserAvatar
                  name={dentist.name}
                  initials={dentist.initials}
                  avatar_url={photoDraft ?? profile.avatarUrl}
                  sizeClassName="size-20"
                />
              )}

              {isSelfView && editingProfile && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              )}

              <EditableProfileRow
                variant="heading"
                label="Nombre"
                value={profile.name}
                editable={isAdminView || (isSelfView && editingProfile)}
                isEditing={editingField === "name"}
                draftValue={draftValue}
                onDraftChange={setDraftValue}
                onStartEdit={() => startEditing("name", profile.name)}
                onSave={saveField}
                onCancel={cancelEditing}
              />

              <EditableProfileRow
                variant="subheading"
                label="Especialidad"
                value={profile.specialty}
                editable={isAdminView || (isSelfView && editingProfile)}
                isEditing={editingField === "specialty"}
                draftValue={draftValue}
                onDraftChange={setDraftValue}
                onStartEdit={() => startEditing("specialty", profile.specialty)}
                onSave={saveField}
                onCancel={cancelEditing}
              />

              {isAdminView ? (
                editingStatus ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => requestStatusChange("active")}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        profile.status === "active"
                          ? "border-primary/25 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-foreground/5"
                      }`}
                    >
                      Activo
                    </button>
                    <button
                      type="button"
                      onClick={() => requestStatusChange("inactive")}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        profile.status === "inactive"
                          ? "border-danger/25 bg-danger/10 text-danger"
                          : "border-border text-muted-foreground hover:bg-foreground/5"
                      }`}
                    >
                      Inactivo
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingStatus(true)}
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      profile.status === "active"
                        ? "border-primary/25 bg-primary/10 text-primary hover:bg-primary/15"
                        : "border-danger/25 bg-danger/10 text-danger hover:bg-danger/15"
                    }`}
                  >
                    {profile.status === "active" ? "Activo" : "Inactivo"}
                    <PencilIcon className="size-3" />
                  </button>
                )
              ) : (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    profile.status === "active"
                      ? "border-primary/25 bg-primary/10 text-primary"
                      : "border-danger/25 bg-danger/10 text-danger"
                  }`}
                >
                  {profile.status === "active" ? "Activo" : "Inactivo"}
                </span>
              )}

              {isSelfView && !editingProfile && (
                <button
                  type="button"
                  onClick={() => setEditingProfile(true)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Editar perfil
                </button>
              )}
            </div>

            {pendingDeactivation && (
              <div className="mt-3 rounded-lg border border-warning/25 bg-warning/10 p-3 text-xs text-warning">
                <p className="font-medium">Este profesional tiene citas activas próximas.</p>
                <p className="mt-1">Al inactivarlo, esas citas se cancelarán automáticamente.</p>
                <div className="mt-2.5 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPendingDeactivation(false)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-warning/80 hover:bg-warning/15"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeactivation}
                    className="rounded-lg bg-warning px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    Inactivar y cancelar citas
                  </button>
                </div>
              </div>
            )}

            {/* Separación visual sutil entre el gafete y los datos profesionales. */}
            <div className="mt-5 border-t border-border" />

            <dl
              className={`mt-5 flex flex-col gap-4 text-sm ${
                isSelfView && editingProfile ? "rounded-lg border border-primary/15 bg-primary/[0.03] p-3" : ""
              }`}
            >
              <EditableProfileRow
                label="Registro profesional"
                value={profile.registrationNumber}
                editable={isAdminView || (isSelfView && editingProfile)}
                isEditing={editingField === "registrationNumber"}
                draftValue={draftValue}
                onDraftChange={setDraftValue}
                onStartEdit={() => startEditing("registrationNumber", profile.registrationNumber)}
                onSave={saveField}
                onCancel={cancelEditing}
              />
              <div>
                <EditableProfileRow
                  label="Teléfono"
                  value={profile.phone}
                  editable={isAdminView || (isSelfView && editingProfile)}
                  isEditing={editingField === "phone"}
                  draftValue={draftValue}
                  onDraftChange={setDraftValue}
                  onStartEdit={() => startEditing("phone", profile.phone)}
                  onSave={saveField}
                  onCancel={cancelEditing}
                />
                {/* Compact contact action, right next to the phone it uses —
                    always this professional's own number, whoever's viewing. */}
                {editingField !== "phone" && profile.phone && (
                  <a
                    href={`https://wa.me/${profile.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <PhoneIcon className="size-3" />
                    WhatsApp
                  </a>
                )}
              </div>
              <EditableProfileRow
                label="Correo electrónico"
                value={profile.email}
                editable={isAdminView || (isSelfView && editingProfile)}
                isEditing={editingField === "email"}
                draftValue={draftValue}
                onDraftChange={setDraftValue}
                onStartEdit={() => startEditing("email", profile.email)}
                onSave={saveField}
                onCancel={cancelEditing}
              />
              <EditableProfileRow
                label="Consultorio principal"
                value={profile.mainRoom}
                editable={isAdminView || (isSelfView && editingProfile)}
                isEditing={editingField === "mainRoom"}
                draftValue={draftValue}
                onDraftChange={setDraftValue}
                onStartEdit={() => startEditing("mainRoom", profile.mainRoom)}
                onSave={saveField}
                onCancel={cancelEditing}
              />
            </dl>

            {isSelfView && editingProfile && (
              <div className="mt-4 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    cancelPhotoChange();
                    setEditingProfile(false);
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    savePhotoChange();
                    setEditingProfile(false);
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  Guardar cambios
                </button>
              </div>
            )}
            </div>
          </div>

          {/* Center — Disponibilidad y métricas */}
          <div className="border-b border-border p-5 md:min-h-0 md:overflow-y-auto md:border-r md:border-b-0">
            <h3 className="text-sm font-semibold">Disponibilidad</h3>
            <div className="mt-3">
              {editingSchedule ? (
                <div className="flex flex-col gap-2.5 text-sm">
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_ORDER.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDraftDay(day)}
                        className={`flex size-7 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                          draftDays.includes(day)
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-foreground/5"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={draftStart} onChange={(e) => setDraftStart(e.target.value)} className={FIELD_CLASS}>
                      {SCHEDULE_TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <span className="text-muted-foreground">-</span>
                    <select value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} className={FIELD_CLASS}>
                      {SCHEDULE_TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingSchedule(false)}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-foreground/5"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={saveSchedule}
                      className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-label-foreground">Horario de atención</dt>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <dd className="truncate font-medium">
                      {formatScheduleLabel(profile.scheduleDays, profile.scheduleStart, profile.scheduleEnd)}
                    </dd>
                    {(isAdminView || isSelfView) && (
                      <FieldPencilButton label="Editar horario de atención" onClick={startEditingSchedule} />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {kpiTiles.map((tile) => (
                <MiniStat
                  key={tile.key}
                  label={tile.label}
                  value={tile.value}
                  selected={selectedKpi === tile.key}
                  onSelect={() => setSelectedKpi(tile.key)}
                />
              ))}
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold">Pacientes atendidos hoy</h3>
              {profile.patientsSeenTodayList.length === 0 ? (
                <EmptyDetailState message="Aún no hay pacientes atendidos hoy." />
              ) : (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {profile.patientsSeenTodayList.map((patient) => (
                    <SeenPatientRow key={patient.name} patient={patient} />
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Right — detalle del KPI seleccionado */}
          <div className="p-5 md:min-h-0 md:overflow-y-auto">
            <h3 className="text-sm font-semibold">{KPI_HEADINGS[selectedKpi]}</h3>

            {selectedKpi === "citas-hoy" &&
              (profile.todayAgenda.length === 0 ? (
                <EmptyDetailState message="No hay citas programadas para hoy." />
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {profile.todayAgenda.map((item) => (
                    <TodayAgendaRow key={`${item.time}-${item.patient}`} item={item} />
                  ))}
                </ul>
              ))}

            {selectedKpi === "pacientes-atendidos" &&
              (profile.patientsSeenTodayList.length === 0 ? (
                <EmptyDetailState message="Aún no hay pacientes atendidos hoy." />
              ) : (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {profile.patientsSeenTodayList.map((patient) => (
                    <SeenPatientRow key={patient.name} patient={patient} />
                  ))}
                </ul>
              ))}

            {selectedKpi === "pacientes-activos" &&
              (profile.activePatientsList.length === 0 ? (
                <EmptyDetailState message="Sin pacientes activos registrados." />
              ) : (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {profile.activePatientsList.map((patient) => (
                    <SeenPatientRow key={patient.name} patient={patient} />
                  ))}
                </ul>
              ))}

            {selectedKpi === "citas-mes" &&
              (profile.monthAppointments.length === 0 ? (
                <EmptyDetailState message="Sin citas registradas este mes." />
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {profile.monthAppointments.map((item) => (
                    <MonthAppointmentRow key={`${item.date}-${item.time}-${item.patient}`} item={item} />
                  ))}
                </ul>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
