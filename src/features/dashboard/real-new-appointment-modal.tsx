"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Combobox } from "@/components/combobox";
import { useToast } from "@/components/toast";
import { UserAvatar } from "@/components/user-avatar";
import { CalendarIcon, ClockIcon, CloseIcon, FlagIcon, MapPinIcon, NoteIcon } from "@/components/shell/icons";
import { FIELD_CLASS, PopoverFieldRow, TimePopoverContent } from "./form-primitives";
import { isPastSlot, slotStartIso } from "./real-format";
import { DEFAULT_APPOINTMENT_DURATION } from "./schedule-config";
import { hasAvailableFutureSlotForDay, isoWeekdayOfDayKey, resolveAgendaSlotsForDay, type AgendaAvailabilityBlock } from "./agenda-hours";
import { WeekDayPickerContent } from "./real-week-day-picker";
import type { WeekDay } from "./real-week";
import type { Patient } from "@/features/patients/data";
import type { MembershipRole } from "@/features/session/types";
import type { Appointment } from "./appointments-data";
import { createAppointment } from "./appointments-actions";

// Real "Nueva cita" modal — port of the approved demo's new-appointment-modal.tsx
// (never edited: it's still used by the mock Patient Portal/clinical-encounter
// flow). Same modal chrome/field layout/classNames; the data layer underneath
// is entirely real:
//   - Paciente is a REAL search over the clinic's patients table (no free-text
//     "type any name" — the mock's own patient list was itself only derived
//     from past mock appointment names, never a real patient search).
//   - Profesional comes from real active clinical professionals
//     (professional_profiles), not the static DENTISTS mock array.
//   - Fecha does NOT reuse appointment-detail-modal.tsx's CalendarPopoverContent:
//     that component's month grid is hardcoded to a fixed demo reference month
//     (REFERENCE_MONTH) and can only ever resolve dates against exactly the one
//     mock week it was built for — incompatible with real, arbitrary calendar
//     dates. Since that file must never be edited (shared with still-mock
//     screens), Fecha here is a simple list of the currently-viewed real week's
//     7 days instead (WeekDayPickerContent below) — same restriction the mock
//     already had in practice (you can only create an appointment within the
//     week currently on screen), just without a broken calendar grid.
export type ProfessionalPickerState = "picker" | "empty-can-configure" | "empty-cannot-configure";

// Pure so the exact branching this checkpoint closes ("0 active clinical
// professionals" vs. "search found nothing," and "can this role configure
// one" vs. not) is unit-testable without rendering this modal — same
// convention as every other pure decision function in this feature (e.g.
// resumen-tab.tsx's own exported helpers). `professionalsCount` is the
// RAW roster size (before any Combobox search filter is ever applied) —
// a real, non-empty roster with zero search matches must stay the
// Combobox's own generic "Sin resultados," never this notice; only ever
// called with `professionals.length`, never a filtered count.
export function resolveProfessionalPickerState(professionalsCount: number, role: MembershipRole): ProfessionalPickerState {
  if (professionalsCount > 0) return "picker";
  return role === "clinic_admin" ? "empty-can-configure" : "empty-cannot-configure";
}

export type BoardProfessional = {
  professionalProfileId: string;
  name: string;
  initials: string;
  specialty: string;
  avatarUrl: string | null;
  defaultAppointmentDurationMinutes: number | null;
};

type PatientOption = { id: string; name: string; initials: string; secondary: string | null };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function toPatientOption(patient: Patient): PatientOption {
  const name = `${patient.firstName} ${patient.lastName}`.trim();
  return { id: patient.id, name, initials: initialsOf(name), secondary: patient.phone ?? patient.documentId };
}

