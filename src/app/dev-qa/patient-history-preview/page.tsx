"use client";

// Dev-only QA fixture — deterministic data for
// scripts/qa-nav-followups-check.mjs's "Atrás" pending regression
// (PROMPT NINJA — Cerrar gaps restantes de navegación programática).
// RealPatientAppointmentHistoryScreen takes all its data as props (no
// Supabase calls of its own — see that file's own comment: the real route,
// /pacientes/[id]/historial-citas/page.tsx, does the fetching server-side),
// so a plain client fixture with synthetic data is faithful and needs no
// real Supabase session. Its "Atrás" link still navigates to the real,
// gated /pacientes — unauthenticated here, so it correctly redirects to
// /login, same constraint/behavior documented in
// scripts/qa-nav-pending-check.mjs's own top comment.
// 404s outside development — never a real, production-reachable route.
import { notFound } from "next/navigation";
import type { Appointment } from "@/features/dashboard/appointments-data";
import { RealPatientAppointmentHistoryScreen } from "@/features/patients/real-patient-appointment-history-screen";

const FIXTURE_PATIENT_ID = "8e462860-7898-471f-bcab-a64fc357ae5e";
const FIXTURE_PROF_ID = "225d222d-2481-4d05-9750-bfdd30b6a5db";
const CLINIC_ID = "00000000-0000-4000-8000-000000000001";

const FIXTURE_APPOINTMENTS: Appointment[] = [
  {
    id: "d1e2f3a4-0000-4000-8000-000000000001",
    clinicId: CLINIC_ID,
    patientId: FIXTURE_PATIENT_ID,
    professionalProfileId: FIXTURE_PROF_ID,
    startsAt: "2026-08-20T13:00:00+00:00",
    durationMinutes: 30,
    reason: "Chequeo general",
    room: "Consultorio 1",
    contactPhone: "+573173672033",
    notes: null,
    status: "completed",
    patientArrivedAt: null,
    createdAt: "2026-08-20T13:00:00+00:00",
    updatedAt: "2026-08-20T13:00:00+00:00",
    patientName: "Laura Diaz",
    patientPhone: "+573173672033",
  },
];

export default function PatientHistoryPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <RealPatientAppointmentHistoryScreen
      patient={{
        id: FIXTURE_PATIENT_ID,
        firstName: "Laura",
        lastName: "Diaz",
        documentId: "111",
        phone: "+573173672033",
        email: null,
        birthDate: null,
        active: true,
        createdAt: new Date().toISOString(),
      }}
      appointments={FIXTURE_APPOINTMENTS}
      professionalNameById={{ [FIXTURE_PROF_ID]: "Alex Test 1" }}
    />
  );
}
