import { useEffect, useState } from "react";
import type { Appointment, Dentist, WeekDay } from "./mock-data";
import { ROOMS, TREATMENT_OPTIONS } from "./mock-data";
import { TIME_SLOTS } from "./schedule-config";

// Shared by both "Editar cita" (operational fields) and "Reprogramar"
// (date/time only) in the detail modal — and reusable later by a "Nueva
// cita" flow, which would need the union of both field sets.
export type AppointmentFormMode = "edit" | "reschedule";

type FormValues = {
  dentistId: string;
  day: string;
  time: string;
  type: string;
  room: string;
  patientPhone: string;
  notes: string;
};

function valuesFromAppointment(appointment: Appointment): FormValues {
  return {
    dentistId: appointment.dentistId,
    day: appointment.day,
    time: appointment.time,
    type: appointment.type ?? "",
    room: appointment.room ?? "",
    patientPhone: appointment.patientPhone ?? "",
    notes: appointment.notes ?? "",
  };
}

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none";
const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-muted-foreground";

export function AppointmentForm({
  mode,
  appointment,
  dentists,
  weekDays,
  formId,
  onDirtyChange,
  onSubmit,
}: {
  mode: AppointmentFormMode;
  appointment: Appointment;
  dentists: Dentist[];
  weekDays: WeekDay[];
  formId: string;
  onDirtyChange: (dirty: boolean) => void;
  onSubmit: (values: Partial<Appointment>) => void;
}) {
  const initial = valuesFromAppointment(appointment);
  const [values, setValues] = useState<FormValues>(initial);

  useEffect(() => {
    const dirty = (Object.keys(initial) as (keyof FormValues)[]).some(
      (key) => initial[key] !== values[key],
    );
    onDirtyChange(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` is derived fresh every render; comparing against it here (not as a dep) is intentional.
  }, [values]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "reschedule") {
          onSubmit({ day: values.day, time: values.time });
        } else {
          onSubmit({
            dentistId: values.dentistId,
            type: values.type || undefined,
            room: values.room || undefined,
            patientPhone: values.patientPhone || undefined,
            notes: values.notes || undefined,
          });
        }
      }}
      className="flex flex-col gap-4"
    >
      {mode === "reschedule" && (
        <>
          <div>
            <label className={LABEL_CLASS} htmlFor={`${formId}-day`}>
              Día
            </label>
            <select
              id={`${formId}-day`}
              className={FIELD_CLASS}
              value={values.day}
              onChange={(e) => set("day", e.target.value)}
            >
              {weekDays.map((day) => (
                <option key={day.key} value={day.key}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor={`${formId}-time`}>
              Hora
            </label>
            <select
              id={`${formId}-time`}
              className={FIELD_CLASS}
              value={values.time}
              onChange={(e) => set("time", e.target.value)}
            >
              {TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {mode === "edit" && (
        <>
          <div>
            <label className={LABEL_CLASS} htmlFor={`${formId}-dentist`}>
              Profesional asignado
            </label>
            <select
              id={`${formId}-dentist`}
              className={FIELD_CLASS}
              value={values.dentistId}
              onChange={(e) => set("dentistId", e.target.value)}
            >
              {dentists.map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentist.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor={`${formId}-type`}>
              Tratamiento planeado
            </label>
            <select
              id={`${formId}-type`}
              className={FIELD_CLASS}
              value={values.type}
              onChange={(e) => set("type", e.target.value)}
            >
              <option value="">Sin definir</option>
              {TREATMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor={`${formId}-room`}>
              Consultorio
            </label>
            <select
              id={`${formId}-room`}
              className={FIELD_CLASS}
              value={values.room}
              onChange={(e) => set("room", e.target.value)}
            >
              <option value="">Sin asignar</option>
              {ROOMS.map((room) => (
                <option key={room} value={room}>
                  {room}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor={`${formId}-phone`}>
              Teléfono del paciente
            </label>
            <input
              id={`${formId}-phone`}
              type="tel"
              placeholder="+57 300 000 0000"
              className={FIELD_CLASS}
              value={values.patientPhone}
              onChange={(e) => set("patientPhone", e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor={`${formId}-notes`}>
              Observaciones
            </label>
            <textarea
              id={`${formId}-notes`}
              rows={3}
              className={`${FIELD_CLASS} resize-none`}
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </>
      )}
    </form>
  );
}
