"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import type { CommercialProspectListItem } from "@/features/commercial-prospects/platform-data";
import { COMMERCIAL_PROSPECT_STATUS_LABELS, type CommercialProspectStatus } from "@/features/commercial-prospects/state-machine";
import { ProspectStatusBadge } from "./prospect-status-badge";

type StatusFilter = "" | CommercialProspectStatus;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "new", label: COMMERCIAL_PROSPECT_STATUS_LABELS.new },
  { value: "contacted", label: COMMERCIAL_PROSPECT_STATUS_LABELS.contacted },
  { value: "demo_scheduled", label: COMMERCIAL_PROSPECT_STATUS_LABELS.demo_scheduled },
  { value: "demo_completed", label: COMMERCIAL_PROSPECT_STATUS_LABELS.demo_completed },
  { value: "won", label: COMMERCIAL_PROSPECT_STATUS_LABELS.won },
  { value: "lost", label: COMMERCIAL_PROSPECT_STATUS_LABELS.lost },
];

// Platform → Prospectos listing — same "fetch once server-side, filter
// client-side in memory" shape as /pacientes' own PatientsScreen (see
// that component's own search/statusFilter). No new search/pagination
// infrastructure: commercial_prospects has no dedicated search index and
// this checkpoint's expected volume doesn't warrant one (see
// fetchCommercialProspects' own comment on its fixed cap).
export function ProspectsTable({ prospects }: { prospects: CommercialProspectListItem[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return prospects.filter((prospect) => {
      const matchesSearch =
        !query ||
        [prospect.firstName, prospect.lastName, prospect.clinicName, prospect.email, prospect.phone, prospect.city].some(
          (value) => value.toLowerCase().includes(query),
        );
      const matchesStatus = !statusFilter || prospect.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [prospects, query, statusFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-sm sm:flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, clínica, email, teléfono o ciudad"
            className={`${FIELD_CLASS} pl-9`}
          />
        </div>
        <div className="w-full sm:w-56">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={FIELD_CLASS}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        {prospects.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Todavía no hay solicitudes. Las que se envíen desde el formulario público (/demo) aparecerán aquí.
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Ningún prospecto coincide con la búsqueda o el filtro actual.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-wide text-label-foreground uppercase">
                <th className="px-6 py-3">Prospecto</th>
                <th className="px-6 py-3">Clínica</th>
                <th className="px-6 py-3">Ciudad</th>
                <th className="px-6 py-3">Contacto</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3">Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((prospect) => (
                <tr key={prospect.id} className="border-b border-border last:border-0 hover:bg-foreground/5">
                  <td className="px-6 py-3">
                    <Link
                      href={`/platform/prospects/${prospect.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {prospect.firstName} {prospect.lastName}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">{prospect.clinicName}</td>
                  <td className="px-6 py-3 text-muted-foreground">{prospect.city}</td>
                  <td className="px-6 py-3 text-muted-foreground">
                    <div className="flex flex-col">
                      <span>{prospect.email}</span>
                      <span>{prospect.phone}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <ProspectStatusBadge status={prospect.status} />
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {new Date(prospect.createdAt).toLocaleDateString("es-CO")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
