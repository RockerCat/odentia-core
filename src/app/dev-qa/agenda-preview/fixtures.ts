// Deterministic, UUID-shaped synthetic data for the Agenda console-warning
// regression check (see scripts/qa-agenda-console-check.mjs).
//
// Cloned from a real captured /agenda data snapshot (only clinic/patient/
// professional NAMES changed) while investigating a real "missing key"
// warning — turned out the data shape was a red herring: the bug was
// structural (see page.tsx's own comment — it needs a Server Component,
// not this data specifically), but this fixture is kept realistic anyway
// since it's a fair representative shape for other regressions. Exactly
// one professional (the "Administrador Odontólogo Único" primary use case
// — a Clinic Admin whose own professional_profile is the clinic's only
// column), one patient, three concurrent `in_progress` Citas from a past
// date for the same professional+patient, one `completed` from the same
// past date, one `no_show` from the day after, one `completed` several
// days in the future.
import type { Appointment, ClinicalProfessional } from "@/features/dashboard/appointments-data";
import type { Patient } from "@/features/patients/data";

const CLINIC_ID = "00000000-0000-4000-8000-000000000001";
const PROF_1 = "225d222d-2481-4d05-9750-bfdd30b6a5db";
const PAT_1 = "8e462860-7898-471f-bcab-a64fc357ae5e";

export const FIXTURE_CLINIC_ID = CLINIC_ID;
export const FIXTURE_OWN_PROFESSIONAL_ID = PROF_1;

export const fixtureProfessionals: ClinicalProfessional[] = [
  {
    professionalProfileId: PROF_1,
    membershipId: "00000000-0000-4000-8000-000000000030",
    profileId: "00000000-0000-4000-8000-000000000040",
    firstName: "Alex",
    lastName: "Test 1",
    avatarUrl: null,
    specialtyName: null,
    defaultAppointmentDurationMinutes: 30,
    role: "clinic_admin",
  },
];

export const fixturePatients: Patient[] = [
  { id: PAT_1, firstName: "Laura", lastName: "Diaz", documentId: "111", phone: "+573173672033", email: null, birthDate: null, active: true, createdAt: new Date().toISOString() },
];

function apt(overrides: Partial<Appointment> & Pick<Appointment, "id" | "status" | "startsAt">): Appointment {
  return {
    clinicId: CLINIC_ID,
    professionalProfileId: PROF_1,
    patientId: PAT_1,
    patientName: "Laura Diaz",
    patientPhone: "+573173672033",
    durationMinutes: 30,
    reason: "Chequeo general",
    room: "Consultorio 1",
    contactPhone: "+573173672033",
    notes: null,
    patientArrivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Verbatim from the real snapshot (ids, timestamps, room/reason per row),
// plus two synthetic `confirmed` rows added for time-window regressions
// (scripts/qa-can-start-encounter-check.mjs): none of the real-snapshot
// rows above are scheduled/confirmed (only in_progress or terminal), so
// there was nothing in this fixture to exercise canStartClinicalEncounter
// against.
export const FUTURE_CONFIRMED_APPOINTMENT_ID = "d3f8b6c1-9e2a-4b7d-8f1e-6a5c3d9b2e47";
// TODAY_EIGHT_AM_APPOINTMENT_ID mirrors the exact reported regression
// (Cita hoy 8:00–8:30 AM, confirmed, viewed at 8:02 AM) — computed
// relative to whatever "today" actually is when this module loads, unlike
// the hardcoded literal dates above, which are tied to the specific
// calendar day they were captured on and silently stop meaning "today"/
// "tomorrow" once real time moves past them (this is exactly how an
// unrelated fixture row, hardcoded at a fixed future date, coincidentally
// BECAME "today at 8 AM" — still `completed` — once the real clock
// reached that date; a trap for whichever fixture row is at "now" purely
// by accident of the calendar, rather than by design).
function todayAtLocalHour(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
export const TODAY_EIGHT_AM_APPOINTMENT_ID = "f4a1e9c7-3b6d-4a8f-9c2e-1d7b5a3f8e60";

export const fixtureAppointments: Appointment[] = [
  apt({ id: "61d1f196-30d9-43e0-88b6-34ccdaebc18c", status: "in_progress", startsAt: "2026-09-01T17:30:00+00:00", room: "Consultorio 2", reason: "Chequeo general" }),
  apt({ id: "7458790a-4db7-4837-a9bf-95cbdc6dbef9", status: "in_progress", startsAt: "2026-09-01T20:30:00+00:00", room: "Consultorio 2", reason: "Chequeo general" }),
  apt({ id: "a5a629e2-b93d-46d1-b0de-abc4b9c14474", status: "in_progress", startsAt: "2026-09-01T21:30:00+00:00", room: "Consultorio 3", reason: "Consulta de ortodoncia" }),
  apt({ id: "69122780-e809-401d-aa76-ce7bba234f6a", status: "completed", startsAt: "2026-09-01T22:30:00+00:00", room: "Consultorio 3", reason: "Chequeo general" }),
  apt({ id: "c1d9c3f3-9f06-488a-aa61-14f6d51cfbc4", status: "no_show", startsAt: "2026-09-02T22:00:00+00:00", room: "Consultorio 2", reason: "Chequeo general" }),
  apt({ id: "9b853921-7854-4eab-906f-9c91a161babe", status: "completed", startsAt: "2026-09-04T13:00:00+00:00", room: "Consultorio 1", reason: "Consulta de ortodoncia" }),
  apt({ id: FUTURE_CONFIRMED_APPOINTMENT_ID, status: "confirmed", startsAt: "2026-09-05T13:00:00+00:00", room: "Consultorio 1", reason: "Chequeo general" }),
  apt({ id: TODAY_EIGHT_AM_APPOINTMENT_ID, status: "confirmed", startsAt: todayAtLocalHour(8), room: "Consultorio 1", reason: "Chequeo general" }),
];