export function RealNewAppointmentModal({
  clinicId,
  role,
  patients,
  professionals,
  lockedProfessional,
  weekDays,
  treatmentOptions,
  roomOptions,
  availability = [],
  prefill,
  onClose,
  onCreated,
}: {
  clinicId: string;
  // Only used to decide the Profesional field's empty-state copy/CTA below
  // (0 active clinical professionals) — never a second authorization
  // check. create_my_professional_profile() (see CLAUDE.md's Clinic Admin
  // section) is clinic_admin-only, so that's the exact same condition
  // gating the CTA here.
  role: MembershipRole;
  patients: Patient[];
  professionals: BoardProfessional[];
  lockedProfessional: BoardProfessional | null;
  weekDays: WeekDay[];
  treatmentOptions: string[];
  roomOptions: string[];
  // Optional — defaults to [] (agenda-hours.ts's zero-rows Case A then
  // applies INITIAL_PROFESSIONAL_SCHEDULE). Every live caller
  // (real-appointments-board.tsx) passes the clinic's real
  // professional_availability rows — see agenda-hours.ts.
  availability?: AgendaAvailabilityBlock[];
  prefill?: { professionalProfileId?: string; dayKey?: string; time?: string; patientId?: string; reason?: string } | null;
  onClose: () => void;
  onCreated: (created: Appointment) => void;
}) {
  const { showToast } = useToast();
  const patientOptions = patients.map(toPatientOption);

  const [patientId, setPatientId] = useState(prefill?.patientId ?? "");
  const [professionalId, setProfessionalId] = useState(lockedProfessional?.professionalProfileId ?? prefill?.professionalProfileId ?? "");
  const [dayKey, setDayKey] = useState(prefill?.dayKey ?? "");
  const [time, setTime] = useState(prefill?.time ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    lockedProfessional?.defaultAppointmentDurationMinutes ?? DEFAULT_APPOINTMENT_DURATION,
  );
  const [durationTouched, setDurationTouched] = useState(false);
  const [room, setRoom] = useState("");
  const [reason, setReason] = useState(prefill?.reason ?? "");
  const [notes, setNotes] = useState("");
  const [editingField, setEditingField] = useState<"date" | "time" | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleared the moment the user actively edits that specific field — matches
  // the approved demo's own new-appointment-modal.tsx: a value pre-filled
  // from clicking an empty calendar slot (professionalProfileId/dayKey/time)
  // stays highlighted in the primary color until the user changes it.
  const [professionalFromCalendar, setProfessionalFromCalendar] = useState(Boolean(prefill?.professionalProfileId));
  const [dateFromCalendar, setDateFromCalendar] = useState(Boolean(prefill?.dayKey));
  const [timeFromCalendar, setTimeFromCalendar] = useState(Boolean(prefill?.time));

  const selectedPatient = patientOptions.find((p) => p.id === patientId) ?? null;
  const selectedProfessional = professionals.find((p) => p.professionalProfileId === professionalId) ?? null;
  const professionalPickerState = resolveProfessionalPickerState(professionals.length, role);

  const dayEntry = weekDays.find((d) => d.key === dayKey);
  const dayLabel = dayEntry ? `${dayEntry.label}, ${dayEntry.dateLabel}` : "Selecciona una fecha";
  const timeLabel = time ? `${time} (${durationMinutes} min)` : "Selecciona un horario";

  // Real availability for whichever professional is currently selected —
  // before one is chosen, falls back to the union of every professional
  // shown here (same policy real-appointments-board.tsx's own grid
  // uses), so Fecha/Horario aren't empty before a Profesional pick.
  const relevantProfessionalIds = professionalId ? [professionalId] : professionals.map((p) => p.professionalProfileId);
  const timeSlotsForSelectedDay = dayKey
    ? resolveAgendaSlotsForDay({ dayOfWeek: isoWeekdayOfDayKey(dayKey), professionalProfileIds: relevantProfessionalIds, availability })
    : [];
  const isDaySelectable = (candidateDayKey: string) =>
    hasAvailableFutureSlotForDay({
      dayKey: candidateDayKey,
      dayOfWeek: isoWeekdayOfDayKey(candidateDayKey),
      professionalProfileIds: relevantProfessionalIds,
      availability,
    });

  // isPastSlot re-checked here too, not just as TimePopoverContent's
  // isSlotDisabled — Fecha and Horario are edited independently (each its
  // own popover), so a time picked while a later Fecha was selected can be
  // stale and past once the user changes Fecha back to an earlier day
  // without reopening Horario. This is the same centralized check, just
  // applied to the final dayKey+time pair right before it can be created.
  const staleTime = Boolean(dayKey && time) && isPastSlot(dayKey, time);
  const canCreate = Boolean(patientId && professionalId && dayKey && time) && !staleTime && !creating;

  const handleSelectProfessional = (professional: BoardProfessional) => {
    setProfessionalId(professional.professionalProfileId);
    setProfessionalFromCalendar(false);
    if (!durationTouched) {
      setDurationMinutes(professional.defaultAppointmentDurationMinutes ?? DEFAULT_APPOINTMENT_DURATION);
    }
  };

  const handleCreate = async () => {
    if (!canCreate || !selectedPatient) return;
    setCreating(true);
    setError(null);
    const patient = patients.find((p) => p.id === patientId) ?? null;
    const outcome = await createAppointment({
      clinicId,
      patientId,
      patientName: selectedPatient.name,
      patientPhone: patient?.phone ?? null,
      professionalProfileId: professionalId,
      startsAt: slotStartIso(dayKey, time),
      durationMinutes,
      reason: reason || null,
      room: room || null,
      contactPhone: patient?.phone ?? null,
      notes: notes || null,
    });
    setCreating(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    // Modal only ever closes on a confirmed backend success (never
    // optimistically) — the toast fires in that same instant so the user
    // never has to wonder whether the appointment actually saved.
    showToast(`Cita creada correctamente — ${selectedPatient.name} · ${dayLabel} · ${time}`);
    onCreated(outcome.appointment);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nueva cita"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Nueva cita</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3.5">
          <div className="sm:grid sm:grid-cols-[220px_1fr] sm:gap-5">
            {/* Personas */}
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-semibold tracking-wide text-label-foreground uppercase">Personas</p>

              <div>
                <label className="text-[11px] text-label-foreground">Paciente</label>
                <div className="mt-1">
                  <Combobox
                    items={patientOptions}
                    getKey={(patient) => patient.id}
                    getSearchText={(patient) => patient.name}
                    selectedItem={selectedPatient}
                    onSelect={(patient) => setPatientId(patient.id)}
                    placeholder="Buscar paciente…"
                    emptyText="Sin resultados"
                    renderItem={(patient) => (
                      <>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          {patient.initials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{patient.name}</span>
                          {patient.secondary && (
                            <span className="block truncate text-xs text-muted-foreground">{patient.secondary}</span>
                          )}
                        </span>
                      </>
                    )}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-label-foreground">Profesional</label>
                <div className="mt-1">
                  {professionalPickerState !== "picker" ? (
                    <NoProfessionalsNotice canConfigureOwnProfile={professionalPickerState === "empty-can-configure"} />
                  ) : lockedProfessional ? (
                    <div className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
                      <UserAvatar
                        name={lockedProfessional.name}
                        initials={lockedProfessional.initials}
                        avatar_url={lockedProfessional.avatarUrl ?? undefined}
                        sizeClassName="size-8"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{lockedProfessional.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{lockedProfessional.specialty}</span>
                      </span>
                    </div>
                  ) : (
                    <Combobox
                      items={professionals}
                      getKey={(professional) => professional.professionalProfileId}
                      getSearchText={(professional) => `${professional.name} ${professional.specialty}`}
                      selectedItem={selectedProfessional}
                      onSelect={handleSelectProfessional}
                      placeholder="Buscar profesional…"
                      emptyText="Sin resultados"
                      renderItem={(professional, isCard) => (
                        <>
                          <UserAvatar
                            name={professional.name}
                            initials={professional.initials}
                            avatar_url={professional.avatarUrl ?? undefined}
                            sizeClassName="size-8"
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-sm font-medium ${
                                isCard && professionalFromCalendar ? "text-primary" : ""
                              }`}
                            >
                              {professional.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">{professional.specialty}</span>
                          </span>
                        </>
                      )}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Cita */}
            <div className="mt-4 flex flex-col gap-2.5 sm:mt-0">
              <p className="text-[11px] font-semibold tracking-wide text-label-foreground uppercase">Cita</p>

              <PopoverFieldRow
                icon={ClockIcon}
                triggerIcon={CalendarIcon}
                label="Fecha"
                value={dayLabel}
                valueClassName={dateFromCalendar ? "text-primary" : ""}
                open={editingField === "date"}
                onToggle={() => setEditingField(editingField === "date" ? null : "date")}
                onClose={() => setEditingField(null)}
              >
                <WeekDayPickerContent
                  weekDays={weekDays}
                  currentDayKey={dayKey}
                  isDaySelectable={isDaySelectable}
                  onSelect={(key) => {
                    setDayKey(key);
                    setDateFromCalendar(false);
                    setEditingField(null);
                  }}
                />
              </PopoverFieldRow>

              <PopoverFieldRow
                icon={ClockIcon}
                triggerIcon={ClockIcon}
                label="Horario"
                value={timeLabel}
                valueClassName={timeFromCalendar ? "text-primary" : ""}
                open={editingField === "time"}
                onToggle={() => setEditingField(editingField === "time" ? null : "time")}
                onClose={() => setEditingField(null)}
              >
                <TimePopoverContent
                  time={time || timeSlotsForSelectedDay[0] || ""}
                  durationMinutes={durationMinutes}
                  slots={timeSlotsForSelectedDay}
                  isSlotDisabled={dayKey ? (slot) => isPastSlot(dayKey, slot) : undefined}
                  onSave={async (patch) => {
                    setTime(patch.time);
                    setDurationMinutes(patch.durationMinutes);
                    setDurationTouched(true);
                    setTimeFromCalendar(false);
                    setEditingField(null);
                  }}
                  onCancel={() => setEditingField(null)}
                />
              </PopoverFieldRow>

              <Field icon={MapPinIcon} label="Consultorio">
                <Combobox
                  items={roomOptions}
                  getKey={(option) => option}
                  getSearchText={(option) => option}
                  selectedItem={room || null}
                  onSelect={(option) => setRoom(option)}
                  placeholder="Buscar consultorio…"
                  emptyText="Sin resultados"
                  renderItem={(option) => (
                    <>
                      <MapPinIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-sm font-medium">{option}</span>
                    </>
                  )}
                />
              </Field>

              <Field icon={FlagIcon} label="Tratamiento propuesto">
                <select value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD_CLASS}>
                  <option value="">Sin definir</option>
                  {treatmentOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>

              <Field icon={NoteIcon} label="Observaciones">
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`${FIELD_CLASS} resize-none`}
                />
              </Field>

              {staleTime && !error && (
                <p className="text-xs text-danger">El horario elegido ya pasó para esta fecha. Ábrelo de nuevo y elige otro.</p>
              )}
              {error && <p className="text-xs text-danger">{error}</p>}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creando…" : "Crear cita"}
          </button>
        </div>
      </div>
    </div>
  );
}

// "0 active clinical professionals" — a genuinely empty roster, never a
// search-with-no-match (that stays the Combobox's own generic "Sin
// resultados", unaffected here since this branch only renders when
// `professionals` itself, before any query, is empty). Hits the flagship
// Primary Use Case (a solo Clinic-Admin-Dentist who hasn't self-configured
// yet — see CLAUDE.md's Domain Model) on her very first "Nueva cita."
// Never creates a placeholder professional_profile — Profesional simply
// stays unselected, so `canCreate` (already `Boolean(... && professionalId
// ...)`) keeps "Crear cita" disabled with no change needed here.
function NoProfessionalsNotice({ canConfigureOwnProfile }: { canConfigureOwnProfile: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-2.5">
      <p className="text-sm font-medium text-foreground">
        Aún no hay profesionales {canConfigureOwnProfile ? "configurados" : "disponibles"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {canConfigureOwnProfile
          ? "Para crear citas, primero configura tu perfil profesional o agrega un odontólogo a tu equipo."
          : "Un administrador de la clínica debe configurar o agregar un profesional antes de crear citas."}
      </p>
      {canConfigureOwnProfile && (
        <Link href="/clinica" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
          Configurar perfil profesional
        </Link>
      )}
    </div>
  );
}

function Field({ icon: Icon, label, children }: { icon: typeof ClockIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <label className="text-[11px] text-label-foreground">{label}</label>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}
