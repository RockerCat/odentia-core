"use client"; // needed for day-selection state and the useRole() gate below.

import { useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { ChevronIcon, PlusIcon } from "@/components/shell/icons";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { firstName } from "@/lib/format";
import type { Appointment, AppointmentStatus, Dentist, WeekDay } from "./mock-data";
import { TIME_SLOTS } from "./schedule-config";

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  confirmed: "border-success/25 bg-success/10 text-success",
  pending: "border-warning/25 bg-warning/10 text-warning",
  "in-progress": "border-info/25 bg-info/10 text-info",
  cancelled: "border-danger/20 bg-danger/5 text-danger/70 opacity-70",
  completed: "border-border bg-foreground/[0.03] text-muted-foreground",
};

const LEGEND = [
  { label: "Libre", className: "border border-dashed border-border" },
  { label: "Confirmada", className: "bg-success" },
  { label: "Pendiente", className: "bg-warning" },
  { label: "En curso", className: "bg-info" },
  { label: "Cancelada", className: "bg-danger/60" },
];

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
  const { role } = useRole();
  // DEV TOOL — Superadmin doesn't do clinical scheduling (see CLAUDE.md Domain Model).
  const canCreateAppointments = process.env.NODE_ENV !== "development" || role !== "superadmin";

  const [selectedDay, setSelectedDay] = useState(
    weekDays.find((day) => day.isToday)?.key ?? weekDays[0]?.key,
  );

  const countForDay = (dayKey: string) => appointments.filter((a) => a.day === dayKey).length;
  const maxDayCount = Math.max(...weekDays.map((day) => countForDay(day.key)), 1);

  const dayAppointments = appointments.filter((a) => a.day === selectedDay);

  const sortedDentists = [...dentists].sort(
    (a, b) =>
      dayAppointments.filter((appt) => appt.dentistId === b.id).length -
      dayAppointments.filter((appt) => appt.dentistId === a.id).length,
  );

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="border-b border-border px-5 py-5">
        {/* Week navigation — UI only, no logic wired up yet. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Semana anterior"
              className="flex size-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5"
            >
              <ChevronIcon className="size-4" />
            </button>
            <span className="min-w-[11rem] px-1 text-center text-base font-semibold tracking-tight">
              {weekLabel}
            </span>
            <button
              type="button"
              aria-label="Semana siguiente"
              className="flex size-8 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5"
            >
              <ChevronIcon className="size-4 rotate-180" />
            </button>
            <button
              type="button"
              className="ml-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
            >
              Hoy
            </button>
          </div>

          {canCreateAppointments && (
            <button
              type="button"
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
          {weekDays.map((day) => {
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
                    active ? "text-primary" : "text-muted-foreground"
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

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {LEGEND.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`size-2.5 shrink-0 rounded-full ${item.className}`} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {/* Operations board — one card per dentist, single continuous slot
          grid. Cards wrap onto new rows instead of overflowing sideways;
          the page itself scrolls, nothing scrolls internally. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 p-5">
        {sortedDentists.map((dentist) => {
          const dentistAppointments = dayAppointments.filter((a) => a.dentistId === dentist.id);
          const occupied = dentistAppointments.length;

          return (
            <div key={dentist.id} className="min-w-0 rounded-lg border border-border">
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
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
              </div>

              <div className="grid grid-cols-3 gap-1.5 p-3">
                {TIME_SLOTS.map((slot) => {
                  const appointment = dentistAppointments.find((a) => a.time === slot);
                  if (!appointment) {
                    return (
                      <button
                        key={slot}
                        type="button"
                        className="flex h-12 flex-col items-center justify-center rounded-md border border-dashed border-border text-muted-foreground/70 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                      >
                        <span className="text-[10px] font-medium">{slot}</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={`flex h-12 flex-col items-center justify-center rounded-md border px-1 text-center ${STATUS_STYLES[appointment.status]}`}
                    >
                      <span className="text-[9px] font-medium opacity-80">{slot}</span>
                      <span className="max-w-full truncate text-[11px] font-semibold">
                        {firstName(appointment.patientName)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
