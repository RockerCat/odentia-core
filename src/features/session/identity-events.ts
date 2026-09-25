// Tiny same-tab signal: "the signed-in user's displayed identity changed"
// (today: her profile photo). The Portal/staff header identity hooks
// re-resolve on it, so a new photo shows in the header right away instead
// of after the next navigation. Display only — never an auth signal.
const EVENT = "odentia:identity-changed";

export function notifyIdentityChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function onIdentityChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
