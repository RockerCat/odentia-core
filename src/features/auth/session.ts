import type { Role } from "@/dev/role";

const SESSION_STORAGE_KEY = "odentia:session";

export type DemoSession = { role: Role };

// Mock "auth" persistence — a role saved to localStorage, nothing more.
// No tokens, no backend call: just enough to survive a refresh until real
// auth (Supabase or otherwise) lands.
export function readSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { role?: unknown };
    if (typeof parsed.role !== "string") return null;
    return { role: parsed.role as Role };
  } catch {
    return null;
  }
}

export function writeSession(session: DemoSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
