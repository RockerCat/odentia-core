import type { Role } from "@/dev/role";

const SESSION_STORAGE_KEY = "odentia:session";

// soloDentistClinic: the "Administrador Odontólogo Único" demo scenario —
// still role "clinic-admin" (see src/dev/role-context.tsx), never a
// separate Role value, so it rides along in the same session object
// instead of needing its own storage key.
export type DemoSession = { role: Role; soloDentistClinic?: boolean };

// Mock "auth" persistence — a role saved to localStorage, nothing more.
// No tokens, no backend call: just enough to survive a refresh until real
// auth (Supabase or otherwise) lands.
export function readSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { role?: unknown; soloDentistClinic?: unknown };
    if (typeof parsed.role !== "string") return null;
    return { role: parsed.role as Role, soloDentistClinic: parsed.soloDentistClinic === true };
  } catch {
    return null;
  }
}

export function writeSession(session: DemoSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  notifySessionListeners();
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  notifySessionListeners();
}

// Lets useSyncExternalStore (see role-context.tsx) know the session changed
// — the native "storage" event only fires in *other* tabs, not the one
// that made the write, so same-tab consumers need this instead.
const listeners = new Set<() => void>();

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifySessionListeners(): void {
  listeners.forEach((listener) => listener());
}
