"use client";

import { useState, type ComponentType } from "react";
import { BuildingIcon, CheckCircleIcon, ToothIcon } from "@/components/shell/icons";
import { INPUT_CLASS } from "./field-classes";
import type { RoleFormData, WorkMode } from "./types";

type IconProps = { className?: string };

const DURATION_OPTIONS: { value: RoleFormData["appointmentDuration"]; label: string }[] = [
  { value: "15", label: "15 minutos" },
  { value: "30", label: "30 minutos" },
  { value: "45", label: "45 minutos" },
  { value: "60", label: "60 minutos" },
];

export function RoleStep({
  initial,
  submitting,
  onBack,
  onSubmit,
}: {
  initial: RoleFormData;
  submitting: boolean;
  onBack: () => void;
  onSubmit: (data: RoleFormData) => void;
}) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<RoleFormData>) => setData((prev) => ({ ...prev, ...patch }));

  const selectMode = (mode: WorkMode) => {
    update({ workMode: mode });
    setError(null);
  };

  const handleSubmit = () => {
    if (!data.workMode) {
      setError("Selecciona cómo trabajarás en Odentia.");
      return;
    }
    onSubmit(data);
  };

  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground">¿Cómo trabajarás en Odentia?</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Esto nos ayuda a configurar tu espacio inicial en Odentia.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RoleCard
          icon={ToothIcon}
          title="Administro la clínica y también atiendo pacientes"
          description="Tendrás acceso a la administración y también aparecerás como profesional en la agenda."
          selected={data.workMode === "admin-dentist"}
          onSelect={() => selectMode("admin-dentist")}
        />
        <RoleCard
          icon={BuildingIcon}
          title="Solo administraré la clínica"
          description="Gestionarás agenda, pacientes, equipo y configuración sin aparecer como profesional tratante."
          selected={data.workMode === "admin-only"}
          onSelect={() => selectMode("admin-only")}
        />
      </div>

      {data.workMode === "admin-dentist" && (
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
          <label htmlFor="registrationNumber" className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground/80">Número de registro profesional</span>
            <input
              id="registrationNumber"
              className={INPUT_CLASS}
              value={data.registrationNumber}
              onChange={(e) => update({ registrationNumber: e.target.value })}
              placeholder="Opcional"
            />
          </label>
          <label htmlFor="appointmentDuration" className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground/80">Duración habitual de cita</span>
            <select
              id="appointmentDuration"
              className={INPUT_CLASS}
              value={data.appointmentDuration}
              onChange={(e) =>
                update({ appointmentDuration: e.target.value as RoleFormData["appointmentDuration"] })
              }
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-60"
        >
          Atrás
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Creando tu clínica…" : "Crear mi clínica"}
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        1 mes gratis · Sin compromiso · Sin tarjeta requerida
      </p>
    </div>
  );
}

function RoleCard({
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
}: {
  icon: ComponentType<IconProps>;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/30"
      }`}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
            selected ? "bg-primary/15 text-primary" : "bg-foreground/5 text-foreground/60"
          }`}
        >
          <Icon className="size-4" />
        </span>
        {selected && <CheckCircleIcon className="size-5 shrink-0 text-primary" />}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}
