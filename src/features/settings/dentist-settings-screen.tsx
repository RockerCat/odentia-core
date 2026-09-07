"use client";

import { useEffect, useState } from "react";
import { BellIcon, CalendarIcon, FlagIcon, PlusIcon } from "@/components/shell/icons";
import { createClient } from "@/lib/supabase/client";
import { deleteAbsence, fetchAbsences, type Absence } from "./absences-data";
import { AusenciaModal } from "./ausencia-modal";
import { DENTIST_NOTIFICATION_DEFAULTS, DENTIST_NOTIFICATION_ITEMS, type DentistNotificationKey } from "./dentist-mock-data";
import { HorarioEditor } from "./horario-editor";
import { ToggleSwitch } from "./toggle-switch";

// Odontólogo > Configuración — distinct from the Clinic Admin's
// settings-screen.tsx: only her own Ausencias/Horario and personal
// notification preferences. No Agenda display settings, intervals,
// appointment duration, or regional preferences here — those are
// clinic-wide and already live in the Clinic Admin's screen.
//
// Ausencias/Horario are now real (professional_absences/
// professional_availability, see their own migrations) — always scoped to
// HER OWN professional_profile_id (no selector: she isn't picking among
// professionals, she IS the professional), enforced both by never passing
// another id down and by can_manage_professional_schedule's own RLS.
// Notificaciones stays mock/local (out of this task's scope — see task's
// own NO list: "no tocar notificaciones").
export function DentistSettingsScreen({
  clinicId,
  professionalProfileId,
}: {
  clinicId: string | null;
  professionalProfileId: string | null;
}) {
  const [absences, setAbsences] = useState<Absence[]>([]);
  // professionalProfileId is resolved server-side once and doesn't change
  // for the lifetime of this screen — starting the loading flag from it
  // directly avoids an effect having to reset it back to false on mount.
  const [loadingAbsences, setLoadingAbsences] = useState(() => professionalProfileId !== null);
  const [absencesError, setAbsencesError] = useState(false);
  const [modal, setModal] = useState<"closed" | "create" | Absence>("closed");
  const [notifications, setNotifications] = useState(DENTIST_NOTIFICATION_DEFAULTS);

  useEffect(() => {
    if (!professionalProfileId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const rows = await fetchAbsences(supabase, professionalProfileId);
        if (!cancelled) setAbsences(rows);
      } catch {
        if (!cancelled) setAbsencesError(true);
      } finally {
        if (!cancelled) setLoadingAbsences(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [professionalProfileId]);

  const toggleNotification = (key: DentistNotificationKey) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const outcome = await deleteAbsence(supabase, id);
    if (outcome.status === "ok") setAbsences((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">Preferencias personales de tu agenda y notificaciones.</p>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
        <AusenciasSection
          absences={absences}
          loading={loadingAbsences}
          loadError={absencesError}
          onDelete={handleDelete}
          onOpenModal={setModal}
          canManage={Boolean(clinicId && professionalProfileId)}
        />

        <NotificacionesSection notifications={notifications} onToggle={toggleNotification} />
      </div>

      {/* Full width, same reasoning as the Clinic Admin screen's own
          Ausencias/Tratamientos rows: a variable-length weekly schedule
          doesn't fit the fixed 2-column row above. */}
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarIcon className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Horario de atención</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Tu disponibilidad semanal recurrente.</p>
          </div>
        </div>
        {clinicId && professionalProfileId ? (
          <HorarioEditor clinicId={clinicId} professionalProfileId={professionalProfileId} canEdit />
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No pudimos cargar tu perfil profesional. Intenta de nuevo en unos minutos.
          </p>
        )}
      </div>

      {modal !== "closed" && clinicId && professionalProfileId && (
        <AusenciaModal
          clinicId={clinicId}
          professionalProfileId={professionalProfileId}
          editing={modal === "create" ? null : modal}
          onClose={() => setModal("closed")}
          onCreate={(absence) => setAbsences((prev) => [...prev, absence].sort((a, b) => a.startDate.localeCompare(b.startDate)))}
          onUpdate={(absence) => setAbsences((prev) => prev.map((a) => (a.id === absence.id ? absence : a)))}
        />
      )}
    </div>
  );
}

const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDateRangeLabel(startISO: string, endISO: string): string {
  const [startY, startM, startD] = startISO.split("-").map(Number);
  if (startISO === endISO) return `${startD} ${MONTH_LABELS[startM - 1]} ${startY}`;

  const [endY, endM, endD] = endISO.split("-").map(Number);
  if (startM === endM && startY === endY) {
    return `${startD} – ${endD} ${MONTH_LABELS[endM - 1]} ${endY}`;
  }
  return `${startD} ${MONTH_LABELS[startM - 1]} – ${endD} ${MONTH_LABELS[endM - 1]} ${endY}`;
}

function AusenciasSection({
  absences,
  loading,
  loadError,
  onDelete,
  onOpenModal,
  canManage,
}: {
  absences: Absence[];
  loading: boolean;
  loadError: boolean;
  onDelete: (id: string) => void;
  onOpenModal: (modal: "closed" | "create" | Absence) => void;
  canManage: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FlagIcon className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Ausencias programadas</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Excepciones temporales a tu disponibilidad habitual.</p>
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => onOpenModal("create")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
          >
            <PlusIcon className="size-3.5" />
            Nueva ausencia
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando ausencias…</p>
      ) : loadError ? (
        <p className="mt-4 text-xs text-danger">No pudimos cargar tus ausencias. Intenta de nuevo más tarde.</p>
      ) : absences.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No tienes ausencias programadas.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {absences.map((absence) => (
            <li key={absence.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{absence.reason || "Ausencia"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDateRangeLabel(absence.startDate, absence.endDate)}</p>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenModal(absence)}
                    className="text-xs font-medium text-primary hover:text-primary/80"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(absence.id)}
                    className="text-xs font-medium text-danger/80 hover:text-danger"
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificacionesSection({
  notifications,
  onToggle,
}: {
  notifications: Record<DentistNotificationKey, boolean>;
  onToggle: (key: DentistNotificationKey) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <BellIcon className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Mis notificaciones</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Preferencias personales de aviso.</p>
        </div>
      </div>

      <div className="mt-3 divide-y divide-border">
        {DENTIST_NOTIFICATION_ITEMS.map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
            </div>
            <div className="mt-0.5 shrink-0">
              <ToggleSwitch label={item.label} checked={notifications[item.key]} onChange={() => onToggle(item.key)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
