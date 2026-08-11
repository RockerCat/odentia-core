"use client"; // owns tooth selection + finding draft, purely local UI state

import { useState } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "./appointment-detail-modal";
import type { FindingType, OdontogramData, ToothFinding, ToothSurface } from "./odontogram-teeth";
import { FINDING_TEXT_CLASS, getToothKind, LOWER_LEFT, LOWER_RIGHT, ToothGlyph, UPPER_LEFT, UPPER_RIGHT } from "./odontogram-teeth";

const FINDING_OPTIONS: { value: FindingType; label: string }[] = [
  { value: "caries", label: "Caries" },
  { value: "restauracion", label: "Restauración existente" },
  { value: "ausente", label: "Ausente" },
  { value: "otro", label: "Otro" },
];

const SURFACE_OPTIONS: { value: ToothSurface; label: string }[] = [
  { value: "oclusal", label: "Oclusal/Incisal" },
  { value: "vestibular", label: "Vestibular" },
  { value: "palatina", label: "Palatina/Lingual" },
  { value: "mesial", label: "Mesial" },
  { value: "distal", label: "Distal" },
];

const FINDING_DOT_CLASS: Record<FindingType, string> = {
  caries: "bg-danger",
  restauracion: "bg-info",
  ausente: "bg-muted-foreground",
  otro: "bg-warning",
};

const FINDING_BADGE_CLASS: Record<FindingType, string> = {
  caries: "border-danger/25 bg-danger/10 text-danger",
  restauracion: "border-info/25 bg-info/10 text-info",
  ausente: "border-muted-foreground/25 bg-muted-foreground/10 text-muted-foreground",
  otro: "border-warning/25 bg-warning/10 text-warning",
};

const FINDING_LABEL: Record<FindingType, string> = {
  caries: "Caries",
  restauracion: "Restauración existente",
  ausente: "Ausente",
  otro: "Otro",
};

const SURFACE_LABEL: Record<ToothSurface, string> = {
  oclusal: "Oclusal/Incisal",
  vestibular: "Vestibular",
  palatina: "Palatina/Lingual",
  mesial: "Mesial",
  distal: "Distal",
};

