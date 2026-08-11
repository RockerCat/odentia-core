import { useEffect, useRef, useState, type ReactNode } from "react";
import { UserAvatar } from "@/components/user-avatar";
import {
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  FlagIcon,
  MapPinIcon,
  NoteIcon,
  SearchIcon,
} from "@/components/shell/icons";
import {
  CalendarPopoverContent,
  FIELD_CLASS,
  PopoverFieldRow,
  simulateSave,
  TimePopoverContent,
} from "./appointment-detail-modal";
import type { Appointment, Dentist, WeekDay } from "./mock-data";
import { ROOMS, TREATMENT_OPTIONS } from "./mock-data";
import { addMinutesToSlot, DEFAULT_APPOINTMENT_DURATION, TIME_SLOTS } from "./schedule-config";

function computeInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

type PatientOption = {
  name: string;
  initials: string;
  secondary?: string;
};

// Patients aren't a first-class entity in this prototype yet (see
// PROJECT_STATUS.md: Patients is a separate, not-yet-built milestone) —
// the picker's list, including its secondary line, is derived entirely
// from existing appointments rather than a new data model.
function derivePatientOptions(appointments: Appointment[], weekDays: WeekDay[]): PatientOption[] {
  const byName = new Map<string, Appointment[]>();
  for (const appt of appointments) {
    const list = byName.get(appt.patientName);
    if (list) list.push(appt);
    else byName.set(appt.patientName, [appt]);
  }

  return Array.from(byName.entries())
    .map(([name, appts]) => {
      const withPhone = appts.find((a) => a.patientPhone);
      const last = appts[appts.length - 1];
      const lastDayLabel = weekDays.find((d) => d.key === last.day)?.dateLabel ?? last.day;
      return {
        name,
        initials: last.initials,
        secondary: withPhone?.patientPhone ?? `Última visita: ${lastDayLabel}`,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function NewAppointmentModal({
  dentists,
  weekDays,
  existingAppointments,
  prefill,
  onClose,
  onCreate,
}: {
  dentists: Dentist[];
  weekDays: WeekDay[];
  existingAppointments: Appointment[];
  // Set when opened from an empty calendar slot (Profesional/Fecha/Horario)
  // or from the clinical encounter screen's "Agendar próxima cita" action
  // (Paciente/Profesional/Tratamiento) — each field is independently
  // optional and, when a date/time/professional is included, highlights
  // that value in the primary color until the user changes it.
  prefill?: { dentistId?: string; day?: string; time?: string; patientName?: string; type?: string };
  onClose: () => void;
  onCreate: (appointment: Appointment) => void;
}) {
  const patientOptions = derivePatientOptions(existingAppointments, weekDays);

  const [patientName, setPatientName] = useState(prefill?.patientName ?? "");
  const [dentistId, setDentistId] = useState(prefill?.dentistId ?? "");
  // Empty unless prefilled from a calendar slot click — no default
  // day/time otherwise, per this refinement's spec. The date/time
  // popovers still need *some* starting point to display internally the
  // first time they're opened; that's a separate concern from what's
  // actually committed here (see below).
  const [day, setDay] = useState(prefill?.day ?? "");
  const [time, setTime] = useState(prefill?.time ?? "");
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_APPOINTMENT_DURATION);
  const [room, setRoom] = useState("");
  const [type, setType] = useState(prefill?.type ?? "");
  const [notes, setNotes] = useState("");
  const [editingField, setEditingField] = useState<"date" | "time" | null>(null);
  const [creating, setCreating] = useState(false);

  // Cleared the moment the user actively edits that specific field — once
  // they've engaged with it, it's their choice, not just a suggestion
  // anymore. Keyed off the specific field (not the whole prefill object) so
  // a partial prefill — e.g. only dentistId/patientName/type, no day/time —
  // doesn't falsely highlight an empty date/time as if it were pre-filled.
  const [dentistFromCalendar, setDentistFromCalendar] = useState(Boolean(prefill?.dentistId));
  const [dateFromCalendar, setDateFromCalendar] = useState(Boolean(prefill?.day));
  const [timeFromCalendar, setTimeFromCalendar] = useState(Boolean(prefill?.time));

  const dayEntry = weekDays.find((d) => d.key === day);
  const dayLabel = dayEntry ? `${dayEntry.label}, ${dayEntry.dateLabel}` : "Selecciona una fecha";
  const timeLabel = time
    ? `${time} – ${addMinutesToSlot(time, durationMinutes)} (${durationMinutes} min)`
    : "Selecciona un horario";

  const canCreate = Boolean(patientName && dentistId && day && time) && !creating;

  // Creation logic is unchanged from before this UI refinement — same
  // fields, same simulateSave call, same onCreate/onClose sequence. Only
  // how each field gets set (combobox/popover vs a <select>) changed, plus
  // Crear cita now also requires dentistId/day/time since none of them
  // default to a pre-selected value anymore.
  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    const created = await simulateSave<Appointment>({
      id: `new-${Date.now()}`,
      day,
      time,
      patientName,
      initials: computeInitials(patientName),
      type: type || undefined,
      status: "confirmed",
      dentistId,
      durationMinutes,
      room: room || undefined,
      notes: notes || undefined,
    });
    onCreate(created);
    setCreating(false);
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
              <p className="text-[11px] font-semibold tracking-wide text-label-foreground uppercase">
                Personas
              </p>

              <div>
                <label className="text-[11px] text-label-foreground">Paciente</label>
                <div className="mt-1">
                  <Combobox
                    items={patientOptions}
                    getKey={(patient) => patient.name}
                    getSearchText={(patient) => patient.name}
                    selectedItem={patientOptions.find((p) => p.name === patientName) ?? null}
                    onSelect={(patient) => setPatientName(patient.name)}
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
                            <span className="block truncate text-xs text-muted-foreground">
                              {patient.secondary}
                            </span>
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
                  <Combobox
                    items={dentists}
                    getKey={(dentist) => dentist.id}
                    getSearchText={(dentist) => `${dentist.name} ${dentist.specialty}`}
                    selectedItem={dentists.find((d) => d.id === dentistId) ?? null}
                    onSelect={(dentist) => {
                      setDentistId(dentist.id);
                      setDentistFromCalendar(false);
                    }}
                    placeholder="Buscar profesional…"
                    emptyText="Sin resultados"
                    renderItem={(dentist, isCard) => (
                      <>
                        <UserAvatar
                          name={dentist.name}
                          initials={dentist.initials}
                          avatar_url={dentist.avatar_url}
                          sizeClassName="size-8"
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm font-medium ${
                              isCard && dentistFromCalendar ? "text-primary" : ""
                            }`}
                          >
                            {dentist.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {dentist.specialty}
                          </span>
                        </span>
                      </>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Cita */}
            <div className="mt-4 flex flex-col gap-2.5 sm:mt-0">
              <p className="text-[11px] font-semibold tracking-wide text-label-foreground uppercase">
                Cita
              </p>

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
                <CalendarPopoverContent
                  weekDays={weekDays}
                  currentDay={day}
                  onSelect={(dayKey) => {
                    setDay(dayKey);
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
                    setTimeFromCalendar(false);
                    setEditingField(null);
                  }}
                  onCancel={() => setEditingField(null)}
                />
              </PopoverFieldRow>

              <Field icon={MapPinIcon} label="Consultorio">
                <Combobox
                  items={ROOMS}
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
                <select value={type} onChange={(e) => setType(e.target.value)} className={FIELD_CLASS}>
                  <option value="">Sin definir</option>
                  {TREATMENT_OPTIONS.map((option) => (
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

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof ClockIcon;
  label: string;
  children: ReactNode;
}) {
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

// Shared by Paciente, Profesional and Consultorio: collapsed to just a
// search field until it gains focus or the user types, opening a
// dropdown of live-filtered results (closes automatically on pick).
// Once something is selected it collapses again into a "card" showing
// that selection — clicking the card re-opens the search to change it.
function Combobox<T>({
  items,
  getKey,
  getSearchText,
  selectedItem,
  onSelect,
  renderItem,
  placeholder,
  emptyText,
}: {
  items: T[];
  getKey: (item: T) => string;
  getSearchText: (item: T) => string;
  selectedItem: T | null;
  onSelect: (item: T) => void;
  // isCard: true when rendering the collapsed "selected" card, false for a
  // row inside the open dropdown — lets callers style them differently
  // (e.g. highlighting a calendar-prefilled selection only on its card).
  renderItem: (item: T, isCard: boolean) => ReactNode;
  placeholder: string;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const filtered = items.filter((item) =>
    getSearchText(item).toLowerCase().includes(query.trim().toLowerCase()),
  );

  const handleSelect = (item: T) => {
    onSelect(item);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      {selectedItem && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-primary/40"
        >
          {renderItem(selectedItem, true)}
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={`${FIELD_CLASS} pl-8`}
          />
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((item) => {
                const key = getKey(item);
                const active = selectedItem ? getKey(selectedItem) === key : false;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                        active ? "bg-primary/10" : "hover:bg-foreground/5"
                      }`}
                    >
                      {renderItem(item, false)}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
