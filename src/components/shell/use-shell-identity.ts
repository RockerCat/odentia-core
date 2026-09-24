"use client";

import type { CurrentUserContextResult } from "@/features/session/use-current-user-context";
import { useCurrentUserContextResult } from "@/features/session/use-current-user-context";

// Display identity for the clinic app shell (Header, MobileHeader) and each
// page's greeting (Greeting, PatientsGreeting) — REAL ONLY. Resolved from
// the same real ClinicContext as everything else (useCurrentUserContextResult
// → resolveClinicContext); src/lib/supabase/proxy.ts has already gated the
// route, so this is display, never authorization.
//
// It used to fall back to the dev mock identity (useAuthenticatedIdentity:
// "Laura Torres" for an Assistant, "María Gómez" + a stock photo + "Clínica
// Sonrisa Perfecta" for a Clinic Admin, …) whenever the real context was
// still loading or failed — so a fictitious person flashed in the header/
// greeting on every page load, and stayed there if resolution failed
// (Pilot E2E). Now: "loading" → callers render a skeleton; "unavailable"
// (error, or a non-ok context) → a neutral, nameless state. Never mock.
export type ShellIdentity = {
  status: "loading" | "ready" | "unavailable";
  name: string;
  initials: string;
  avatar_url?: string;
  secondaryLabel: string;
  // Whether this real user has her own ACTIVE professional_profile (a
  // Dentist, or a Clinic Admin who also practices) — decides where
  // "Perfil" goes, same rule as landing-header.tsx.
  hasActiveProfessionalProfile: boolean;
};

const EMPTY: Omit<ShellIdentity, "status"> = {
  name: "",
  initials: "",
  secondaryLabel: "",
  hasActiveProfessionalProfile: false,
};

// Pure — the whole rule, unit-tested without React (use-shell-identity.test.ts).
export function toShellIdentity(result: CurrentUserContextResult): ShellIdentity {
  if (result.state === "loading") return { status: "loading", ...EMPTY };
  if (result.state === "error" || result.context.status !== "ok") return { status: "unavailable", ...EMPTY };
  const { profile, clinic, professionalProfile } = result.context;
  return {
    status: "ready",
    name: `${profile.firstName} ${profile.lastName}`.trim(),
    initials: `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`.toUpperCase(),
    // No avatar → UserAvatar's own neutral initials circle, never a stock photo.
    avatar_url: profile.avatarUrl ?? undefined,
    secondaryLabel: clinic.name,
    hasActiveProfessionalProfile: Boolean(professionalProfile?.active),
  };
}

export function useShellIdentity(): ShellIdentity {
  return toShellIdentity(useCurrentUserContextResult());
}
