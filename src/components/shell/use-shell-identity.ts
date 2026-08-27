"use client";

import { useAuthenticatedIdentity, type AuthenticatedIdentity } from "@/features/dashboard/use-authenticated-identity";
import { useCurrentUserContext } from "@/features/session/use-current-user-context";

// Overlays REAL profile/clinic identity (see
// src/features/session/use-current-user-context.ts) on top of the existing
// mock identity (see use-authenticated-identity.ts) for display in the
// shell chrome only (Header/MobileHeader) — never touches the mock feature
// screens that still read useAuthenticatedIdentity directly (Agenda's
// greeting, etc. — see CLAUDE.md task scope, section 15). Only
// clinic_admin/dentist/assistant can resolve a real context today
// (superadmin/patient real auth is out of scope); every other case falls
// straight back to the mock identity, unchanged.
export function useShellIdentity(): AuthenticatedIdentity {
  const mock = useAuthenticatedIdentity();
  const real = useCurrentUserContext();

  if (!real || real.status !== "ok") return mock;

  const name = `${real.profile.firstName} ${real.profile.lastName}`.trim() || mock.name;
  const initials =
    `${real.profile.firstName[0] ?? ""}${real.profile.lastName[0] ?? ""}`.toUpperCase() || mock.initials;
  // Never mock.avatar_url as a fallback here — UserAvatar already renders
  // a neutral initials circle when avatar_url is undefined (see
  // components/user-avatar.tsx), which is the correct empty state for a
  // real profile with no avatar_url, not María Gómez's mock photo.
  const avatar_url = real.profile.avatarUrl ?? undefined;

  return {
    name,
    initials,
    avatar_url,
    // Real clinic name always wins here, regardless of professionalRecord
    // — use-authenticated-identity.ts's clinic-admin fallback branch
    // returns CURRENT_USER.clinicName ("Clínica Sonrisa Perfecta") as
    // secondaryLabel unconditionally (professionalRecord only changes the
    // *record* shown, never that string), so keeping "mock.secondaryLabel"
    // for the professionalRecord case was silently re-introducing the mock
    // clinic name into the header for any real solo-practitioner account.
    secondaryLabel: real.clinic.name,
    professionalRecord: mock.professionalRecord
      ? { ...mock.professionalRecord, name, avatar_url }
      : null,
  };
}
