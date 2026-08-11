"use client"; // reads the active session's identity below.

import { firstName } from "@/lib/format";
import { useAuthenticatedIdentity } from "@/features/dashboard/use-authenticated-identity";
import { PersonalizedHeading } from "./personalized-heading";

// Kept as a small parameterized component (not a string built ad-hoc
// elsewhere) so swapping this for a real i18n call later is a small,
// localized change. Always greets whoever is actually authenticated right
// now (see useAuthenticatedIdentity) — never a static/mock name.
export function Greeting() {
  const { name } = useAuthenticatedIdentity();
  return (
    <PersonalizedHeading
      before="Hola "
      userName={firstName(name)}
      after=", esta es la agenda para hoy."
    />
  );
}
