"use client";

import { useRef, useState } from "react";
import { CloseIcon, PhoneIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import {
  chronologicalKey,
  FIELD_CLASS,
  HistoryEntry,
} from "@/features/dashboard/appointment-detail-modal";
import type { Appointment, Dentist, WeekDay } from "@/features/dashboard/mock-data";
import { getPatientVisitSummary, PATIENT_STATUS_LABELS, type Patient } from "./mock-data";

const RECENT_HISTORY_LIMIT = 5;

function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

export function PatientDetailModal({
  patient,
  appointments,
  dentists,
  weekDays,
  onClose,
  onEdit,
  onNewAppointment,
  onViewHistory,
}: {
  patient: Patient;
  appointments: Appointment[];
  dentists: Dentist[];
  weekDays: WeekDay[];
  onClose: () => void;
  onEdit: (patch: Partial<Patient>) => void;
  onNewAppointment: () => void;
  onViewHistory: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(patient.name);
  const [phoneDraft, setPhoneDraft] = useState(patient.phone);
  const [emailDraft, setEmailDraft] = useState(patient.email);
  const [documentDraft, setDocumentDraft] = useState(patient.documentId);

  const usualDentist = dentists.find((d) => d.id === patient.usualDentistId);
  const own = appointments
    .filter((a) => a.patientName === patient.name)
    .sort((a, b) => chronologicalKey(b, weekDays) - chronologicalKey(a, weekDays));
  const { lastVisitLabel, nextAppointmentLabel } = getPatientVisitSummary(patient, appointments, weekDays);

  const completedCount = own.filter((a) => a.status === "completed").length;
  const cancelledCount = own.filter((a) => a.status === "cancelled" || a.status === "no-show").length;
  const recentTreatments = Array.from(
    new Set(own.filter((a) => a.status === "completed").map((a) => a.type).filter(Boolean)),
  ).slice(0, 3) as string[];
  const visibleHistory = own.slice(0, RECENT_HISTORY_LIMIT);

  const startEditing = () => {
    setNameDraft(patient.name);
    setPhoneDraft(patient.phone);
    setEmailDraft(patient.email);
    setDocumentDraft(patient.documentId);
    setEditing(true);
  };

  const saveEditing = () => {
    onEdit({
      name: nameDraft.trim() || patient.name,
      phone: phoneDraft.trim() || patient.phone,
      email: emailDraft.trim() || patient.email,
      documentId: documentDraft.trim() || patient.documentId,
    });
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={patient.name}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-5xl sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Paciente</p>
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
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,260px)_1fr_minmax(0,260px)]">
            {/* Izquierda — tarjeta de paciente, mismo lenguaje visual que la
                tarjeta de identidad del Perfil del profesional (ver
                DentistProfileModal en appointments-card.tsx). */}
            <div className="rounded-xl border border-border bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] p-4 shadow-sm">
              <div className="flex flex-col items-center gap-2 text-center">
                <UserAvatar name={patient.name} initials={patient.initials} sizeClassName="size-20" />

                {editing ? (
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className={`${FIELD_CLASS} text-center`}
                  />
                ) : (
                  <p className="text-base font-semibold">{patient.name}</p>
                )}

                <p className="text-sm text-muted-foreground">{patient.age} años</p>

                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    patient.status === "active"
                      ? "border-primary/25 bg-primary/10 text-primary"
                      : "border-danger/25 bg-danger/10 text-danger"
                  }`}
                >
                  {PATIENT_STATUS_LABELS[patient.status]}
                </span>

                {!editing && (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Editar datos
                  </button>
                )}
              </div>

              {/* Separación visual sutil entre el gafete y los datos de contacto. */}
              <div className="mt-5 border-t border-border" />

              <dl
                className={`mt-5 flex flex-col gap-4 text-sm ${
                  editing ? "rounded-lg border border-primary/15 bg-primary/[0.03] p-3" : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-label-foreground">Teléfono</dt>
                    {editing ? (
                      <input
                        value={phoneDraft}
                        onChange={(e) => setPhoneDraft(e.target.value)}
                        className={`${FIELD_CLASS} max-w-[60%]`}
                      />
                    ) : (
                      <dd className="truncate font-medium">{patient.phone}</dd>
                    )}
                  </div>
                  {/* Compact contact action, right next to the phone it uses —
                      same placement as the professional card's own WhatsApp link. */}
                  {!editing && patient.phone && (
                    <a
                      href={waLink(patient.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <PhoneIcon className="size-3" />
                      WhatsApp
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <dt className="text-label-foreground">Correo</dt>
                  {editing ? (
                    <input
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      className={`${FIELD_CLASS} max-w-[60%]`}
                    />
                  ) : (
                    <dd className="truncate font-medium">{patient.email || "Sin registrar"}</dd>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <dt className="text-label-foreground">Documento</dt>
                  {editing ? (
                    <input
                      value={documentDraft}
                      onChange={(e) => setDocumentDraft(e.target.value)}
                      className={`${FIELD_CLASS} max-w-[60%]`}
                    />
                  ) : (
                    <dd className="truncate font-medium">{patient.documentId}</dd>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <dt className="text-label-foreground">Paciente desde</dt>
                  <dd className="truncate font-medium">{patient.patientSinceLabel}</dd>
                </div>
              </dl>

              {editing && (
                <div className="mt-4 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={saveEditing}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    Guardar cambios
                  </button>
                </div>
              )}
            </div>

            {/* Centro — resumen clínico */}
            <div className="flex flex-col gap-4">
              {patient.allergies && (
                <div className="rounded-lg border border-warning/25 bg-warning/10 px-3.5 py-2.5">
                  <p className="text-xs font-semibold text-warning uppercase">Alertas / alergias</p>
                  <p className="mt-0.5 text-sm text-warning">{patient.allergies}</p>
                </div>
              )}

              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold">Resumen clínico</p>
                <dl className="mt-3 flex flex-col gap-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-label-foreground">Última atención</dt>
                    <dd className="text-right font-medium">{lastVisitLabel}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-label-foreground">Odontólogo habitual</dt>
                    <dd className="font-medium">{usualDentist?.name ?? "Sin asignar"}</dd>
                  </div>
                </dl>

                {recentTreatments.length > 0 && (
                  <div className="mt-3.5">
                    <p className="text-xs text-label-foreground">Tratamientos recientes</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {recentTreatments.map((treatment) => (
                        <span
                          key={treatment}
                          className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-foreground/80"
                        >
                          {treatment}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xl font-bold tracking-tight">{completedCount}</p>
                  <p className="mt-0.5 text-[11px] text-label-foreground">Citas completadas</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xl font-bold tracking-tight">{cancelledCount}</p>
                  <p className="mt-0.5 text-[11px] text-label-foreground">Canceladas / no asistió</p>
                </div>
              </div>
            </div>

            {/* Derecha — próxima cita + historial, reutilizando el mismo
                timeline vertical (HistoryEntry) del preview de citas. */}
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs font-semibold text-primary uppercase">Próxima cita</p>
                <p className="mt-1 text-sm font-medium text-foreground">{nextAppointmentLabel}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Historial de citas</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Últimas atenciones del paciente</p>

                {visibleHistory.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    Este paciente aún no tiene historial de citas.
                  </p>
                ) : (
                  <ol className="mt-3 flex flex-col gap-2 border-l border-border/70 pl-4">
                    {visibleHistory.map((item) => (
                      <HistoryEntry
                        key={item.id}
                        item={item}
                        dentistName={dentists.find((d) => d.id === item.dentistId)?.name ?? "Sin asignar"}
                        dayLabel={weekDays.find((d) => d.key === item.day)?.dateLabel ?? item.day}
                        modalRef={modalRef}
                        onClick={() => {}}
                      />
                    ))}
                  </ol>
                )}

                {own.length > RECENT_HISTORY_LIMIT && (
                  <button
                    type="button"
                    onClick={onViewHistory}
                    className="mt-3 w-full rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
                  >
                    Ver historial completo
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onViewHistory}
            className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground/80 hover:bg-foreground/5"
          >
            Ver historia clínica
          </button>
          <button
            type="button"
            onClick={onNewAppointment}
            className="rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Nueva cita
          </button>
        </div>
      </div>
    </div>
  );
}
