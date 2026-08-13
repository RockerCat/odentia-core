"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangleIcon, CalendarIcon, PlusIcon, SearchIcon, UsersIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { DENTISTS, WEEK_APPOINTMENTS, WEEK_DAYS, type Appointment } from "@/features/dashboard/mock-data";
import { NewAppointmentModal } from "@/features/dashboard/new-appointment-modal";
import { getPatientVisitSummary, PATIENT_STATUS_LABELS, PATIENTS, type Patient, type PatientStatus } from "./mock-data";
import { NewPatientModal } from "./new-patient-modal";
import { PatientDetailModal } from "./patient-detail-modal";

export function PatientsScreen() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>(PATIENTS);
  const [appointments, setAppointments] = useState<Appointment[]>(WEEK_APPOINTMENTS);

  const [search, setSearch] = useState("");
  const [professionalFilter, setProfessionalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<PatientStatus | "">("");
  const [lastVisitFilter, setLastVisitFilter] = useState<"" | "recent" | "stale">("");

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [newAppointmentForName, setNewAppointmentForName] = useState<string | null>(null);

  const activeCount = patients.filter((p) => p.status === "active").length;
  const newThisMonthCount = patients.filter((p) => p.isNewThisMonth).length;
  const upcomingCount = patients.filter(
    (p) => getPatientVisitSummary(p, appointments, WEEK_DAYS).nextAppointment !== null,
  ).length;
  const staleCount = patients.filter((p) => p.noRecentVisit).length;

  const query = search.trim().toLowerCase();
  const filteredPatients = patients.filter((patient) => {
    const matchesSearch =
      !query ||
      [patient.name, patient.phone, patient.documentId].some((value) => value.toLowerCase().includes(query));
    const matchesProfessional = !professionalFilter || patient.usualDentistId === professionalFilter;
    const matchesStatus = !statusFilter || patient.status === statusFilter;
    const matchesLastVisit =
      !lastVisitFilter || (lastVisitFilter === "stale" ? Boolean(patient.noRecentVisit) : !patient.noRecentVisit);
    return matchesSearch && matchesProfessional && matchesStatus && matchesLastVisit;
  });

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) ?? null;

  const handleEditSelectedPatient = (patch: Partial<Patient>) => {
    setPatients((prev) => prev.map((p) => (p.id === selectedPatientId ? { ...p, ...patch } : p)));
  };

  const openNewAppointmentFor = (patientName: string) => {
    setSelectedPatientId(null);
    setNewAppointmentForName(patientName);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard icon={UsersIcon} value={String(activeCount)} label="Pacientes activos" />
        <KpiCard icon={PlusIcon} value={String(newThisMonthCount)} label="Nuevos este mes" />
        <KpiCard icon={CalendarIcon} value={String(upcomingCount)} label="Con cita próxima" />
        <KpiCard icon={AlertTriangleIcon} value={String(staleCount)} label="Sin atención +6 meses" />
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
          <button
            type="button"
            onClick={() => setShowNewPatient(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <PlusIcon className="size-4" />
            Nuevo paciente
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="w-full sm:w-44">
            <select
              value={professionalFilter}
              onChange={(e) => setProfessionalFilter(e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">Profesional: todos</option>
              {DENTISTS.map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentist.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-40">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PatientStatus | "")}
              className={FIELD_CLASS}
            >
              <option value="">Estado: todos</option>
              {(Object.keys(PATIENT_STATUS_LABELS) as PatientStatus[]).map((status) => (
                <option key={status} value={status}>
                  {PATIENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-52">
            <select
              value={lastVisitFilter}
              onChange={(e) => setLastVisitFilter(e.target.value as "" | "recent" | "stale")}
              className={FIELD_CLASS}
            >
              <option value="">Última atención: todas</option>
              <option value="recent">Con atención reciente</option>
              <option value="stale">Sin atención +6 meses</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)] gap-4 border-b border-border px-4 py-2.5 text-[11px] font-semibold tracking-wide text-label-foreground uppercase sm:grid">
          <span>Paciente</span>
          <span>Contacto</span>
          <span>Profesional habitual</span>
          <span>Última atención</span>
          <span>Próxima cita</span>
        </div>

        {filteredPatients.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No hay pacientes que coincidan con los filtros actuales.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filteredPatients.map((patient) => {
              const dentist = DENTISTS.find((d) => d.id === patient.usualDentistId);
              const { lastVisitLabel, nextAppointment } = getPatientVisitSummary(patient, appointments, WEEK_DAYS);
              const nextAppointmentDayLabel = nextAppointment
                ? (WEEK_DAYS.find((d) => d.key === nextAppointment.day)?.label ?? nextAppointment.day)
                : null;

              return (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPatientId(patient.id)}
                    className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left transition-colors hover:bg-primary/[0.03] sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)] sm:items-center sm:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={patient.name} initials={patient.initials} sizeClassName="size-9" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{patient.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{patient.documentId}</p>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs text-foreground/80 sm:text-sm">{patient.phone}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{patient.email || "Sin correo"}</p>
                    </div>
                    <p className="truncate text-xs text-foreground/80 sm:text-sm">{dentist?.name ?? "Sin asignar"}</p>
                    <p className="truncate text-xs text-muted-foreground sm:text-sm">{lastVisitLabel}</p>
                    {nextAppointment ? (
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground sm:text-sm">
                          {nextAppointmentDayLabel}, {nextAppointment.time}
                        </p>
                        {nextAppointment.type && (
                          <p className="truncate text-[11px] text-muted-foreground">{nextAppointment.type}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground sm:text-sm">Sin cita programada</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedPatient && (
        <PatientDetailModal
          patient={selectedPatient}
          appointments={appointments}
          dentists={DENTISTS}
          weekDays={WEEK_DAYS}
          onClose={() => setSelectedPatientId(null)}
          onEdit={handleEditSelectedPatient}
          onNewAppointment={() => openNewAppointmentFor(selectedPatient.name)}
          onViewHistory={() => {
            router.push(`/pacientes/${selectedPatient.id}/historia-clinica`);
            setSelectedPatientId(null);
          }}
        />
      )}

      {showNewPatient && (
        <NewPatientModal
          defaultDentistId={DENTISTS[0].id}
          onClose={() => setShowNewPatient(false)}
          onCreate={(created) => setPatients((prev) => [created, ...prev])}
        />
      )}

      {newAppointmentForName !== null && (
        <NewAppointmentModal
          dentists={DENTISTS}
          weekDays={WEEK_DAYS}
          existingAppointments={appointments}
          prefill={{ patientName: newAppointmentForName }}
          onClose={() => setNewAppointmentForName(null)}
          onCreate={(created) => {
            setAppointments((prev) => [...prev, created]);
            setNewAppointmentForName(null);
          }}
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
  icon: typeof CalendarIcon;
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
