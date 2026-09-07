"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, PlusIcon, SearchIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import type { TeamMember } from "@/features/clinic/data";
import { createClient } from "@/lib/supabase/client";
import { deleteAbsence, fetchAbsences, type Absence } from "./absences-data";
import { AusenciaModal } from "./ausencia-modal";
import { HorarioEditor } from "./horario-editor";

// Real Horario + Ausencias, added to the Clinic Admin's Configuración —
// replaces the old mock ausencias-admin-section.tsx (useEffectiveDentists/
// ABSENCES_BY_DENTIST). ONE professional selector shared by both sections
// below (see task scope: "reutilizar selector de profesionales ya
// existente" — Ausencias already had this list/search UI; Horario reuses
// the exact same selection instead of building a second one). `dentists`
// here means every active clinical professional in the clinic — a real
// Dentist row OR a Clinic Admin who has her own professional_profile (the
// "Administrador Odontólogo" case) — never an Assistant, which has none.
//
// clinic_admin can manage ANY of these (including her own row) —
// can_manage_professional_schedule's own RLS already grants that
// unconditionally for clinic_admin, so no extra "is this me" branching is
// needed here the way the old mock's ADMIN_DENTIST_ID check needed.
export function DisponibilidadAdminSection({ clinicId, professionals }: { clinicId: string; professionals: TeamMember[] }) {
  const [selectedIdState, setSelectedId] = useState(professionals[0]?.professionalProfile?.id ?? "");
  const selectedId = professionals.some((p) => p.professionalProfile?.id === selectedIdState)
    ? selectedIdState
    : (professionals[0]?.professionalProfile?.id ?? "");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return professionals;
    return professionals.filter((p) =>
      `${p.firstName} ${p.lastName} ${p.professionalProfile?.specialtyName ?? ""}`.toLowerCase().includes(query),
    );
  }, [professionals, search]);

  const selected = professionals.find((p) => p.professionalProfile?.id === selectedId) ?? null;
  const soloClinic = professionals.length === 1;

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CalendarIcon className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Horario y ausencias</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {soloClinic
              ? "Tu disponibilidad semanal y excepciones temporales."
              : "Disponibilidad semanal y excepciones temporales de cada odontólogo."}
          </p>
        </div>
      </div>

      {professionals.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Todavía no hay odontólogos con perfil profesional en esta clínica.
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
          {!soloClinic && (
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
                {filtered.map((p) => {
                  const id = p.professionalProfile?.id ?? "";
                  const isSelected = id === selectedId;
                  const name = `${p.firstName} ${p.lastName}`.trim() || p.email;
                  const initials = `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase() || p.email[0]?.toUpperCase() || "?";
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(id)}
                        aria-pressed={isSelected}
                        className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                          isSelected ? "border-primary/30 bg-primary/10" : "border-transparent hover:bg-foreground/5"
                        }`}
                      >
                        <UserAvatar name={name} initials={initials} avatar_url={p.avatarUrl ?? undefined} sizeClassName="size-8" />
                        <span className="min-w-0 flex-1">
                          <span className="truncate text-sm font-medium text-foreground">{name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.professionalProfile?.specialtyName ?? "Sin especialidad"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {filtered.length === 0 && <li className="px-2.5 py-6 text-center text-xs text-muted-foreground">Sin resultados.</li>}
              </ul>
            </div>
          )}

          <div className="min-w-0 flex-1">
            {!selected || !selected.professionalProfile ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Selecciona un odontólogo para ver y gestionar su horario y ausencias.
              </p>
            ) : (
              <ProfessionalSchedulePanel
                key={selected.professionalProfile.id}
                clinicId={clinicId}
                professionalProfileId={selected.professionalProfile.id}
                name={`${selected.firstName} ${selected.lastName}`.trim() || selected.email}
                specialty={selected.professionalProfile.specialtyName}
                avatarUrl={selected.avatarUrl}
                showHeader={!soloClinic}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDateRangeLabel(startISO: string, endISO: string): string {
  const [startY, startM, startD] = startISO.split("-").map(Number);
  if (startISO === endISO) return `${startD} ${MONTH_LABELS[startM - 1]} ${startY}`;
  const [endY, endM, endD] = endISO.split("-").map(Number);
  if (startM === endM && startY === endY) return `${startD} – ${endD} ${MONTH_LABELS[endM - 1]} ${endY}`;
  return `${startD} ${MONTH_LABELS[startM - 1]} – ${endD} ${MONTH_LABELS[endM - 1]} ${endY}`;
}

// Horario + Ausencias for ONE selected professional — the right-hand panel
// (or the whole card, in a solo-practitioner clinic). key={professionalProfileId}
// on the caller side remounts this fresh on every selection change, so its
// own Ausencias fetch effect below never needs the id in a dependency
// array beyond its own mount.
function ProfessionalSchedulePanel({
  clinicId,
  professionalProfileId,
  name,
  specialty,
  avatarUrl,
  showHeader,
}: {
  clinicId: string;
  professionalProfileId: string;
  name: string;
  specialty: string | null;
  avatarUrl: string | null;
  showHeader: boolean;
}) {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modal, setModal] = useState<"closed" | "create" | Absence>("closed");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const rows = await fetchAbsences(supabase, professionalProfileId);
        if (!cancelled) setAbsences(rows);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [professionalProfileId]);

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const outcome = await deleteAbsence(supabase, id);
    if (outcome.status === "ok") setAbsences((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div>
      {showHeader && (
        <div className="flex items-center gap-2.5">
          <UserAvatar name={name} initials={name[0]?.toUpperCase() ?? "?"} avatar_url={avatarUrl ?? undefined} sizeClassName="size-9" />
          <div>
            <p className="text-sm font-semibold text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground">{specialty ?? "Sin especialidad"}</p>
          </div>
        </div>
      )}

      <div className={showHeader ? "mt-5" : ""}>
        <h3 className="text-sm font-semibold">Horario de atención</h3>
        <HorarioEditor clinicId={clinicId} professionalProfileId={professionalProfileId} canEdit />
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Ausencias programadas</h3>
          <button
            type="button"
            onClick={() => setModal("create")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
          >
            <PlusIcon className="size-3.5" />
            Nueva ausencia
          </button>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Cargando ausencias…</p>
        ) : loadError ? (
          <p className="mt-3 text-xs text-danger">No pudimos cargar las ausencias. Intenta de nuevo más tarde.</p>
        ) : absences.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No hay ausencias programadas.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {absences.map((absence) => (
              <li key={absence.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{absence.reason || "Ausencia"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatDateRangeLabel(absence.startDate, absence.endDate)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button type="button" onClick={() => setModal(absence)} className="text-xs font-medium text-primary hover:text-primary/80">
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(absence.id)}
                    className="text-xs font-medium text-danger/80 hover:text-danger"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal !== "closed" && (
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
