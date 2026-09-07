import type { SupabaseClient } from "@supabase/supabase-js";

// Real Horario/Disponibilidad del profesional — backs the new Horario
// editor (horario-editor.tsx), shared by the Clinic Admin's Configuración
// (any professional, via the same selector as Ausencias) and the Dentist's
// own Configuración (herself only), and read by Mi perfil profesional's
// summary. day_of_week is ISO 8601 (1=Lunes..7=Domingo), matching
// DAY_ORDER's own Monday-first Spanish ordering elsewhere in the app.
// clinic_id/professional_profile_id are never trusted from the caller
// beyond "which row to read/write" — professional_availability's own RLS
// (can_manage_professional_schedule) is what actually enforces who may
// write which professional's schedule; every action below still fails
// closed under RLS even if a caller forged these ids.

export type WeeklyAvailabilityBlock = {
  id: string;
  clinicId: string;
  professionalProfileId: string;
  dayOfWeek: number; // 1 = Lunes .. 7 = Domingo
  startTime: string; // "HH:MM" (24h)
  endTime: string; // "HH:MM" (24h)
  active: boolean;
};

type AvailabilityRow = {
  id: string;
  clinic_id: string;
  professional_profile_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
};

const AVAILABILITY_COLUMNS = "id, clinic_id, professional_profile_id, day_of_week, start_time, end_time, active";

// Postgres `time` comes back as "HH:MM:SS" — trimmed to "HH:MM" to match
// <input type="time"> and every other HH:MM convention already used in
// this codebase (AusenciaModal's own startTime/endTime).
function mapRow(row: AvailabilityRow): WeeklyAvailabilityBlock {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    professionalProfileId: row.professional_profile_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    active: row.active,
  };
}

export async function fetchWeeklyAvailability(
  supabase: SupabaseClient,
  professionalProfileId: string,
): Promise<WeeklyAvailabilityBlock[]> {
  const { data, error } = await supabase
    .from("professional_availability")
    .select(AVAILABILITY_COLUMNS)
    .eq("professional_profile_id", professionalProfileId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export type ActionOutcome = { status: "ok" } | { status: "error"; message: string };
export type CreateBlockOutcome = { status: "ok"; block: WeeklyAvailabilityBlock } | { status: "error"; message: string };

const GENERIC_ERROR = "No pudimos guardar el horario. Intenta de nuevo.";

export async function createAvailabilityBlock(
  supabase: SupabaseClient,
  input: { clinicId: string; professionalProfileId: string; dayOfWeek: number; startTime: string; endTime: string },
): Promise<CreateBlockOutcome> {
  if (input.startTime >= input.endTime) {
    return { status: "error", message: "La hora de fin debe ser posterior a la hora de inicio." };
  }
  const { data, error } = await supabase
    .from("professional_availability")
    .insert({
      clinic_id: input.clinicId,
      professional_profile_id: input.professionalProfileId,
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      end_time: input.endTime,
    })
    .select(AVAILABILITY_COLUMNS)
    .single();
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok", block: mapRow(data) };
}

export async function setAvailabilityBlockActive(
  supabase: SupabaseClient,
  blockId: string,
  active: boolean,
): Promise<ActionOutcome> {
  const { error } = await supabase.from("professional_availability").update({ active }).eq("id", blockId);
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok" };
}

export async function deleteAvailabilityBlock(supabase: SupabaseClient, blockId: string): Promise<ActionOutcome> {
  const { error } = await supabase.from("professional_availability").delete().eq("id", blockId);
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok" };
}

// Monday-first, matching day_of_week's own ISO convention (index 0 = day 1
// = Lunes). Local to this real feature — never imported from
// appointments-card.tsx's mock DAY_ORDER (see CLAUDE.md: real screens never
// share code with still-mock ones).
export const WEEKDAY_LABELS: readonly string[] = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const WEEKDAY_SHORT_LABELS: readonly string[] = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function formatHourMinuteLabel(hhmm: string): string {
  const [hourStr, minuteStr] = hhmm.split(":");
  const hour24 = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

// Groups active blocks by day and collapses consecutive days sharing the
// EXACT same set of time ranges into one line (e.g. "Lun – Vie · 8:00 AM –
// 5:00 PM") — the readable weekly summary Mi perfil profesional shows
// instead of a flat 7-day list. Inactive blocks are excluded: they're
// configured but not currently in effect, same meaning `active` carries
// everywhere else in this schema.
export function summarizeWeeklyAvailability(blocks: WeeklyAvailabilityBlock[]): string[] {
  const activeByDay = new Map<number, string>();
  for (let day = 1; day <= 7; day++) {
    const dayBlocks = blocks
      .filter((b) => b.active && b.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (dayBlocks.length === 0) continue;
    activeByDay.set(day, dayBlocks.map((b) => `${formatHourMinuteLabel(b.startTime)} – ${formatHourMinuteLabel(b.endTime)}`).join(", "));
  }

  const lines: string[] = [];
  let rangeStartDay: number | null = null;
  let prevDay: number | null = null;
  let prevSignature: string | null = null;

  const flush = (endDay: number) => {
    if (rangeStartDay === null || prevSignature === null) return;
    const dayLabel =
      rangeStartDay === endDay
        ? WEEKDAY_SHORT_LABELS[rangeStartDay - 1]
        : `${WEEKDAY_SHORT_LABELS[rangeStartDay - 1]} – ${WEEKDAY_SHORT_LABELS[endDay - 1]}`;
    lines.push(`${dayLabel} · ${prevSignature}`);
  };

  for (let day = 1; day <= 7; day++) {
    const signature = activeByDay.get(day) ?? null;
    if (signature === null) {
      if (prevDay !== null) flush(prevDay);
      rangeStartDay = null;
      prevDay = null;
      prevSignature = null;
      continue;
    }
    if (signature === prevSignature && rangeStartDay !== null) {
      prevDay = day;
      continue;
    }
    if (prevDay !== null) flush(prevDay);
    rangeStartDay = day;
    prevDay = day;
    prevSignature = signature;
  }
  if (prevDay !== null) flush(prevDay);

  return lines;
}
