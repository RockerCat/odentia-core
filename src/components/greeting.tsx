import { firstName } from "@/lib/format";
import { PersonalizedHeading } from "./personalized-heading";

// Kept as a small parameterized component (not a string built ad-hoc
// elsewhere) so swapping this for a real i18n call later is a small,
// localized change.
export function Greeting({ fullName }: { fullName: string }) {
  return (
    <PersonalizedHeading
      before="Hola "
      userName={firstName(fullName)}
      after=", esta es la agenda para hoy."
    />
  );
}
