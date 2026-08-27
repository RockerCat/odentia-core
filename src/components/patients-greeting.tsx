"use client"; // reads the active session's identity below.

import { firstName } from "@/lib/format";
import { useShellIdentity } from "@/components/shell/use-shell-identity";
import { PersonalizedHeading } from "./personalized-heading";

// Clinic Admin's Pacientes heading — same pattern as Greeting/AdminGreeting.
// Uses the real-overlay identity (see components/shell/use-shell-identity.ts,
// already used by Header/MobileHeader) rather than the plain mock hook —
// this is /pacientes' own visible heading text, not shared shell chrome,
// and showing a mock name here would be exactly the kind of "María Gómez
// leaking into real data" this feature's migration must not have.
export function PatientsGreeting() {
  const { name } = useShellIdentity();
  return (
    <PersonalizedHeading
      before="Hola "
      userName={firstName(name)}
      after=", estos son los pacientes de tu clínica."
    />
  );
}
