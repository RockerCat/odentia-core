"use client";

import { useRouter } from "next/navigation";
import { ChevronIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { useEffectiveDentists } from "@/dev/use-effective-dentists"; // DEV TOOL — see src/dev/role.ts
import {
  chronologicalKey,
  HISTORY_STATUS_BADGE_CLASS,
  STATUS_LABELS,
  WEEK_APPOINTMENTS,
  WEEK_DAYS,
  type Appointment,
  type AppointmentStatus,
} from "@/features/dashboard/mock-data";
import type { Patient } from "./mock-data";

// Only Cita's final states (see Appointment Lifecycle in CLAUDE.md) — this
// page is a closed record of what already happened, never Agenda's
// upcoming/operational state (that belongs to Agenda/próxima cita, not here).
const FINAL_STATUSES: AppointmentStatus[] = ["completed", "no-show", "cancelled"];

// TEMPORARY, UI-validation-only demo data — this screen's real data source
// (WEEK_APPOINTMENTS) is a single mock week, so it can't show what a fuller,
// months-long history actually looks like. Scoped to Alejandra Vidal (p1)
// only — every other patient keeps using their real WEEK_APPOINTMENTS-
// derived history untouched, and Agenda/WEEK_APPOINTMENTS itself is
// untouched too, so this never leaks into any other screen. `day` holds a
// full pre-formatted date on purpose (outside the single demo week in
// WEEK_DAYS) — the render below already falls back to showing `day` verbatim
// whenever it can't match a WeekDay key (same technique MOCK_PATIENT_HISTORY
// already uses in dashboard/mock-data.ts), so nothing in the rendering code
// needed to change for this. Kept already in reverse-chronological order
// (not run through chronologicalKey, which only understands WEEK_DAYS keys)
// — delete this whole block and its one-line branch below once real
// appointment history data exists; nothing else references it.
const DEMO_HISTORY_PATIENT_ID = "p1";
const DEMO_HISTORY: Appointment[] = [
  {
    id: "demo-hist-1",
    day: "28 Jul 2026",
    time: "10:00 AM",
    patientName: "Alejandra Vidal",
    initials: "AV",
    type: "Limpieza dental",
    status: "completed",
    dentistId: "d1",
    room: "Consultorio 1",
    notes: "Limpieza de rutina sin complicaciones. Se recomienda uso de hilo dental diario.",
  },
  {
    id: "demo-hist-2",
    day: "14 Jul 2026",
    time: "3:30 PM",
    patientName: "Alejandra Vidal",
    initials: "AV",
    type: "Control de ortodoncia",
    status: "no-show",
    dentistId: "d2",
  },
  {
    id: "demo-hist-3",
    day: "30 Jun 2026",
    time: "9:00 AM",
    patientName: "Alejandra Vidal",
    initials: "AV",
    type: "Chequeo general",
    status: "completed",
    dentistId: "d3",
    room: "Consultorio 3",
  },
  {
    id: "demo-hist-4",
    day: "12 Jun 2026",
    time: "11:30 AM",
    patientName: "Alejandra Vidal",
    initials: "AV",
    type: "Extracción dental",
    status: "cancelled",
    dentistId: "d1",
    room: "Consultorio 1",
    notes: "Canceló por motivos personales; se reagendó para la semana siguiente.",
  },
  {
    id: "demo-hist-5",
    day: "20 May 2026",
    time: "8:30 AM",
    patientName: "Alejandra Vidal",
    initials: "AV",
    type: "Blanqueamiento dental",
    status: "completed",
    dentistId: "d2",
    room: "Consultorio 2",
    notes:
      "Primera sesión de blanqueamiento dental. Paciente reporta sensibilidad leve en molares superiores durante " +
      "el procedimiento, manejada con gel desensibilizante. Buen resultado estético tras la primera sesión; se " +
      "programa segunda sesión en 3 semanas para completar el tratamiento y se refuerzan indicaciones de cuidado " +
      "post-blanqueamiento (evitar café, vino y cigarrillo por 48 horas).",
  },
  {
    id: "demo-hist-6",
    day: "2 May 2026",
    time: "4:00 PM",
    patientName: "Alejandra Vidal",
    initials: "AV",
    type: "Consulta de ortodoncia",
    status: "no-show",
    dentistId: "d3",
  },
  {
    id: "demo-hist-7",
    day: "15 Abr 2026",
    time: "9:30 AM",
    patientName: "Alejandra Vidal",
    initials: "AV",
    type: "Chequeo general",
    status: "completed",
    dentistId: "d1",
    room: "Consultorio 1",
    notes: "Sin caries activas. Buena higiene oral.",
  },
  {
    id: "demo-hist-8",
    day: "3 Mar 2026",
    time: "1:00 PM",
    patientName: "Alejandra Vidal",
    initials: "AV",
    type: "Control de ortodoncia",
    status: "cancelled",
    dentistId: "d2",
    room: "Consultorio 2",
  },
  {
    id: "demo-hist-9",
    day: "18 Feb 2026",
    time: "10:30 AM",
    patientName: "Alejandra Vidal",
    initials: "AV",
    type: "Tratamiento de conductos",
    status: "completed",
    dentistId: "d3",
    room: "Consultorio 3",
    notes: "Procedimiento realizado sin complicaciones. Control en 2 semanas.",
  },
];

// Marks "there's a real in-app screen to go back to" — set by whoever
// navigates in (see onViewFullHistory in appointment-detail-modal.tsx)
// right before pushing here. window.history.length alone can't tell this
// apart from a direct/bookmarked load: Chromium already reports length 2
// for a tab's very first goto (its initial blank document counts as an
// entry), so router.back() from a fresh tab lands on a dead blank page
// instead of falling back to Pacientes as required. sessionStorage
// survives a refresh on this page (still a real "came from Agenda" case)
// but not a fresh tab/bookmark/typed URL, which is exactly the distinction
// needed. Exported so any future "historial completo" entry point (see this
// screen's own comment below) sets the same flag instead of reinventing it.
export const HISTORY_BACK_SESSION_KEY = "odentia:historial-citas:back-ok";

// The single "Historial completo de citas" screen — reached today from the
// appointment modal's "Ver historial completo" (see appointment-detail-
// modal.tsx), and meant to be the one place any future "historial completo"
// entry point routes to, instead of growing a second variant.
export function PatientAppointmentHistoryScreen({ patient }: { patient: Patient }) {
  const router = useRouter();
  const { resolveDentist } = useEffectiveDentists();

  const handleBack = () => {
    const canGoBack = typeof window !== "undefined" && sessionStorage.getItem(HISTORY_BACK_SESSION_KEY) === "1";
    if (canGoBack) {
      // One-shot — only valid for the back press right after arriving via
      // the button, not for a later direct/refreshed visit in the same tab.
      sessionStorage.removeItem(HISTORY_BACK_SESSION_KEY);
      router.back();
    } else {
      router.push("/pacientes");
    }
  };

  const history =
    patient.id === DEMO_HISTORY_PATIENT_ID
      ? DEMO_HISTORY
      : WEEK_APPOINTMENTS.filter((a) => a.patientName === patient.name && FINAL_STATUSES.includes(a.status)).sort(
          (a, b) => chronologicalKey(b, WEEK_DAYS) - chronologicalKey(a, WEEK_DAYS),
        );

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground"
        >
          <ChevronIcon className="size-3.5" />
          Atrás
        </button>

        <div className="mt-3 flex items-center gap-3">
          <UserAvatar
            name={patient.name}
            initials={patient.initials}
            avatar_url={patient.avatar_url}
            sizeClassName="size-12"
          />
          <div className="min-w-0">
            {/* The page-level "Historial de citas" title already comes from
                AppShell's own heading (see the route's page.tsx) — this card
                only adds the patient-specific context beneath it. */}
            <p className="truncate text-base font-semibold text-foreground">{patient.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {[patient.documentId, patient.phone].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Este paciente aún no tiene historial de citas registrado.
        </div>
      ) : (
        // Same "Historial de citas" visual pattern being standardized across
        // Odentia — gray panel, vertical line, per-record dot marker, status
        // badge (see PatientHistoryPanel/HistoryEntry in appointment-detail-
        // modal.tsx and AtencionesTab in clinical-record-screen.tsx) — every
        // field renders inline, nothing truncated or hidden behind a tooltip,
        // since this page *is* the full history.
        <div className="rounded-xl bg-surface p-4">
          <ol className="flex flex-col gap-4 border-l border-border/70 pl-4">
            {history.map((item) => {
              const dentist = resolveDentist(item.dentistId);
              const dayLabel = WEEK_DAYS.find((d) => d.key === item.day)?.dateLabel ?? item.day;
              return (
                <li key={item.id} className="relative">
                  <span
                    className="absolute -left-[19px] top-1.5 size-1.5 rounded-full bg-muted-foreground/40 ring-4 ring-surface"
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-label-foreground">
                      {dayLabel} · {item.time}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${HISTORY_STATUS_BADGE_CLASS[item.status]}`}
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-label-foreground">
                    {dentist?.name ?? "Sin asignar"}
                    {item.room && ` · ${item.room}`}
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-foreground">{item.type ?? "Sin definir"}</p>
                  {item.notes && <p className="mt-1 text-sm text-foreground/80">{item.notes}</p>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
