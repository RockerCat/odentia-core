"use client"; // reads the active session's identity below.

import { firstName } from "@/lib/format";
import { useAuthenticatedIdentity } from "@/features/dashboard/use-authenticated-identity";
import { PersonalizedHeading } from "./personalized-heading";

// Clinic Admin's Pacientes heading — same pattern as Greeting/AdminGreeting.
export function PatientsGreeting() {
  const { name } = useAuthenticatedIdentity();
  return (
    <PersonalizedHeading
      before="Hola "
      userName={firstName(name)}
      after=", estos son los pacientes de tu clínica."
    />
  );
}
