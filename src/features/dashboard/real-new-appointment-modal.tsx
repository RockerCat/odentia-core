"use client";

import { useState, type ReactNode } from "react";
import { Combobox } from "@/components/combobox";
import { UserAvatar } from "@/components/user-avatar";
import { CalendarIcon, ClockIcon, CloseIcon, FlagIcon, MapPinIcon, NoteIcon } from "@/components/shell/icons";
import { FIELD_CLASS, PopoverFieldRow, TimePopoverContent } from "./appointment-detail-modal";
import { DEFAULT_APPOINTMENT_DURATION, TIME_SLOTS } from "./schedule-config";
import { WeekDayPickerContent } from "./real-week-day-picker";
import type { WeekDay } from "./real-week";
import type { Patient } from "@/features/patients/data";
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

// "H:MM AM/PM" (see schedule-config.ts's own formatSlot) + a "YYYY-MM-DD" day
// key → a real ISO instant.
function combineDayAndTime(dayKey: string, time: string): string {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(time);
  const [yearStr, monthStr, dateStr] = dayKey.split("-");
  let hour = match ? Number(match[1]) % 12 : 0;
  const minute = match ? Number(match[2]) : 0;
  if (match?.[3] === "PM") hour += 12;
  return new Date(Number(yearStr), Number(monthStr) - 1, Number(dateStr), hour, minute).toISOString();
}

export function RealNewAppointmentModal({
  clinicId,
  patients,
  professionals,
  lockedProfessional,
  weekDays,
  treatmentOptions,
  roomOptions,
  prefill,
  onClose,
  onCreated,
}: {
  clinicId: string;
  patients: Patient[];
  professionals: BoardProfessional[];
  lockedProfessional: BoardProfessional | null;
  weekDays: WeekDay[];
  treatmentOptions: string[];
  roomOptions: string[];
  prefill?: { professionalProfileId?: string; dayKey?: string; time?: string; patientId?: string } | null;
  onClose: () => void;
  onCreated: (created: Appointment) => void;
}) {
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
  const [reason, setReason] = useState("");
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

  const dayEntry = weekDays.find((d) => d.key === dayKey);
  const dayLabel = dayEntry ? `${dayEntry.label}, ${dayEntry.dateLabel}` : "Selecciona una fecha";
  const timeLabel = time ? `${time} (${durationMinutes} min)` : "Selecciona un horario";

  const canCreate = Boolean(patientId && professionalId && dayKey && time) && !creating;

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
      startsAt: combineDayAndTime(dayKey, time),
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
                  {lockedProfessional ? (
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
                  time={time || TIME_SLOTS[0]}
                  durationMinutes={durationMinutes}
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

              <Field icon={FlagIcon} label="Tratamiento">
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
