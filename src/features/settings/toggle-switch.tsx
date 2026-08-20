"use client";

// Shared by the Dentist's Configuración screen (Ausencia modal + Mis
// notificaciones) — see dentist-settings-screen.tsx / ausencia-modal.tsx.
// Not reused by the Clinic Admin's settings-screen.tsx, which keeps its own
// local copy (no shared toggle component existed before this feature).
export function ToggleSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-foreground/15"
      }`}
    >
      <span
        className={`inline-block size-4 transform rounded-full bg-background shadow-sm transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
