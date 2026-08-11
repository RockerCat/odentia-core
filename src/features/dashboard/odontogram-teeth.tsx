// Shared tooth data + SVG rendering for the odontogram — used by both the
// interactive modal (odontogram-modal.tsx) and the read-only card preview
// (ClinicalEncounterScreen), so the two never drift in shape or color.

export type ToothSurface = "oclusal" | "vestibular" | "palatina" | "mesial" | "distal";
export type FindingType = "caries" | "restauracion" | "ausente" | "otro";
export type ToothKind = "incisivo" | "canino" | "premolar" | "molar";

export type ToothFinding = {
  id: string;
  type: FindingType;
  surfaces: ToothSurface[];
  note: string;
};

// Keyed by FDI number (e.g. 16, 21, 48). Local/mock state only — see
// ClinicalEncounterScreen, which owns this and passes it down.
export type OdontogramData = Record<number, ToothFinding[]>;

// Adult (permanent) dentition only, FDI notation — matches the spec's
// required layout: 18→11 | 21→28 on top, 48→41 | 31→38 on the bottom.
export const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
export const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
export const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

export function getToothKind(fdi: number): ToothKind {
  const position = fdi % 10;
  if (position <= 2) return "incisivo";
  if (position === 3) return "canino";
  if (position <= 5) return "premolar";
  return "molar";
}

export const FINDING_TEXT_CLASS: Record<FindingType, string> = {
  caries: "text-danger",
  restauracion: "text-info",
  ausente: "text-muted-foreground",
  otro: "text-warning",
};

// Four reusable crown+root shapes, drawn directly as SVG paths (no assets,
// no icon library) — every FDI position maps to one of these via
// getToothKind. Upper-row cells flip this vertically so both arches point
// toward the bite line in the middle of the chart.
export function ToothGlyph({ kind, className }: { kind: ToothKind; className?: string }) {
  return (
    <svg viewBox="0 0 24 32" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      {kind === "incisivo" && (
        <>
          <path d="M8 2h8a3 3 0 0 1 3 3v8a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4V5a3 3 0 0 1 3-3Z" />
          <path d="M9.4 17h5.2l-1 12h-3.2z" opacity="0.5" />
        </>
      )}
      {kind === "canino" && (
        <>
          <path d="M12 2c2.7 0 4.5 1.7 5.5 4.1 1 2.2.3 4.6-1.3 6.3L13 15.6a1.3 1.3 0 0 1-2 0L7.8 12.4c-1.6-1.7-2.3-4.1-1.3-6.3C7.5 3.7 9.3 2 12 2Z" />
          <path d="M10.4 16h3.2l-.8 13h-1.6z" opacity="0.5" />
        </>
      )}
      {kind === "premolar" && (
        <>
          <path d="M6 4.5A3.5 3.5 0 0 1 9.5 1h5A3.5 3.5 0 0 1 18 4.5V11a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 6 11Z" />
          <path d="M12 3.5v11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.45" fill="none" />
          <path d="M9 17h6l-.9 12h-4.2z" opacity="0.5" />
        </>
      )}
      {kind === "molar" && (
        <>
          <path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6.5a6.5 6.5 0 0 1-6.5 6.5h-3A6.5 6.5 0 0 1 4 11.5Z" />
          <path
            d="M12 2.5v12.5M5.2 8.7h13.6"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.4"
            fill="none"
          />
          <path d="M7 18h10l-1 11.5H8z" opacity="0.5" />
        </>
      )}
    </svg>
  );
}

// Read-only, non-interactive rendering of the same 32 FDI positions and the
// same finding→color rules as the modal's tooth chart — no click handlers,
// no selection state. Small enough to sit inside the "Odontograma" card
// without horizontal scroll.
function PreviewTooth({ fdi, flipped, findings }: { fdi: number; flipped: boolean; findings: ToothFinding[] }) {
  const kind = getToothKind(fdi);
  const hasAusente = findings.some((f) => f.type === "ausente");
  const latest = findings[findings.length - 1];
  const colorClass = findings.length === 0 ? "text-foreground/25" : FINDING_TEXT_CLASS[latest.type];

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-medium leading-none text-muted-foreground">{fdi}</span>
      <ToothGlyph
        kind={kind}
        className={`h-7 w-5 ${colorClass} ${flipped ? "-scale-y-100" : ""} ${hasAusente ? "opacity-40" : ""}`}
      />
    </div>
  );
}

function PreviewRow({ fdiList, flipped, odontogram }: { fdiList: number[]; flipped: boolean; odontogram: OdontogramData }) {
  return (
    <div className="flex flex-1 justify-between gap-1">
      {fdiList.map((fdi) => (
        <PreviewTooth key={fdi} fdi={fdi} flipped={flipped} findings={odontogram[fdi] ?? []} />
      ))}
    </div>
  );
}

export function OdontogramPreview({ odontogram }: { odontogram: OdontogramData }) {
  return (
    <div className="flex flex-col items-center gap-5 overflow-x-auto py-1">
      <div className="flex w-full items-center gap-3">
        <PreviewRow fdiList={UPPER_RIGHT} flipped odontogram={odontogram} />
        <div className="h-9 w-px shrink-0 bg-border" aria-hidden="true" />
        <PreviewRow fdiList={UPPER_LEFT} flipped odontogram={odontogram} />
      </div>
      <div className="h-px w-full bg-border" aria-hidden="true" />
      <div className="flex w-full items-center gap-3">
        <PreviewRow fdiList={LOWER_RIGHT} flipped={false} odontogram={odontogram} />
        <div className="h-9 w-px shrink-0 bg-border" aria-hidden="true" />
        <PreviewRow fdiList={LOWER_LEFT} flipped={false} odontogram={odontogram} />
      </div>
    </div>
  );
}
