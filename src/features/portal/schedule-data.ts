import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAvailableFutureSlotForDay, isoWeekdayOfDayKey, resolveAgendaSlotsForDay, type AgendaAvailabilityBlock } from "@/features/dashboard/agenda-hours";
import { isPastSlot, slotStartIso } from "@/features/dashboard/real-format";

// A bookable professional's REAL schedule, as the Patient may see it:
// her weekly availability blocks and active absence dates, via the
// patient-scoped get_my_professional_schedule() RPC (no appointment or
// patient data). Slots are computed with the exact same agenda-hours.ts
// rules every staff picker uses — never a fixed grid.

export type PortalProfessionalSchedule = {
  professionalProfileId: string;
  availability: AgendaAvailabilityBlock[];
  absences: { startDate: string; endDate: string }[]; // "YYYY-MM-DD", inclusive
};

type ScheduleJson = {
  availability: { day_of_week: number; start_time: string; end_time: string; active: boolean }[];
  absences: { start_date: string; end_date: string }[];
};

export async function fetchMyProfessionalSchedule(
  supabase: SupabaseClient,
  professionalProfileId: string,
): Promise<PortalProfessionalSchedule> {
  const { data, error } = await supabase.rpc("get_my_professional_schedule", { p_professional_profile_id: professionalProfileId });
  if (error) throw error;
  const json = (data as ScheduleJson | null) ?? { availability: [], absences: [] };
  return {
    professionalProfileId,
    availability: (json.availability ?? []).map((b) => ({
      professionalProfileId,
      dayOfWeek: b.day_of_week,
      startTime: b.start_time.slice(0, 5),
      endTime: b.end_time.slice(0, 5),
      active: b.active,
    })),
    absences: (json.absences ?? []).map((a) => ({ startDate: a.start_date, endDate: a.end_date })),
  };
}

function isAbsent(schedule: PortalProfessionalSchedule, dayKey: string): boolean {
  return schedule.absences.some((a) => a.startDate <= dayKey && dayKey <= a.endDate);
}

// Real bookable slot labels for that professional on that day (absence
// days have none); past slots are left in so the grid can show them
// disabled, same as every other picker.
export function portalSlotsForDay(schedule: PortalProfessionalSchedule, dayKey: string): string[] {
  if (isAbsent(schedule, dayKey)) return [];
  return resolveAgendaSlotsForDay({
    dayOfWeek: isoWeekdayOfDayKey(dayKey),
    professionalProfileIds: [schedule.professionalProfileId],
    availability: schedule.availability,
  });
}

export function isPortalDaySelectable(schedule: PortalProfessionalSchedule, dayKey: string): boolean {
  if (isAbsent(schedule, dayKey)) return false;
  return hasAvailableFutureSlotForDay({
    dayKey,
    dayOfWeek: isoWeekdayOfDayKey(dayKey),
    professionalProfileIds: [schedule.professionalProfileId],
    availability: schedule.availability,
  });
}

export function isPortalSlotSelectable(schedule: PortalProfessionalSchedule, dayKey: string, slot: string): boolean {
  return portalSlotsForDay(schedule, dayKey).includes(slot) && !isPastSlot(dayKey, slot);
}

// Reprogramar only: the Cita's CURRENT slot (same professional + same
// instant) is not a real change, so it is never a valid destination. A
// different professional at the same time, or the same professional at
// another time, IS a change. Minute precision, same as every slot here.
// request_my_appointment_reschedule() rejects it server-side too.
export function isCurrentAppointmentSlot(
  current: { professionalProfileId: string; startsAt: string } | undefined,
  professionalProfileId: string,
  dayKey: string,
  slot: string,
): boolean {
  if (!current || current.professionalProfileId !== professionalProfileId) return false;
  const toMinute = (iso: string) => Math.floor(new Date(iso).getTime() / 60_000);
  return toMinute(slotStartIso(dayKey, slot)) === toMinute(current.startsAt);
}
