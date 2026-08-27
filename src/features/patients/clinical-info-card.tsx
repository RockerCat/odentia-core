// Shared card used by both Resumen (see resumen-tab.tsx) and Antecedentes
// (see antecedentes-tab.tsx) — the approved demo (clinical-record-screen.tsx)
// used two visually-identical components for this exact same card shape
// (ClinicalKpiCard in ResumenTab, AnamnesisBlock in AntecedentesTab); now
// that both tabs are real and share one component, extracting it once
// avoids a third copy drifting from the approved design.
export function ClinicalInfoCard({
  icon: Icon,
  label,
  value,
  // Only "Notas clínicas importantes" in the approved design sets this —
  // a preventive readability bump for longer free text. Every other card
  // keeps the default (already correct: no fixed height/line-clamp, wraps
  // and grows naturally, grid stretch equalizes row heights).
  relaxedLeading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  relaxedLeading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <p className="text-xs text-label-foreground">{label}</p>
      </div>
      <p className={`mt-2 text-sm font-medium break-words text-foreground ${relaxedLeading ? "leading-relaxed" : ""}`}>
        {value}
      </p>
    </div>
  );
}
