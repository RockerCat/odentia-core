"use client";

import { useState } from "react";
import { PlusIcon, SearchIcon, UsersIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import type { Patient } from "./data";
import { NewPatientModal } from "./new-patient-modal";
import { PatientRecordModal } from "./patient-record-modal";

type PatientStatusFilter = "" | "active" | "inactive";

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

function initialsOf(patient: Patient): string {
  return `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase() || "?";
}

function isNewThisMonth(patient: Patient): boolean {
  const created = new Date(patient.createdAt);
  const now = new Date();
  return created.getUTCFullYear() === now.getUTCFullYear() && created.getUTCMonth() === now.getUTCMonth();
}

// Real /pacientes listing — clinicId/canCreatePatient come from the real
// membership resolved server-side (see src/app/pacientes/page.tsx), never
// from useRole()/RoleContext/the DEV role switcher (see CLAUDE.md task
// scope, section 3/15). "Profesional habitual" and "última atención"/
// "próxima cita" are gone entirely — patients belong to the Clinic, not a
// Dentist (see CLAUDE.md Domain Model), and no appointments table exists
// yet to back a visit history (see task scope, section 4: don't fabricate
// what has no real column).
export function PatientsScreen({
  initialPatients,
  clinicId,
  canCreatePatient,
}: {
  initialPatients: Patient[];
  clinicId: string | null;
  canCreatePatient: boolean;
}) {
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PatientStatusFilter>("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [showNewPatient, setShowNewPatient] = useState(false);

  const activeCount = patients.filter((p) => p.active).length;
  const newThisMonthCount = patients.filter(isNewThisMonth).length;

  const query = search.trim().toLowerCase();
  const filteredPatients = patients.filter((patient) => {
    const matchesSearch =
      !query ||
      [fullName(patient), patient.phone, patient.documentId].some((value) => (value ?? "").toLowerCase().includes(query));
    const matchesStatus = !statusFilter || (statusFilter === "active" ? patient.active : !patient.active);
    return matchesSearch && matchesStatus;
  });

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) ?? null;

  const handlePatientUpdated = (updated: Patient) => {
    setPatients((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <KpiCard icon={UsersIcon} value={String(activeCount)} label="Pacientes activos" />
        <KpiCard icon={PlusIcon} value={String(newThisMonthCount)} label="Nuevos este mes" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:max-w-sm sm:flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, teléfono o documento"
              className={`${FIELD_CLASS} pl-9`}
            />
          </div>
          {canCreatePatient && clinicId && (
            <button
              type="button"
              onClick={() => setShowNewPatient(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <PlusIcon className="size-4" />
              Nuevo paciente
            </button>
          )}
        </div>

        <div className="w-full sm:w-40">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PatientStatusFilter)}
            className={FIELD_CLASS}
          >
            <option value="">Estado: todos</option>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-4 border-b border-border px-4 py-2.5 text-[11px] font-semibold tracking-wide text-label-foreground uppercase sm:grid">
          <span>Paciente</span>
          <span>Contacto</span>
          <span>Estado</span>
        </div>

        {patients.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">Aún no hay pacientes registrados.</p>
            {canCreatePatient && clinicId ? (
              <button
                type="button"
                onClick={() => setShowNewPatient(true)}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <PlusIcon className="size-4" />
                Registrar paciente
              </button>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Tu rol no tiene permiso para registrar pacientes.
              </p>
            )}
          </div>
        ) : filteredPatients.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No hay pacientes que coincidan con los filtros actuales.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filteredPatients.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  onClick={() => setSelectedPatientId(patient.id)}
                  className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left transition-colors hover:bg-primary/[0.03] sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1fr)] sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar name={fullName(patient)} initials={initialsOf(patient)} sizeClassName="size-9" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{fullName(patient)}</p>
                      <p className="truncate text-xs text-muted-foreground">{patient.documentId || "Sin documento"}</p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs text-foreground/80 sm:text-sm">{patient.phone || "Sin teléfono"}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{patient.email || "Sin correo"}</p>
                  </div>
                  <span
                    className={`w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      patient.active ? "border-primary/25 bg-primary/10 text-primary" : "border-danger/25 bg-danger/10 text-danger"
                    }`}
                  >
                    {patient.active ? "Activo" : "Inactivo"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedPatient && (
        <PatientRecordModal
          patient={selectedPatient}
          canEditPatientData={canCreatePatient}
          onClose={() => setSelectedPatientId(null)}
          onUpdated={handlePatientUpdated}
        />
      )}

      {showNewPatient && clinicId && (
        <NewPatientModal
          clinicId={clinicId}
          onClose={() => setShowNewPatient(false)}
          onCreate={(created) => setPatients((prev) => [created, ...prev])}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof UsersIcon;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-background p-3.5 text-center">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-label-foreground">{label}</p>
    </div>
  );
}
