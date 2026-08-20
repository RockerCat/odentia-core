"use client";

import { useMemo, useState } from "react";
import { FlagIcon, PlusIcon, SearchIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { ADMIN_DENTIST_ID, DENTISTS, type Dentist } from "@/features/dashboard/mock-data";
import { CURRENT_USER } from "@/lib/current-user";
import { formatClockLabel } from "@/lib/format";
import { AusenciaModal } from "./ausencia-modal";
import { ABSENCES_BY_DENTIST, type Absence } from "./dentist-mock-data";

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

function formatTimeRangeLabel(startTime: string, endTime: string): string {
  const [startH, startMin] = startTime.split(":").map(Number);
  const [endH, endMin] = endTime.split(":").map(Number);
  const start = formatClockLabel(new Date(2000, 0, 1, startH, startMin));
  const end = formatClockLabel(new Date(2000, 0, 1, endH, endMin));
  return `${start} – ${end}`;
}

// Ausencias programadas, added to the Clinic Admin's Configuración — same
// visual design as the Odontólogo's own AusenciasSection (see
// dentist-settings-screen.tsx), but scoped by a Profesionales list instead
// of the logged-in dentist: the Admin manages any dentist's absences,
// never an Assistant's (see task scope). Desktop: 2-column layout (~33%
// list / ~67% ausencias); tablet/mobile: stacked. Reuses AusenciaModal
// as-is rather than duplicating it.
export function AusenciasAdminSection() {
  const { adminProfessionalProfile, adminIdentityOverride } = useRole();

  const dentists = useMemo<Dentist[]>(() => {
    if (!adminProfessionalProfile) return DENTISTS;
    // Same "admin who also practices" synthetic entry used by Agenda's own
    // dentist list (see appointments-card.tsx) — additive, appended after
    // the real DENTISTS, never replacing one.
    const adminDentistEntry: Dentist = {
      id: ADMIN_DENTIST_ID,
      name: adminIdentityOverride.name ?? CURRENT_USER.name,
      initials: CURRENT_USER.initials,
      specialty: adminProfessionalProfile.specialty,
      avatar_url: adminIdentityOverride.avatar_url ?? CURRENT_USER.avatar_url,
    };
    return [...DENTISTS, adminDentistEntry];
  }, [adminProfessionalProfile, adminIdentityOverride]);

  // Auto-selects the first dentist in the list on load (see task scope).
  const [selectedDentistId, setSelectedDentistId] = useState(dentists[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [absencesByDentist, setAbsencesByDentist] = useState<Record<string, Absence[]>>(ABSENCES_BY_DENTIST);
  const [modal, setModal] = useState<"closed" | "create" | Absence>("closed");

  const filteredDentists = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return dentists;
    return dentists.filter((dentist) => `${dentist.name} ${dentist.specialty}`.toLowerCase().includes(query));
  }, [dentists, search]);

  const selectedDentist = dentists.find((dentist) => dentist.id === selectedDentistId) ?? null;
  const absences = selectedDentistId ? (absencesByDentist[selectedDentistId] ?? []) : [];

  const updateAbsences = (updater: (prev: Absence[]) => Absence[]) => {
    if (!selectedDentistId) return;
    setAbsencesByDentist((prev) => ({ ...prev, [selectedDentistId]: updater(prev[selectedDentistId] ?? []) }));
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FlagIcon className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Ausencias programadas</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Excepciones temporales a la disponibilidad habitual de cada odontólogo.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
        {/* Profesionales — ~33% on desktop, stacked above Ausencias on
            tablet/mobile (see task scope). Dentists-only, never
            Asistentes — same "avatar + nombre + especialidad" pattern
            approved for ProfessionalSelect, but as a persistent filterable
            list instead of a dropdown. */}
        <div className="lg:w-[33%] lg:shrink-0">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar profesional…"
              className={`${FIELD_CLASS} pl-8`}
            />
          </div>

          <ul className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto">
            {filteredDentists.map((dentist) => {
              const isSelected = dentist.id === selectedDentistId;
              const isSelf = dentist.id === ADMIN_DENTIST_ID;
              return (
                <li key={dentist.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedDentistId(dentist.id)}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      isSelected ? "border-primary/30 bg-primary/10" : "border-transparent hover:bg-foreground/5"
                    }`}
                  >
                    <UserAvatar
                      name={dentist.name}
                      initials={dentist.initials}
                      avatar_url={dentist.avatar_url}
                      sizeClassName="size-8"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{dentist.name}</span>
                        {isSelf && (
                          <span className="shrink-0 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[9px] font-semibold text-foreground/70">
                            Tú
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{dentist.specialty}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {filteredDentists.length === 0 && (
              <li className="px-2.5 py-6 text-center text-xs text-muted-foreground">Sin resultados.</li>
            )}
          </ul>
        </div>

        {/* Ausencias — ~67% on desktop */}
        <div className="min-w-0 flex-1">
          {!selectedDentist ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Selecciona un odontólogo para ver y gestionar sus ausencias.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <UserAvatar
                    name={selectedDentist.name}
                    initials={selectedDentist.initials}
                    avatar_url={selectedDentist.avatar_url}
                    sizeClassName="size-9"
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{selectedDentist.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedDentist.specialty}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModal("create")}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
                >
                  <PlusIcon className="size-3.5" />
                  Nueva ausencia
                </button>
              </div>

              {absences.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No hay ausencias programadas.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {absences.map((absence) => (
                    <li key={absence.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{absence.reason}</p>
                          <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground">
                            Próxima
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateRangeLabel(absence.startDate, absence.endDate)} ·{" "}
                          {absence.allDay
                            ? "Todo el día"
                            : formatTimeRangeLabel(absence.startTime ?? "00:00", absence.endTime ?? "00:00")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setModal(absence)}
                          className="text-xs font-medium text-primary hover:text-primary/80"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => updateAbsences((prev) => prev.filter((a) => a.id !== absence.id))}
                          className="text-xs font-medium text-danger/80 hover:text-danger"
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {modal !== "closed" && selectedDentistId && (
        <AusenciaModal
          editing={modal === "create" ? null : modal}
          onClose={() => setModal("closed")}
          onCreate={(absence) => updateAbsences((prev) => [...prev, absence])}
          onUpdate={(absence) => updateAbsences((prev) => prev.map((a) => (a.id === absence.id ? absence : a)))}
        />
      )}
    </div>
  );
}
