"use client";

// DEV TOOL — see src/dev/role.ts. The `role` state itself now also doubles
// as the app's mock "session" (see src/features/auth/session.ts): it hydrates
// from localStorage on load and persists on every change, so a /login demo
// profile survives a refresh. Only the RoleSwitcher UI stays dev-only — the
// underlying role/session mechanism is what src/app/login relies on in
// production too.

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { clearSession, readSession, subscribeToSession, writeSession } from "@/features/auth/session";
import { DEFAULT_ROLE, DEV_DENTIST_ID, type Role } from "./role";

// The server has no access to localStorage, so it always "sees" the
// default role — useSyncExternalStore uses this for both SSR and the
// client's first (hydration) render, guaranteeing they match. Once
// hydrated, React re-reads getClientRole() below and re-renders with the
// real persisted role if it differs — a one-tick flash to the real role
// is the expected, correct trade-off for browser-storage-backed state,
// and it happens through React's own sanctioned mechanism for this
// instead of a manual setState-in-effect (which a mismatched first paint
// would otherwise require).
const getServerRole = (): Role => DEFAULT_ROLE;
const getClientRole = (): Role => readSession()?.role ?? DEFAULT_ROLE;

// DEV TOOL — the mutable subset of the authenticated dentist's own identity
// that the self-service "Editar perfil" flow (DentistProfileModal) can
// change during the session. Lives here — not in feature mock data — so the
// shell Header and the Agenda's profile modal read/write the exact same
// values instead of each keeping their own copy.
export type SelfDentistOverride = { name?: string; specialty?: string; avatar_url?: string };

// DEV TOOL — same idea, for the Clinic Admin's own administrative identity
// (Header's "Mi perfil"): name/email/phone/avatar, never role or clinic.
export type AdminIdentityOverride = { name?: string; email?: string; phone?: string; avatar_url?: string };

// DEV TOOL — same idea again, for the Assistant's own identity (Header's
// simple "Editar perfil" — see assistant-profile-modal.tsx). Never
// specialty/registration/room/schedule: an Assistant is never a clinical
// professional (see CLAUDE.md Domain Model).
export type AssistantIdentityOverride = { name?: string; email?: string; phone?: string; avatar_url?: string };

// DEV TOOL — set only once the Clinic Admin opts into "¿También atiendes
// pacientes en esta clínica?" from "Mi perfil" → "Perfil profesional". Null
// means they're a pure administrator (the default — see CLAUDE.md Domain
// Model). Distinct from SelfDentistOverride: this never changes `role`,
// it's an independent, additive professional profile.
export type AdminProfessionalProfile = {
  specialty: string;
  registrationNumber: string;
  mainRoom: string;
  scheduleDays: string[];
  scheduleStart: string;
  scheduleEnd: string;
};

type RoleContextValue = {
  role: Role;
  setRole: (role: Role) => void;
  // DEV TOOL — which mock dentist "I am" when role is "dentist". Fixed for
  // now (see DEV_DENTIST_ID); not user-settable since nothing needs to
  // switch it independently of role yet.
  dentistId: string;
  selfDentistOverride: SelfDentistOverride;
  // Merges the given fields into the current override (doesn't replace it).
  setSelfDentistOverride: (patch: SelfDentistOverride) => void;
  adminIdentityOverride: AdminIdentityOverride;
  setAdminIdentityOverride: (patch: AdminIdentityOverride) => void;
  adminProfessionalProfile: AdminProfessionalProfile | null;
  setAdminProfessionalProfile: (profile: AdminProfessionalProfile | null) => void;
  assistantIdentityOverride: AssistantIdentityOverride;
  setAssistantIdentityOverride: (patch: AssistantIdentityOverride) => void;
  // Clears the persisted session — used by "Salir" in the shell Header.
  logout: () => void;
};

const NO_SELF_OVERRIDE: SelfDentistOverride = {};
const NO_ADMIN_OVERRIDE: AdminIdentityOverride = {};
const NO_ASSISTANT_OVERRIDE: AssistantIdentityOverride = {};

const RoleContext = createContext<RoleContextValue>({
  role: DEFAULT_ROLE,
  setRole: () => {},
  dentistId: DEV_DENTIST_ID,
  selfDentistOverride: NO_SELF_OVERRIDE,
  setSelfDentistOverride: () => {},
  adminIdentityOverride: NO_ADMIN_OVERRIDE,
  setAdminIdentityOverride: () => {},
  adminProfessionalProfile: null,
  setAdminProfessionalProfile: () => {},
  assistantIdentityOverride: NO_ASSISTANT_OVERRIDE,
  setAssistantIdentityOverride: () => {},
  logout: () => {},
});

export function RoleProvider({ children }: { children: ReactNode }) {
  // `role` is derived entirely from the persisted session (see the
  // getServerRole/getClientRole comment above) rather than its own local
  // state — setRole/logout below just write through to that same session,
  // and subscribeToSession's notification re-runs getClientRole so this
  // re-renders with the new value.
  const role = useSyncExternalStore(subscribeToSession, getClientRole, getServerRole);
  const [selfDentistOverride, setSelfDentistOverrideState] = useState<SelfDentistOverride>(NO_SELF_OVERRIDE);
  const [adminIdentityOverride, setAdminIdentityOverrideState] =
    useState<AdminIdentityOverride>(NO_ADMIN_OVERRIDE);
  const [adminProfessionalProfile, setAdminProfessionalProfile] = useState<AdminProfessionalProfile | null>(null);
  const [assistantIdentityOverride, setAssistantIdentityOverrideState] =
    useState<AssistantIdentityOverride>(NO_ASSISTANT_OVERRIDE);

  // Persisted immediately so both the /login demo picker and the dev
  // RoleSwitcher survive a refresh through the exact same mechanism.
  const setRole = (next: Role) => {
    writeSession({ role: next });
  };

  const logout = () => {
    clearSession();
  };

  const setSelfDentistOverride = (patch: SelfDentistOverride) => {
    setSelfDentistOverrideState((prev) => ({ ...prev, ...patch }));
  };

  const setAdminIdentityOverride = (patch: AdminIdentityOverride) => {
    setAdminIdentityOverrideState((prev) => ({ ...prev, ...patch }));
  };

  const setAssistantIdentityOverride = (patch: AssistantIdentityOverride) => {
    setAssistantIdentityOverrideState((prev) => ({ ...prev, ...patch }));
  };

  return (
    <RoleContext.Provider
      value={{
        role,
        setRole,
        dentistId: DEV_DENTIST_ID,
        selfDentistOverride,
        setSelfDentistOverride,
        adminIdentityOverride,
        setAdminIdentityOverride,
        adminProfessionalProfile,
        setAdminProfessionalProfile,
        assistantIdentityOverride,
        setAssistantIdentityOverride,
        logout,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
