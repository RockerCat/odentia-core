"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CalendarIcon, CloseIcon } from "@/components/shell/icons";
import type { MembershipRole } from "@/features/session/types";
import type { ClinicalProfessional } from "./appointments-data";
import { describeInitialSchedule, hasInitialSchedule, type AgendaAvailabilityBlock } from "./agenda-hours";

// Informative onboarding notice (Pilot E2E): every professional starts with
// a real, bookable Lun–Vie 08:00–17:00 schedule (see schedule-config.ts's
// INITIAL_PROFESSIONAL_SCHEDULE), so nothing here is required — it just
// tells the Clinic Admin that schedule exists and where to change it.
// Clinic Admin only: she's the one who can edit any professional's
// schedule from /configuracion. Disappears on its own once no shown
// professional is still on the untouched initial schedule, or when closed.
export function resolveInitialScheduleNotice(
  role: MembershipRole,
  professionals: Pick<ClinicalProfessional, "professionalProfileId" | "firstName" | "lastName">[],
  availability: AgendaAvailabilityBlock[],
): { professionalNames: string[] } | null {
  if (role !== "clinic_admin") return null;
  const onInitial = professionals.filter((p) => hasInitialSchedule(p.professionalProfileId, availability));
  if (onInitial.length === 0) return null;
  // Names only matter when the clinic has more than one professional —
  // in the solo Primary Use Case "tu agenda" already says whose.
  const professionalNames = professionals.length > 1 ? onInitial.map((p) => `${p.firstName} ${p.lastName}`.trim()) : [];
  return { professionalNames };
}

// Dismiss persistence: no per-user preferences store exists in this
// codebase, and this notice doesn't justify a new table — so it's a
// per-browser localStorage flag, scoped per clinic. Closing it keeps it
// closed across navigation/reloads in this browser; another browser/
// device may show it once more. Storage failures (private mode, blocked
// storage) fail toward "not dismissed", never breaking the page.
export function initialScheduleNoticeStorageKey(clinicId: string): string {
  return `odentia:initial-schedule-notice-dismissed:${clinicId}`;
}

const listeners = new Set<() => void>();

// In-memory fallback so "close" always hides the notice for the rest of
// this page's lifetime, even when localStorage itself is unavailable.
const hiddenClinics = new Set<string>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function isInitialScheduleNoticeDismissed(clinicId: string): boolean {
  if (hiddenClinics.has(clinicId)) return true;
  try {
    return window.localStorage.getItem(initialScheduleNoticeStorageKey(clinicId)) === "1";
  } catch {
    return false;
  }
}

export function dismissInitialScheduleNotice(clinicId: string) {
  hiddenClinics.add(clinicId);
  try {
    window.localStorage.setItem(initialScheduleNoticeStorageKey(clinicId), "1");
  } catch {
    // Storage unavailable — hiddenClinics still hides it for this page's lifetime.
  }
  for (const listener of listeners) listener();
}

export function InitialScheduleNotice({ clinicId, professionalNames }: { clinicId: string; professionalNames: string[] }) {
  // Server snapshot = dismissed, so SSR never renders it and the client
  // never flashes it for someone who already closed it.
  const dismissed = useSyncExternalStore(subscribe, () => isInitialScheduleNoticeDismissed(clinicId), () => true);
  if (dismissed) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CalendarIcon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Tu horario inicial está listo</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Configuramos inicialmente tu agenda así: {describeInitialSchedule()}. Puedes modificarlo cuando quieras.
            {professionalNames.length > 0 && ` Con horario inicial: ${professionalNames.join(", ")}.`}
          </p>
        </div>
        <Link
          href="/configuracion#horario"
          className="shrink-0 self-start rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5 sm:self-center"
        >
          Ver horario
        </Link>
      </div>
      <button type="button" onClick={() => dismissInitialScheduleNotice(clinicId)} aria-label="Cerrar aviso de horario inicial" className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground">
        <CloseIcon className="size-4" />
      </button>
    </div>
  );
}
