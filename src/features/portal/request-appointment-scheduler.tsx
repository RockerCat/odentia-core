"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircleIcon, ChevronIcon, CloseIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { AnchoredPopover } from "@/features/dashboard/form-primitives";
import { initialsOf, isPastSlot, slotStartIso } from "@/features/dashboard/real-format";
import { getWeekDaysForOffset, getWeekLabelForOffset } from "@/features/dashboard/real-week";
import { createClient } from "@/lib/supabase/client";
import type { PortalProfessional } from "./requests-data";
import {
  fetchMyProfessionalSchedule,
  isPortalDaySelectable,
  portalSlotsForDay,
  type PortalProfessionalSchedule,
} from "./schedule-data";

export type SchedulerSubmitOutcome = { status: "ok" } | { status: "error"; message: string };

type ScheduleState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; schedule: PortalProfessionalSchedule };

// Real "Solicitar cita" — a faithful port of the approved Portal booking
// picker (the demo's NewAppointmentScheduler/AppointmentSlotFields:
// odontólogo dropdown → semana → día → horario → confirmación), with two
// deliberate, non-cosmetic corrections:
//
//  1. It creates a SOLICITUD, not a Cita. The demo's version inserted a
//     local mock appointment straight into the patient's own list. Per
//     CLAUDE.md's Appointment Lifecycle a Patient can never schedule
//     herself: this writes a `Pendiente` request the clinic then accepts or
//     rejects. Only the copy that made the old behavior look like a booking
//     changed ("Solicitar cita" / "Confirma tu solicitud"), never the
//     layout, hierarchy, spacing or components.
//
//  2. Days/slots come from the chosen professional's REAL schedule
//     (get_my_professional_schedule: her weekly blocks + absence dates —
//     no other patient's data) through the same agenda-hours.ts rules every
//     staff picker uses; it used to offer a fixed 08:00–18:00 grid every
//     day. Other patients' Citas stay invisible (a Patient must never read
//     them), so an offered slot is still a PREFERENCE: accepting the request
//     is where the clinic's full rule set (overlap, horario, ausencias) is
//     enforced, atomically.
//
// Shared by "Agendar nueva cita" and "Reprogramar cita" — the caller owns
// what submitting means (onSubmit), never a second copy of this picker.
//
// Past days/times are still disabled, from the same single source of truth
// every real Agenda picker uses (real-format.ts's hasAvailableFutureSlot/
// isPastSlot) — the backend rejects a past preference too
// (request_my_appointment), so this is UX, not the guarantee.
export function RequestAppointmentScheduler({
  professionals,
  onSubmit,
  initialProfessionalId,
  submitLabel = "Solicitar cita",
  skipConfirm = false,
}: {
  professionals: PortalProfessional[];
  // Resolves only on a confirmed backend result — never optimistic.
  onSubmit: (professionalProfileId: string, preferredStartsAtIso: string) => Promise<SchedulerSubmitOutcome>;
  initialProfessionalId?: string;
  submitLabel?: string;
  // The approved Reprogramar modal sends directly from its own CTA; the
  // new-request flow keeps its confirmation step.
  skipConfirm?: boolean;
}) {
  const [selectedProfessionalId, setSelectedProfessionalId] = useState(
    initialProfessionalId && professionals.some((p) => p.professionalProfileId === initialProfessionalId)
      ? initialProfessionalId
      : (professionals[0]?.professionalProfileId ?? ""),
  );
  const [scheduleState, setScheduleState] = useState<ScheduleState>({ status: "loading" });
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // The selected professional's real schedule — refetched whenever the
  // selection changes; loading/error are explicit, never a fallback grid.
  useEffect(() => {
    if (!selectedProfessionalId) return;
    let cancelled = false;
    fetchMyProfessionalSchedule(createClient(), selectedProfessionalId).then(
      (schedule) => {
        if (!cancelled) setScheduleState({ status: "ready", schedule });
      },
      () => {
        if (!cancelled) setScheduleState({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedProfessionalId]);

  const schedule = scheduleState.status === "ready" ? scheduleState.schedule : null;

  const weekDays = getWeekDaysForOffset(weekOffset);
  const weekLabel = getWeekLabelForOffset(weekOffset);
  const selectedProfessional = professionals.find((p) => p.professionalProfileId === selectedProfessionalId) ?? null;
  const selectedDayInfo = selectedDay ? weekDays.find((d) => d.key === selectedDay) : null;
  const staleTime = Boolean(selectedDay && selectedTime) && isPastSlot(selectedDay!, selectedTime!);
  const canSubmit = Boolean(schedule && selectedProfessionalId && selectedDay && selectedTime) && !staleTime && !submitting;
  const slotsForSelectedDay = schedule && selectedDay ? portalSlotsForDay(schedule, selectedDay) : [];
  const weekHasAvailability = schedule ? weekDays.some((d) => isPortalDaySelectable(schedule, d.key)) : false;

  if (professionals.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
        Tu clínica aún no tiene profesionales disponibles para agendar.
      </p>
    );
  }

  const changeWeek = (nextOffset: number) => {
    setWeekOffset(nextOffset);
    setSelectedDay(null);
    setSelectedTime(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !selectedDay || !selectedTime) return;
    setSubmitting(true);
    setError(null);
    const outcome = await onSubmit(selectedProfessionalId, slotStartIso(selectedDay, selectedTime));
    setSubmitting(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    // Closes only on a confirmed backend success — never optimistically.
    // The caller owns the toast/pending state from here.
    setShowConfirm(false);
  };

  return (
    <div className="md:mx-auto md:max-w-md">
      {/* Odontólogo — same enriched dropdown as the approved design,
          anchored overlay, real professionals from the patient's own
          clinic (get_my_clinic_professionals). */}
      <div className="relative mt-4">
        <p className="text-sm font-medium text-foreground">Odontólogo</p>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setDropdownOpen((open) => !open)}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
          className="mt-2 flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-2.5 text-left transition-colors hover:bg-foreground/[0.03]"
        >
          <UserAvatar
            name={selectedProfessional?.name ?? "Sin asignar"}
            initials={initialsOf(selectedProfessional?.name ?? "?")}
            avatar_url={selectedProfessional?.avatarUrl ?? undefined}
            sizeClassName="size-10"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{selectedProfessional?.name ?? "Sin asignar"}</p>
            {selectedProfessional?.specialty && (
              <p className="truncate text-xs text-muted-foreground">{selectedProfessional.specialty}</p>
            )}
          </div>
          <ChevronIcon
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-90" : "-rotate-90"}`}
          />
        </button>

        <AnchoredPopover
          open={dropdownOpen}
          anchorRef={triggerRef}
          onClose={() => setDropdownOpen(false)}
          widthClass="w-72"
        >
          <div role="listbox" className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {professionals.map((professional) => {
              const active = professional.professionalProfileId === selectedProfessionalId;
              return (
                <button
                  key={professional.professionalProfileId}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    if (professional.professionalProfileId !== selectedProfessionalId) {
                      setScheduleState({ status: "loading" });
                      setSelectedDay(null);
                      setSelectedTime(null);
                    }
                    setSelectedProfessionalId(professional.professionalProfileId);
                    setDropdownOpen(false);
                  }}
                  className={`flex items-center gap-2.5 rounded-lg p-2 text-left transition-colors ${
                    active ? "bg-primary/10" : "hover:bg-foreground/5"
                  }`}
                >
                  <UserAvatar
                    name={professional.name}
                    initials={initialsOf(professional.name)}
                    avatar_url={professional.avatarUrl ?? undefined}
                    sizeClassName="size-9"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{professional.name}</p>
                    {professional.specialty && <p className="truncate text-xs text-muted-foreground">{professional.specialty}</p>}
                  </div>
                  {active && <CheckCircleIcon className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </AnchoredPopover>
      </div>

      {/* Navegación semanal + selector de días — same pattern/visual
          language as the approved design, on real calendar dates
          (real-week.ts) instead of the demo's frozen reference week. */}
      <div className="mt-4 flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => changeWeek(weekOffset - 1)}
          aria-label="Semana anterior"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5"
        >
          <ChevronIcon className="size-4" />
        </button>
        <span className="min-w-0 px-1 text-center text-sm font-semibold tracking-tight">{weekLabel}</span>
        <button
          type="button"
          onClick={() => changeWeek(weekOffset + 1)}
          aria-label="Semana siguiente"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5"
        >
          <ChevronIcon className="size-4 rotate-180" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {weekDays.map((day) => {
          const active = day.key === selectedDay;
          const past = !schedule || !isPortalDaySelectable(schedule, day.key);
          return (
            <button
              key={day.key}
              type="button"
              disabled={past}
              aria-disabled={past}
              onClick={() => {
                setSelectedDay(day.key);
                setSelectedTime(null);
              }}
              className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-colors ${
                scheduleState.status === "loading" ? "animate-pulse " : ""
              }${
                past
                  ? "cursor-not-allowed border-border/60 text-muted-foreground/30"
                  : active
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-foreground/[0.03]"
              }`}
            >
              <span
                className={`text-[10px] font-medium tracking-wide uppercase ${
                  past ? "" : active ? "text-primary" : "text-label-foreground"
                }`}
              >
                {day.shortLabel}
              </span>
              <span className={`text-sm font-semibold ${!past && active ? "text-primary" : ""}`}>{day.dateNumber}</span>
            </button>
          );
        })}
      </div>

      {scheduleState.status === "error" && (
        <p className="mt-3 text-center text-xs text-danger">No pudimos cargar el horario de este profesional. Intenta de nuevo.</p>
      )}
      {schedule && !weekHasAvailability && (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
          Este profesional no tiene horarios disponibles esta semana. Prueba con otra semana u otro profesional.
        </p>
      )}

      {selectedDay && schedule && (
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">Horario preferido — {selectedDayInfo?.label}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {slotsForSelectedDay.map((slot) => {
              const past = isPastSlot(selectedDay, slot);
              const active = selectedTime === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={past}
                  onClick={() => setSelectedTime(slot)}
                  className={`rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors ${
                    past
                      ? "cursor-not-allowed border-border/60 text-muted-foreground/40 opacity-40"
                      : active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground/80 hover:border-primary/40 hover:bg-primary/5"
                  }`}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Elige el horario que prefieras. La clínica revisará tu solicitud y confirmará la cita.
      </p>

      {error && <p className="mt-2 text-center text-xs text-danger">{error}</p>}

      <button
        type="button"
        onClick={() => {
          setError(null);
          if (skipConfirm) void handleSubmit();
          else setShowConfirm(true);
        }}
        disabled={!canSubmit}
        className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {skipConfirm && submitting ? "Enviando…" : submitLabel}
      </button>

      {showConfirm && selectedProfessional && selectedDayInfo && selectedTime && (
        <ConfirmRequestModal
          professional={selectedProfessional}
          dayLabel={`${selectedDayInfo.label}, ${selectedDayInfo.dateLabel}`}
          time={selectedTime}
          submitting={submitting}
          error={error}
          onClose={() => setShowConfirm(false)}
          onConfirm={handleSubmit}
        />
      )}
    </div>
  );
}

// Same confirmation step the approved design already had before booking
// (ConfirmNewAppointmentModal) — same chrome, same summary block, same
// two-button footer. Only the copy tells the truth about what is being
// created: a solicitud, not a cita.
function ConfirmRequestModal({
  professional,
  dayLabel,
  time,
  submitting,
  error,
  onClose,
  onConfirm,
}: {
  professional: PortalProfessional;
  dayLabel: string;
  time: string;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirma tu solicitud"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Confirma tu solicitud</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <UserAvatar
              name={professional.name}
              initials={initialsOf(professional.name)}
              avatar_url={professional.avatarUrl ?? undefined}
              sizeClassName="size-12"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{professional.name}</p>
              {professional.specialty && <p className="truncate text-xs text-muted-foreground">{professional.specialty}</p>}
            </div>
          </div>

          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-label-foreground">Fecha preferida</dt>
              <dd className="font-medium">{dayLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-label-foreground">Hora preferida</dt>
              <dd className="font-medium">{time}</dd>
            </div>
          </dl>

          <p className="mt-4 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
            Esto envía una solicitud, no reserva la cita. La clínica la revisará y te confirmará la fecha definitiva.
          </p>

          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-40"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Enviando…" : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}
