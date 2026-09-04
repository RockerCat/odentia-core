"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/rich-text-editor";
import { UserAvatar } from "@/components/user-avatar";
import { useRouteGuard } from "@/components/shell/use-route-guard";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronIcon,
  ClipboardIcon,
  ClockIcon,
  CloseIcon,
  FlagIcon,
  NoteIcon,
  PhoneIcon,
  PlusIcon,
  ToothIcon,
  UserIcon,
} from "@/components/shell/icons";
import { formatClockLabel, formatElapsed } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Patient } from "@/features/patients/data";
import { buildProceduresPayload, buildTreatmentText } from "@/features/patients/clinical-encounter-draft";
import { EditOdontogramaModal } from "@/features/patients/edit-odontograma-modal";
import { upsertPatientClinicalEncounter } from "@/features/patients/clinical-encounters-actions";
import type { ClinicalEncounterProcedureRecord, ClinicalEncounterRecord } from "@/features/patients/clinical-encounters-data";
import { toOdontogramData, type ToothFindingRecord } from "@/features/patients/tooth-findings-data";
import { FIELD_CLASS } from "./appointment-detail-modal";
import { updateAppointment } from "./appointments-actions";
import { fetchAppointmentsForPatient, type Appointment } from "./appointments-data";
import { OdontogramPreview } from "./odontogram-teeth";
import type { BoardProfessional } from "./real-appointments-board";
import { endTimeIso, formatDateLabel, formatTimeLabel, initialsOf } from "./real-format";
import { getDisplayStatus, getHistoryStatusBadgeClass, getStatusLabel } from "./real-status";
import { RealNewAppointmentModal } from "./real-new-appointment-modal";
import type { WeekDay } from "./real-week";

// Real "Iniciar/Continuar atención" screen — reached at
// /agenda/atencion/[appointmentId] (see that route's page.tsx), not an
// in-page overlay like the mock ClinicalEncounterScreen it ports (that file
// stays untouched — still used by the Patient Portal/still-mock dashboard).
// Same approved visual design (chrome, section layout, classNames) — not
// redesigned. Everything here is real: header/patient/professional info
// (real Appointment), Odontograma (public.patient_tooth_findings, via the
// SAME EditOdontogramaModal already used by Historia Clínica — not a
// second odontogram editor), and "Notas de atención"/"Procedimientos
// realizados"/"Indicaciones al paciente" (public.patient_clinical_encounters
// + patient_clinical_encounter_procedures, see the 20260903120000
// migration) — persisted via upsert_patient_clinical_encounter, both by
// "Guardar borrador" (finalize: false) and "Finalizar atención"
// (finalize: true). The mock's fabricated "next patient" countdown alert
// (a hardcoded name, no real lookup behind it) is dropped entirely rather
// than ported — showing invented patient data on a real screen is not an
// option, see CLAUDE.md's Security section.
//
// Draft vs finalized: a row's finalized_at (null = draft) IS the state —
// "Guardar borrador" upserts with finalize:false (creates the row on first
// save, updates it in place on every later save — never a second row, see
// the RPC's own idempotent-by-appointment_id comment); "Finalizar
// atención" always calls the SAME upsert with finalize:true (persisting
// whatever notes/procedures/indications are currently on screen, even if
// nothing was explicitly drafted first) and only then marks the Cita
// `completed`. Once finalized_at is set, the RPC treats the row as
// immutable and returns it unchanged on any further call — this is what
// makes both a retried "Finalizar atención" and a stray extra "Guardar
// borrador" click safe (no duplicate row, no overwritten clinical record).
//
// existingEncounter/existingProcedures (see the page.tsx loader) are the
// load/resume check AND the draft reconstruction: a non-null encounter
// means a PREVIOUS "Guardar borrador" or "Finalizar atención" already
// persisted this Cita's row — draft or finalized — and its notes/
// indications/procedures seed this screen's initial state below, so a
// refresh or "Continuar atención" always reconstructs exactly what was
// last saved, never a blank form.

type ProcedureRow = { id: string; name: string; note: string };

const HISTORY_LIMIT = 3;

