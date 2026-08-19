// Plain hex mirror of the app's own CSS custom properties (see
// src/app/globals.css) — react-pdf has no CSS engine, so these are the
// literal values behind var(--foreground) etc., not a second palette.
export const PDF_COLORS = {
  background: "#ffffff",
  foreground: "#2b303b",
  surface: "#f7f8fa",
  border: "#e9ebee",
  mutedForeground: "#6b7280",
  labelForeground: "#9ca3af",
  primary: "#3eb0a0",
  primaryForeground: "#ffffff",
  success: "#137048",
  warning: "#ff9200",
  danger: "#c0392b",
  info: "#2f6fb0",
  noshow: "#c2660c",
  // No on-screen equivalent (Tailwind's own gray-300) — only used for an
  // odontograma tooth with no findings, matching that case's on-screen
  // "text-foreground/25" opacity treatment with a real flat color instead.
  toothNeutral: "#d3d6dc",
  // Pale flat tints for highlighted panels (Alertas clínicas, the
  // odontograma's protagonist frame) — precomputed hex, not rgba(), so
  // there's no runtime alpha-compositing to get wrong. ~6-8% of primary/
  // danger over white, matching the reference document's own restrained
  // tinted-panel treatment.
  primaryTint: "#eef8f6",
  dangerTint: "#fbeeec",
} as const;

// Same semantic status colors used across Odentia's history/badge patterns
// (see HISTORY_STATUS_BADGE_CLASS in dashboard/mock-data.ts) — re-expressed
// as flat PDF colors instead of Tailwind alpha utility classes, which don't
// apply outside the DOM.
import type { AppointmentStatus } from "@/features/dashboard/mock-data";

export const PDF_STATUS_COLORS: Record<AppointmentStatus, string> = {
  confirmed: PDF_COLORS.primary,
  pending: PDF_COLORS.warning,
  "in-progress": PDF_COLORS.info,
  completed: PDF_COLORS.success,
  cancelled: PDF_COLORS.mutedForeground,
  "no-show": PDF_COLORS.noshow,
};
