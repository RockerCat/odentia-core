"use client"; // reads the active session's identity below.

import { firstName } from "@/lib/format";
import { useAuthenticatedIdentity } from "@/features/dashboard/use-authenticated-identity";
import { PersonalizedHeading } from "./personalized-heading";

// Superadmin's equivalent of Greeting (see greeting.tsx) — same pattern,
// different closing text since this heads the platform dashboard, not
// the Agenda.
export function AdminGreeting() {
  const { name } = useAuthenticatedIdentity();
  return (
    <PersonalizedHeading
      before="Hola "
      userName={firstName(name)}
      after=", este es el estado de Odentia."
    />
  );
}
