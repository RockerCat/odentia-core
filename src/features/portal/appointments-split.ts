import { isTerminalStatus } from "@/features/dashboard/real-status";
import type { PortalAppointment } from "./appointments-data";

// "Mis citas"'s próximas/historial split. The rule is a conjunction on
// "próximas" (future AND non-terminal), not the terminal/non-terminal split
// alone: a past appointment stuck non-terminal (Agenda's "Sin cerrar" via
// getDisplayStatus — see real-status.ts) belongs in historial, never
// próximas, and a future terminal appointment (e.g. cancelled ahead of
// time) belongs in historial too, never próximas. Never mutates `status` —
// purely a display-bucket decision; getDisplayStatus (called by the screen
// itself) still derives "Sin cerrar" independently for whichever bucket a
// non-terminal-but-stale appointment lands in.
export function splitPortalAppointments(
  appointments: PortalAppointment[],
  now: Date = new Date(),
): { upcoming: PortalAppointment[]; history: PortalAppointment[] } {
  const nowMs = now.getTime();

  const upcoming = appointments
    .filter((a) => !isTerminalStatus(a.status) && new Date(a.startsAt).getTime() >= nowMs)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const history = appointments
    .filter((a) => isTerminalStatus(a.status) || new Date(a.startsAt).getTime() < nowMs)
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

  return { upcoming, history };
}
