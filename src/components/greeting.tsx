"use client"; // reads the active session's identity below.

import { firstName } from "@/lib/format";
import { useShellIdentity } from "@/components/shell/use-shell-identity";
import { PersonalizedHeading } from "./personalized-heading";

// Kept as a small parameterized component (not a string built ad-hoc
// elsewhere) so swapping this for a real i18n call later is a small,
// localized change. Uses the real-overlay identity (see
// components/shell/use-shell-identity.ts, already used by Header/
// MobileHeader/PatientsGreeting) rather than the plain mock hook
// (useAuthenticatedIdentity) — the real bridge only carries role/
// soloDentistClinic into the mock session (see role-bridge.ts), never
// name/avatar, so the mock hook alone could show a fixed/mock name here
// regardless of who actually authenticated. Always greets whoever is
// actually authenticated right now — never a static/mock name.
export function Greeting() {
  const { name } = useShellIdentity();
  return (
    <PersonalizedHeading
      before="Hola "
      userName={firstName(name)}
      after=", esta es la agenda para hoy."
    />
  );
}
