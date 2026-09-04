"use client";

// Dev-only QA fixture — deterministic data for
// scripts/qa-loading-feedback-check.mjs's "Guardar borrador"/"Finalizar
// atención" scenarios. RealClinicalEncounterScreen is "use client" and
// gates itself with useRouteGuard(["clinic-admin","dentist"]) — that
// guard's own sessionOk is unconditionally true in development (see
// use-route-guard.ts), and DEFAULT_ROLE is "clinic-admin", so this needs
// no real Supabase session or mock-session setup to render. Every write
// it triggers (upsertPatientClinicalEncounter, updateAppointment) still
// hits the real backend and 401s here — enough to observe the immediate
// pending label and the error-recovery path, which is what these
// scenarios check; the real, non-mocked write path is already covered
// live elsewhere (see this session's Supabase RPC integration checks).
// 404s outside development — never a real, production-reachable route.
import { notFound } from "next/navigation";
import { RealClinicalEncounterScreen } from "@/features/dashboard/real-clinical-encounter-screen";

const CLINIC_ID = "00000000-0000-4000-8000-000000000001";
const PROF_ID = "225d222d-2481-4d05-9750-bfdd30b6a5db";
const PAT_ID = "8e462860-7898-471f-bcab-a64fc357ae5e";
const APPT_ID = "e1a2b3c4-5d6e-4f70-8a9b-0c1d2e3f4a5b";

function todayAtLocalHour(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export default function ClinicalEncounterPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <RealClinicalEncounterScreen
      appointment={{
        id: APPT_ID,
        clinicId: CLINIC_ID,
        patientId: PAT_ID,
        patientName: "Laura Diaz",
        patientPhone: "+573173672033",
        professionalProfileId: PROF_ID,
        startsAt: todayAtLocalHour(9),
        durationMinutes: 30,
        status: "in_progress",
        reason: "Chequeo general",
        room: "Consultorio 1",
        notes: null,
        contactPhone: "+573173672033",
        patientArrivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }}
      professional={{
        professionalProfileId: PROF_ID,
        name: "Alex Test 1",
        initials: "AT",
        specialty: "Sin especialidad",
        avatarUrl: null,
        defaultAppointmentDurationMinutes: 30,
      }}
      clinicId={CLINIC_ID}
      patients={[
        {
          id: PAT_ID,
          firstName: "Laura",
          lastName: "Diaz",
          documentId: "111",
          phone: "+573173672033",
          email: null,
          birthDate: null,
          active: true,
          createdAt: new Date().toISOString(),
        },
      ]}
      professionals={[
        {
          professionalProfileId: PROF_ID,
          name: "Alex Test 1",
          initials: "AT",
          specialty: "Sin especialidad",
          avatarUrl: null,
          defaultAppointmentDurationMinutes: 30,
        },
      ]}
      weekDays={[]}
      treatmentOptions={["Chequeo general", "Limpieza dental"]}
      roomOptions={["Consultorio 1"]}
      initialToothFindings={[]}
      existingEncounter={null}
      existingProcedures={[]}
    />
  );
}