function ToothCell({
  fdi,
  flipped,
  isSelected,
  findings,
  onSelect,
}: {
  fdi: number;
  flipped: boolean;
  isSelected: boolean;
  findings: ToothFinding[];
  onSelect: () => void;
}) {
  const kind = getToothKind(fdi);
  const hasAusente = findings.some((f) => f.type === "ausente");
  const latest = findings[findings.length - 1];
  const colorClass = findings.length === 0 ? "text-foreground/25" : FINDING_TEXT_CLASS[latest.type];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`Pieza ${fdi}${findings.length > 0 ? `, ${findings.length} hallazgo(s) registrado(s)` : ""}`}
      className={`relative flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition-colors ${
        isSelected ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-foreground/5"
      }`}
    >
      {findings.length > 1 && (
        <span className="absolute -top-0.5 right-0 flex size-3.5 items-center justify-center rounded-full bg-foreground/70 text-[8px] font-semibold text-background">
          {findings.length}
        </span>
      )}
      <span className={`text-[10px] font-medium ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
        {fdi}
      </span>
      <ToothGlyph
        kind={kind}
        className={`h-9 w-6 ${colorClass} ${flipped ? "-scale-y-100" : ""} ${hasAusente ? "opacity-40" : ""}`}
      />
    </button>
  );
}

function ToothRow({
  fdiList,
  flipped,
  selectedFdi,
  odontogram,
  onSelect,
}: {
  fdiList: number[];
  flipped: boolean;
  selectedFdi: number | null;
  odontogram: OdontogramData;
  onSelect: (fdi: number) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {fdiList.map((fdi) => (
        <ToothCell
          key={fdi}
          fdi={fdi}
          flipped={flipped}
          isSelected={selectedFdi === fdi}
          findings={odontogram[fdi] ?? []}
          onSelect={() => onSelect(fdi)}
        />
      ))}
    </div>
  );
}

export function OdontogramModal({
  patientName,
  odontogram,
  onChange,
  onClose,
}: {
  patientName: string;
  odontogram: OdontogramData;
  onChange: (data: OdontogramData) => void;
  onClose: () => void;
}) {
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);
  const [draftType, setDraftType] = useState<FindingType | null>(null);
  const [draftSurfaces, setDraftSurfaces] = useState<ToothSurface[]>([]);
  const [draftNote, setDraftNote] = useState("");

  const resetDraft = () => {
    setDraftType(null);
    setDraftSurfaces([]);
    setDraftNote("");
  };

  const handleSelectTooth = (fdi: number) => {
    setSelectedFdi((prev) => (prev === fdi ? null : fdi));
    resetDraft();
  };

  const toggleSurface = (surface: ToothSurface) => {
    setDraftSurfaces((prev) => (prev.includes(surface) ? prev.filter((s) => s !== surface) : [...prev, surface]));
  };

  const handleRegister = () => {
    if (selectedFdi === null || !draftType) return;
    const finding: ToothFinding = {
      id: `${selectedFdi}-${Date.now()}`,
      type: draftType,
      surfaces: draftSurfaces,
      note: draftNote.trim(),
    };
    onChange({ ...odontogram, [selectedFdi]: [...(odontogram[selectedFdi] ?? []), finding] });
    resetDraft();
  };

  const handleRemoveFinding = (fdi: number, findingId: string) => {
    const remaining = (odontogram[fdi] ?? []).filter((f) => f.id !== findingId);
    const next = { ...odontogram };
    if (remaining.length === 0) delete next[fdi];
    else next[fdi] = remaining;
    onChange(next);
  };

  const selectedFindings = selectedFdi !== null ? (odontogram[selectedFdi] ?? []) : [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Odontograma"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-background shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold">Odontograma</h2>
            <p className="text-xs text-muted-foreground">{patientName} · Dentición adulta (FDI)</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar odontograma"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-5 overflow-x-auto rounded-xl border border-border bg-surface px-4 py-6">
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[11px] font-medium text-label-foreground">Superior</span>
                  <div className="flex items-center gap-2">
                    <ToothRow
                      fdiList={UPPER_RIGHT}
                      flipped
                      selectedFdi={selectedFdi}
                      odontogram={odontogram}
                      onSelect={handleSelectTooth}
                    />
                    <div className="h-9 w-px shrink-0 bg-border" />
                    <ToothRow
                      fdiList={UPPER_LEFT}
                      flipped
                      selectedFdi={selectedFdi}
                      odontogram={odontogram}
                      onSelect={handleSelectTooth}
                    />
                  </div>
                </div>

                <div className="h-px w-full max-w-md bg-border" aria-hidden="true" />

                <div className="flex flex-col items-center gap-1.5">
                  <div className="flex items-center gap-2">
                    <ToothRow
                      fdiList={LOWER_RIGHT}
                      flipped={false}
                      selectedFdi={selectedFdi}
                      odontogram={odontogram}
                      onSelect={handleSelectTooth}
                    />
                    <div className="h-9 w-px shrink-0 bg-border" />
                    <ToothRow
                      fdiList={LOWER_LEFT}
                      flipped={false}
                      selectedFdi={selectedFdi}
                      odontogram={odontogram}
                      onSelect={handleSelectTooth}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-label-foreground">Inferior</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-[11px] text-muted-foreground">
                {FINDING_OPTIONS.map((opt) => (
                  <span key={opt.value} className="flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${FINDING_DOT_CLASS[opt.value]}`} aria-hidden="true" />
                    {opt.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col">
              {selectedFdi === null ? (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Selecciona una pieza para registrar un hallazgo.
                </div>
              ) : (
                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Pieza {selectedFdi}</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedFdi(null)}
                      aria-label="Cerrar selección"
                      className="text-muted-foreground/60 hover:text-foreground"
                    >
                      <CloseIcon className="size-3.5" />
                    </button>
                  </div>

                  {selectedFindings.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {selectedFindings.map((finding) => (
                        <li
                          key={finding.id}
                          className={`flex items-start justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${FINDING_BADGE_CLASS[finding.type]}`}
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{FINDING_LABEL[finding.type]}</p>
                            {finding.surfaces.length > 0 && (
                              <p className="opacity-80">{finding.surfaces.map((s) => SURFACE_LABEL[s]).join(", ")}</p>
                            )}
                            {finding.note && <p className="mt-0.5 opacity-80">{finding.note}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFinding(selectedFdi, finding.id)}
                            aria-label="Eliminar hallazgo"
                            className="shrink-0 opacity-60 hover:opacity-100"
                          >
                            <CloseIcon className="size-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3.5">
                    <div>
                      <span className="text-[11px] text-label-foreground">Hallazgo</span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {FINDING_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDraftType(opt.value)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                              draftType === opt.value
                                ? FINDING_BADGE_CLASS[opt.value]
                                : "border-border text-foreground/70 hover:bg-foreground/5"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-label-foreground">Superficies</span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {SURFACE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggleSurface(opt.value)}
                            aria-pressed={draftSurfaces.includes(opt.value)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                              draftSurfaces.includes(opt.value)
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-border text-foreground/70 hover:bg-foreground/5"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] text-label-foreground" htmlFor="odontogram-note">
                        Observación (opcional)
                      </label>
                      <input
                        id="odontogram-note"
                        type="text"
                        value={draftNote}
                        onChange={(e) => setDraftNote(e.target.value)}
                        placeholder="Detalle adicional…"
                        className={`${FIELD_CLASS} mt-1`}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleRegister}
                      disabled={!draftType}
                      className="mt-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Registrar hallazgo
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
