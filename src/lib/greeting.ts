import { firstName } from "./format";

// Kept as a small parameterized function (not a string built ad-hoc in
// JSX) so swapping this for a real i18n call later is a one-line change.
export function getGreeting(fullName: string): string {
  return `Hola ${firstName(fullName)}, esta es la agenda para hoy.`;
}