export function RealClinicalEncounterScreen({
  appointment,
  professional,
  clinicId,
  patients,
  professionals,
  weekDays,
  treatmentOptions,
  roomOptions,
  initialToothFindings,
  existingEncounter,
  existingProcedures,
}: {
  appointment: Appointment;
  professional: BoardProfessional | null;
  clinicId: string;
  patients: Patient[];
  professionals: BoardProfessional[];
  weekDays: WeekDay[];
  treatmentOptions: string[];
  roomOptions: string[];
  initialToothFindings: ToothFindingRecord[];
  existingEncounter: ClinicalEncounterRecord | null;
  existingProcedures: ClinicalEncounterProcedureRecord[];
}) {
  const router = useRouter();
  // Clinical action — never Assistant (see CLAUDE.md's Roles: Assistant
  // supports operations, it doesn't attend patients). Same gating
  // mechanism every other real gated route already uses (see
  // use-route-guard.ts) — never rely on the button being hidden alone,
  // the destination page.tsx also refuses to load the data server-side.
  const authorized = useRouteGuard(["clinic-admin", "dentist"]);

  // Seeded from the persisted draft/finalized row (see this file's own
  // header comment) — never blank just because the screen remounted.
  const [notes, setNotes] = useState(existingEncounter?.notes ?? "");
  const [indications, setIndications] = useState(existingEncounter?.indications ?? "");
  const [procedures, setProcedures] = useState<ProcedureRow[]>(() =>
    existingProcedures.map((p) => ({ id: p.id, name: p.name, note: p.note ?? "" })),
  );
  const [needsNextAppointment, setNeedsNextAppointment] = useState<boolean | null>(null);
  const [nextTreatment, setNextTreatment] = useState("");
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [toothFindings, setToothFindings] = useState<ToothFindingRecord[]>(initialToothFindings);
  const [odontogramOpen, setOdontogramOpen] = useState(false);
  const [timerVisible, setTimerVisible] = useState(true);
  const [showNewAppointmentModal, setShowNewAppointmentModal] = useState(false);
  const [scheduledNextAppointment, setScheduledNextAppointment] = useState<Appointment | null>(null);
  // Purely cosmetic pending flags for the two plain "navigate away"
  // buttons below ("Volver a Agenda" header link, "Ver o modificar cita")
  // — separate from `finalizing` (Finalizar atención's own contextual
  // pending, already correct, never touched here) since either of these
  // can be clicked independently of that flow. Neither is ever reset back
  // to false on success: this whole screen unmounts once /agenda lands,
  // so there's nothing left to reset it for (resetting early would flash
  // the plain label back before the navigation actually leaves).
  const [leavingToAgenda, setLeavingToAgenda] = useState(false);
  const [openingScheduledAppointment, setOpeningScheduledAppointment] = useState(false);
  const [startedAt] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const nextProcedureId = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showNewAppointmentModal) {
        setShowNewAppointmentModal(false);
        return;
      }
      if (odontogramOpen) {
        setOdontogramOpen(false);
        return;
      }
      if (showFinalizeConfirm) {
        setShowFinalizeConfirm(false);
        return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showFinalizeConfirm, odontogramOpen, showNewAppointmentModal]);

  const [history, setHistory] = useState<Appointment[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const rows = await fetchAppointmentsForPatient(supabase, appointment.clinicId, appointment.patientId);
        if (!cancelled) setHistory(rows.filter((a) => a.id !== appointment.id).slice(0, HISTORY_LIMIT));
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appointment.clinicId, appointment.patientId, appointment.id]);

  const addProcedure = () => {
    nextProcedureId.current += 1;
    setProcedures((prev) => [...prev, { id: `proc-${nextProcedureId.current}`, name: "", note: "" }]);
  };

  const updateProcedure = (id: string, patch: Partial<ProcedureRow>) => {
    setProcedures((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removeProcedure = (id: string) => {
    setProcedures((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setDraftError(null);
    const result = await upsertPatientClinicalEncounter({
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      occurredAt: new Date().toISOString(),
      reason: appointment.reason,
      diagnosis: null,
      treatment: buildTreatmentText(procedures),
      notes: notes || null,
      indications: indications || null,
      procedures: buildProceduresPayload(procedures),
      finalize: false,
    });
    setSavingDraft(false);
    if (result.status === "error") {
      setDraftError(result.message);
      return;
    }
    setInfoMessage("Borrador guardado.");
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    setFinalizeError(null);

    // Always upserts — even when a draft already exists from an earlier
    // "Guardar borrador" or a resumed session — so whatever's currently on
    // screen (including anything typed since the last save) is what
    // actually gets finalized. The Cita is only marked `completed` once
    // this write is confirmed, never the other way around. If it fails, we
    // stop here: the Cita stays `in_progress` and "Finalizar atención" can
    // simply be pressed again — the RPC is idempotent by appointment_id
    // and, once finalized_at is set, treats the row as immutable, so a
    // retry (or a second tab) can never duplicate or overwrite the real
    // clinical record.
    const encounterResult = await upsertPatientClinicalEncounter({
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      occurredAt: new Date().toISOString(),
      reason: appointment.reason,
      diagnosis: null,
      treatment: buildTreatmentText(procedures),
      notes: notes || null,
      indications: indications || null,
      procedures: buildProceduresPayload(procedures),
      finalize: true,
    });
    if (encounterResult.status === "error") {
      setFinalizing(false);
      setFinalizeError(encounterResult.message);
      return;
    }

    const statusResult = await updateAppointment(appointment.id, { status: "completed" });
    if (statusResult.status === "error") {
      // The encounter is already safely recorded — only the Cita's own
      // status write needs retrying, which the next "Finalizar atención"
      // click does (the RPC call above just re-confirms the same already-
      // finalized row, then this status write is retried).
      setFinalizing(false);
      setFinalizeError(statusResult.message);
      return;
    }
    // Deliberately no setFinalizing(false)/setShowFinalizeConfirm(false)
    // here on success — router.push() below starts the transition to
    // /agenda but doesn't wait for it to finish, so resetting either flag
    // now would close this confirm dialog and re-enable the plain
    // "Finalizar atención" trigger button (which isn't even gated by
    // `finalizing`) while /agenda's own server-side fetch is still in
    // flight — exactly the "click looks ignored" bug already found and
    // fixed for "Iniciar atención" in real-appointment-detail-modal.tsx.
    // This whole screen is about to unmount once the route change lands,
    // so there's nothing left to reset either flag for.
    router.push("/agenda");
  };

  if (!authorized) return null;

  const duration = appointment.durationMinutes;
  const endIso = endTimeIso(appointment.startsAt, duration);
  const dayLabel = formatDateLabel(appointment.startsAt);
  const timeLabel = `${formatTimeLabel(appointment.startsAt)} – ${formatTimeLabel(endIso)}`;
  const professionalName = professional?.name ?? "Sin asignar";
  const initials = initialsOf(appointment.patientName);
  const odontogram = toOdontogramData(toothFindings);

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
  const hasAlerts = Boolean(appointment.notes);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <button
          type="button"
          disabled={leavingToAgenda}
          onClick={() => {
            if (leavingToAgenda) return;
            setLeavingToAgenda(true);
            router.push("/agenda");
          }}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-60"
        >
          <ChevronIcon className="size-4" />
          {leavingToAgenda ? "Volviendo a Agenda…" : "Volver a Agenda"}
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-info/25 bg-info/10 px-2.5 py-1 text-xs font-medium text-info">
          <span className="size-1.5 rounded-full bg-info" aria-hidden="true" />
          En atención
        </span>
      </header>

      <div className="shrink-0 border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <UserAvatar name={appointment.patientName} initials={initials} sizeClassName="size-11" />
            <div>
              <p className="text-sm font-semibold">{appointment.patientName}</p>
              <p className="text-xs text-muted-foreground">{appointment.reason ?? "Sin tratamiento definido"}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground sm:ml-auto">
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="size-3.5" />
              {dayLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <ClockIcon className="size-3.5" />
              {timeLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <UserIcon className="size-3.5" />
              {professionalName}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#F4F7F6]">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          {finalizeError && (
            <div className="mb-4 flex items-start justify-between gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
              <span>{finalizeError}</span>
              <button type="button" onClick={() => setFinalizeError(null)} aria-label="Cerrar aviso" className="shrink-0">
                <CloseIcon className="size-3.5" />
              </button>
            </div>
          )}
          {draftError && (
            <div className="mb-4 flex items-start justify-between gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
              <span>{draftError}</span>
              <button type="button" onClick={() => setDraftError(null)} aria-label="Cerrar aviso" className="shrink-0">
                <CloseIcon className="size-3.5" />
              </button>
            </div>
          )}
          {infoMessage && (
            <div className="mb-4 flex items-start justify-between gap-2 rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-xs font-medium text-info">
              <span>{infoMessage}</span>
              <button type="button" onClick={() => setInfoMessage(null)} aria-label="Cerrar aviso" className="shrink-0">
                <CloseIcon className="size-3.5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-6">
              <Section title="Notas de atención" icon={NoteIcon}>
                <RichTextEditor
                  value={notes}
                  onChange={setNotes}
                  placeholder="Describe lo observado y realizado durante la atención…"
                />
              </Section>

              <Section title="Procedimientos realizados" icon={ClipboardIcon}>
                <div className="flex flex-col gap-2.5">
                  {procedures.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      Aún no se han agregado procedimientos.
                    </p>
                  )}
                  {procedures.map((proc) => (
                    <div key={proc.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
                      <div className="grid flex-1 gap-2 sm:grid-cols-2">
                        <select
                          value={proc.name}
                          onChange={(e) => updateProcedure(proc.id, { name: e.target.value })}
                          className={FIELD_CLASS}
                        >
                          <option value="">Selecciona un procedimiento</option>
                          {treatmentOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={proc.note}
                          onChange={(e) => updateProcedure(proc.id, { note: e.target.value })}
                          placeholder="Observación (opcional)"
                          className={FIELD_CLASS}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProcedure(proc.id)}
                        aria-label="Quitar procedimiento"
                        className="mt-1.5 shrink-0 text-muted-foreground/60 hover:text-danger"
                      >
                        <CloseIcon className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addProcedure}
                    className="flex items-center justify-center gap-1.5 self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  >
                    <PlusIcon className="size-3.5" />
                    Agregar procedimiento
                  </button>
                </div>
              </Section>

              <Section title="Odontograma" icon={ToothIcon}>
                <div className="rounded-lg border border-dashed border-border px-4 py-4">
                  <OdontogramPreview odontogram={odontogram} />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">
                      {Object.keys(odontogram).length > 0
                        ? `${Object.keys(odontogram).length} pieza(s) con hallazgos registrados.`
                        : "Registra hallazgos por diente durante la atención."}
                    </p>
                    <button
                      type="button"
                      onClick={() => setOdontogramOpen(true)}
                      className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
                    >
                      Abrir odontograma
                    </button>
                  </div>
                </div>
              </Section>

              <Section title="Indicaciones al paciente" icon={FlagIcon}>
                <RichTextEditor
                  value={indications}
                  onChange={setIndications}
                  placeholder="Recomendaciones, cuidados o medicamentos indicados…"
                />
              </Section>

              <Section title="Próxima cita" icon={CalendarIcon}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    {([true, false] as const).map((option) => (
                      <button
                        key={String(option)}
                        type="button"
                        onClick={() => setNeedsNextAppointment(option)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          needsNextAppointment === option
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border text-foreground/70 hover:bg-foreground/5"
                        }`}
                      >
                        {option ? "Sí" : "No"}
                      </button>
                    ))}
                  </div>
                  {needsNextAppointment && (
                    <>
                      <div>
                        <label className="text-[11px] text-label-foreground" htmlFor="next-treatment">
                          Tratamiento recomendado
                        </label>
                        <select
                          id="next-treatment"
                          value={nextTreatment}
                          onChange={(e) => setNextTreatment(e.target.value)}
                          className={`${FIELD_CLASS} mt-1`}
                        >
                          <option value="">Selecciona un tratamiento</option>
                          {treatmentOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>

                      {scheduledNextAppointment ? (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                          <p className="text-xs font-medium text-primary">Próxima cita agendada</p>
                          <p className="mt-1 text-xs text-foreground/80">
                            {formatDateLabel(scheduledNextAppointment.startsAt)} ·{" "}
                            {formatTimeLabel(scheduledNextAppointment.startsAt)} ·{" "}
                            {scheduledNextAppointment.reason ?? "Sin tratamiento definido"}
                          </p>
                          <button
                            type="button"
                            disabled={openingScheduledAppointment}
                            onClick={() => {
                              if (openingScheduledAppointment) return;
                              setOpeningScheduledAppointment(true);
                              router.push("/agenda");
                            }}
                            className="mt-2 text-xs font-medium text-primary hover:underline disabled:opacity-60"
                          >
                            {openingScheduledAppointment ? "Abriendo cita…" : "Ver o modificar cita"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowNewAppointmentModal(true)}
                          className="flex items-center justify-center gap-1.5 self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                        >
                          <PlusIcon className="size-3.5" />
                          Agendar próxima cita
                        </button>
                      )}
                    </>
                  )}
                </div>
              </Section>
            </div>

            <aside className="hidden lg:flex lg:flex-col lg:gap-5">
              <div className="rounded-xl border border-border bg-background p-4">
                <h3 className="text-sm font-semibold">Información del paciente</h3>
                <div className="mt-3 flex items-center gap-3">
                  <UserAvatar name={appointment.patientName} initials={initials} sizeClassName="size-10" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{appointment.patientName}</p>
                    {appointment.patientPhone && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <PhoneIcon className="size-3" />
                        {appointment.patientPhone}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {timerVisible ? (
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Tiempo de atención</h3>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                        En curso
                      </span>
                      <button
                        type="button"
                        onClick={() => setTimerVisible(false)}
                        aria-label="Ocultar tiempo de atención"
                        className="text-muted-foreground/50 hover:text-foreground"
                      >
                        <CloseIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-foreground">
                    {formatElapsed(elapsedSeconds)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Atención iniciada a las {formatClockLabel(startedAt)}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setTimerVisible(true)}
                  className="flex items-center justify-between rounded-xl border border-dashed border-border bg-background px-4 py-2.5 text-left transition-colors hover:bg-foreground/5"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                    <ClockIcon className="size-3.5 text-muted-foreground" />
                    Tiempo de atención
                  </span>
                  <span className="text-xs font-medium text-primary">Mostrar tiempo</span>
                </button>
              )}

              <div className="rounded-xl border border-border bg-background p-4">
                <h3 className="text-sm font-semibold">Alertas</h3>
                {hasAlerts ? (
                  <div className="mt-3 flex flex-col gap-2">
                    {appointment.notes && (
                      <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs text-warning">
                        <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                        <span>{appointment.notes}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                    Sin alertas registradas.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <h3 className="text-sm font-semibold">Últimas atenciones</h3>
                {history === null ? (
                  <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                    Cargando historial…
                  </p>
                ) : history.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                    Este paciente aún no tiene historial de citas.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {history.map((item) => (
                      <li key={item.id} className="rounded-lg border border-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">{formatDateLabel(item.startsAt)}</span>
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${getHistoryStatusBadgeClass(getDisplayStatus(item))}`}
                          >
                            {getStatusLabel(getDisplayStatus(item))}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.reason ?? "Sin definir"}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => router.push(`/pacientes/${appointment.patientId}/historial-citas`)}
                  className="mt-3 w-full rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
                >
                  Ver historia completa
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-background p-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl justify-end gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={savingDraft}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/5 disabled:opacity-60 sm:px-6"
          >
            {savingDraft ? "Guardando…" : "Guardar borrador"}
          </button>
          <button
            type="button"
            onClick={() => setShowFinalizeConfirm(true)}
            disabled={savingDraft || finalizing}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:px-6"
          >
            {finalizing ? "Finalizando…" : "Finalizar atención"}
          </button>
        </div>
      </footer>

      {showFinalizeConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !finalizing && setShowFinalizeConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Finalizar atención"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl bg-background p-6 text-center shadow-xl"
          >
            <CheckCircleIcon className="mx-auto size-8 text-primary" />
            <p className="mt-3 text-sm font-medium">¿Finalizar esta atención?</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Quedará registrada en la historia clínica de {appointment.patientName} y la cita se marcará como
              Completada.
            </p>
            {finalizeError && <p className="mt-2 text-xs text-danger">{finalizeError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowFinalizeConfirm(false)}
                disabled={finalizing}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={finalizing}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {finalizing ? "Finalizando…" : "Finalizar atención"}
              </button>
            </div>
          </div>
        </div>
      )}

      {odontogramOpen && (
        <EditOdontogramaModal
          patientId={appointment.patientId}
          patientName={appointment.patientName}
          findings={toothFindings}
          onChanged={setToothFindings}
          onClose={() => setOdontogramOpen(false)}
        />
      )}

      {showNewAppointmentModal && (
        <RealNewAppointmentModal
          clinicId={clinicId}
          patients={patients}
          professionals={professionals}
          lockedProfessional={null}
          weekDays={weekDays}
          treatmentOptions={treatmentOptions}
          roomOptions={roomOptions}
          prefill={{
            professionalProfileId: appointment.professionalProfileId,
            patientId: appointment.patientId,
            reason: nextTreatment || undefined,
          }}
          onClose={() => setShowNewAppointmentModal(false)}
          onCreated={(created) => {
            setScheduledNextAppointment(created);
            setShowNewAppointmentModal(false);
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof ClipboardIcon;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-background p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
