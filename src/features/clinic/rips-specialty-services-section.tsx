"use client";

import { useState } from "react";
import { AlertTriangleIcon, CheckCircleIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/form-primitives";
import type { ReferenceValue } from "@/features/rips/catalog-data";
import { confirmClinicSpecialtyRipsServiceAction } from "@/features/clinic/rips-specialty-service-actions";
import {
  buildSpecialtyRipsServiceRows,
  type ConfirmedSpecialtyRipsService,
  type RelevantSpecialty,
  type SpecialtyRipsServiceRow,
  type SuggestedSpecialtyRipsService,
} from "@/features/clinic/rips-specialty-service-config";

// RIPS #A4 — "Servicios RIPS por especialidad", inside the same
// "Configuración RIPS" zone as RipsConfigSection (rips-config-section.tsx,
// same page, right below it) — /rips's own RIPS_SERVICE_CONFIGURATION_MISSING
// fixHref already points at "/clinica#rips", the anchor RipsConfigSection
// owns; this is a new, separate sibling section, never folded into that
// component's own single ready/not-ready NIT/REPS banner (getRipsClinicConfigStatus
// deliberately scopes itself to clinic/location only — this concern is
// per-specialty, not a single boolean).
//
// clinic_specialty_rips_services (the only EFFECTIVE configuration) is
// never written directly from here — every confirmation goes through
// confirmClinicSpecialtyRipsServiceAction -> confirm_clinic_specialty_rips_service()
// (SECURITY DEFINER RPC), which re-derives the caller's own clinic_id and
// re-validates the Servicio/Grupo pair against the official catalog
// itself. A global suggestion (specialty_rips_service_defaults) is shown
// for context/preselection ONLY — visiting this screen, or seeing a
// suggestion rendered, never writes anything; only an explicit "Confirmar
// configuración" click does.
export function RipsSpecialtyServicesSection({
  specialties,
  confirmedServices,
  suggestions,
  grupoServiciosOptions,
  serviciosOptions,
}: {
  specialties: RelevantSpecialty[];
  confirmedServices: ConfirmedSpecialtyRipsService[];
  suggestions: SuggestedSpecialtyRipsService[];
  grupoServiciosOptions: ReferenceValue[];
  serviciosOptions: ReferenceValue[];
}) {
  const [rows, setRows] = useState<SpecialtyRipsServiceRow[]>(() =>
    buildSpecialtyRipsServiceRows({ specialties, confirmed: confirmedServices, suggestions }),
  );
  // Only one row editable (manual Grupo/Servicio picker open) at a time —
  // same "one thing being edited" convention as ConsultoriosSection's own
  // rename-in-place below in this file's sibling sections.
  const [editingSpecialtyId, setEditingSpecialtyId] = useState<string | null>(null);
  const [draftGrupoCode, setDraftGrupoCode] = useState("");
  const [draftServicioCode, setDraftServicioCode] = useState("");
  const [confirmingSpecialtyId, setConfirmingSpecialtyId] = useState<string | null>(null);
  const [errorBySpecialtyId, setErrorBySpecialtyId] = useState<Record<string, string>>({});

  const grupoLabelByCode = new Map(grupoServiciosOptions.map((o) => [o.code, o.label]));
  const servicioLabelByCode = new Map(serviciosOptions.map((o) => [o.code, o.label]));
  const filteredServicios = draftGrupoCode ? serviciosOptions.filter((o) => o.parentCode === draftGrupoCode) : [];

  const startManualEdit = (specialtyId: string, initialGrupoCode = "", initialServicioCode = "") => {
    setEditingSpecialtyId(specialtyId);
    setDraftGrupoCode(initialGrupoCode);
    setDraftServicioCode(initialServicioCode);
    setErrorBySpecialtyId((prev) => ({ ...prev, [specialtyId]: "" }));
  };

  const cancelManualEdit = () => {
    setEditingSpecialtyId(null);
    setDraftGrupoCode("");
    setDraftServicioCode("");
  };

  // Shared by "Confirmar sugerencia" (the suggested Servicio's own code)
  // and the manual picker (whatever Servicio the admin just selected) —
  // both resolve the SAME way: the real rips_reference_values id behind a
  // Servicio code, from the already-loaded official catalog. Never sent
  // as a bare code to the server — confirm_clinic_specialty_rips_service()
  // takes the id itself.
  const confirm = async (specialtyId: string, servicioCode: string) => {
    const servicio = serviciosOptions.find((o) => o.code === servicioCode);
    if (!servicio || !servicio.parentCode) {
      setErrorBySpecialtyId((prev) => ({ ...prev, [specialtyId]: "Selecciona un Servicio RIPS válido." }));
      return;
    }

    setConfirmingSpecialtyId(specialtyId);
    setErrorBySpecialtyId((prev) => ({ ...prev, [specialtyId]: "" }));

    const outcome = await confirmClinicSpecialtyRipsServiceAction(specialtyId, servicio.id);

    setConfirmingSpecialtyId(null);

    if (outcome.status === "error") {
      setErrorBySpecialtyId((prev) => ({ ...prev, [specialtyId]: outcome.message }));
      return;
    }

    // Only updated AFTER the server confirms success — never before (see
    // this section's own header comment on why suggestions never
    // autosave). This is a reflection of a real, already-persisted write,
    // never an optimistic guess.
    setRows((prev) =>
      prev.map((row) =>
        row.specialtyId === specialtyId
          ? {
              ...row,
              status: "confirmed",
              confirmedGrupoCode: servicio.parentCode,
              confirmedServicioCode: servicio.code,
              suggestedGrupoCode: null,
              suggestedServicioCode: null,
            }
          : row,
      ),
    );
    if (editingSpecialtyId === specialtyId) cancelManualEdit();
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold">Servicios RIPS por especialidad</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Confirma cómo debe reportarse cada especialidad de tu clínica en RIPS.
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Todavía no tienes profesionales activos con especialidad asignada. Esta sección se completa
          automáticamente cuando tu equipo tenga especialidades configuradas en “Mi perfil profesional”.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((row) => {
            const isEditing = editingSpecialtyId === row.specialtyId;
            const isConfirming = confirmingSpecialtyId === row.specialtyId;
            const error = errorBySpecialtyId[row.specialtyId];

            return (
              <li key={row.specialtyId} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{row.specialtyName}</p>
                  {row.status === "confirmed" && (
                    <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                      Confirmado
                    </span>
                  )}
                  {row.status === "pending-with-suggestion" && (
                    <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                      Pendiente de confirmar
                    </span>
                  )}
                  {row.status === "pending-no-suggestion" && (
                    <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                      Sin sugerencia segura
                    </span>
                  )}
                </div>

                {row.status === "confirmed" && !isEditing && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <p className="text-muted-foreground">
                      {grupoLabelByCode.get(row.confirmedGrupoCode!) ?? row.confirmedGrupoCode} →{" "}
                      <span className="font-medium text-foreground">
                        {servicioLabelByCode.get(row.confirmedServicioCode!) ?? row.confirmedServicioCode}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => startManualEdit(row.specialtyId, row.confirmedGrupoCode ?? "", row.confirmedServicioCode ?? "")}
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      Cambiar
                    </button>
                  </div>
                )}

                {row.status === "pending-with-suggestion" && !isEditing && (
                  <div className="mt-2 flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                      Sugerencia de Odentia:{" "}
                      <span className="font-medium text-foreground">
                        {grupoLabelByCode.get(row.suggestedGrupoCode!) ?? row.suggestedGrupoCode} →{" "}
                        {servicioLabelByCode.get(row.suggestedServicioCode!) ?? row.suggestedServicioCode}
                      </span>
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={isConfirming}
                        onClick={() => confirm(row.specialtyId, row.suggestedServicioCode!)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isConfirming ? "Confirmando…" : "Confirmar configuración"}
                      </button>
                      <button
                        type="button"
                        disabled={isConfirming}
                        onClick={() => startManualEdit(row.specialtyId)}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
                      >
                        Elegir otro Servicio
                      </button>
                    </div>
                  </div>
                )}

                {row.status === "pending-no-suggestion" && !isEditing && (
                  <div className="mt-2 flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                      Odentia todavía no tiene una sugerencia segura para esta especialidad. Selecciona
                      manualmente el Grupo de servicios y el Servicio RIPS.
                    </p>
                    <button
                      type="button"
                      onClick={() => startManualEdit(row.specialtyId)}
                      className="w-fit rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
                    >
                      Seleccionar Grupo y Servicio
                    </button>
                  </div>
                )}

                {isEditing && (
                  <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
                    <select
                      value={draftGrupoCode}
                      onChange={(e) => {
                        setDraftGrupoCode(e.target.value);
                        setDraftServicioCode("");
                      }}
                      className={FIELD_CLASS}
                    >
                      <option value="">Grupo de servicios</option>
                      {grupoServiciosOptions.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={draftServicioCode}
                      onChange={(e) => setDraftServicioCode(e.target.value)}
                      disabled={!draftGrupoCode}
                      className={FIELD_CLASS}
                    >
                      <option value="">{draftGrupoCode ? "Servicio RIPS" : "Selecciona primero un grupo"}</option>
                      {filteredServicios.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-3 sm:col-span-2">
                      <button
                        type="button"
                        disabled={!draftServicioCode || isConfirming}
                        onClick={() => confirm(row.specialtyId, draftServicioCode)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isConfirming ? "Confirmando…" : "Confirmar configuración"}
                      </button>
                      <button
                        type="button"
                        disabled={isConfirming}
                        onClick={cancelManualEdit}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
                    <AlertTriangleIcon className="size-3.5 shrink-0" />
                    {error}
                  </p>
                )}
                {row.status === "confirmed" && !error && !isEditing && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                    <CheckCircleIcon className="size-3.5 shrink-0" />
                    Esta configuración se usará en las nuevas atenciones de esta especialidad.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
