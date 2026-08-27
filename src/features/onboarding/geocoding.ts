// Client-side wrapper for the onboarding's "Ubicar en el mapa" step (see
// clinic-location-picker.tsx). Talks only to our own Route Handler
// (src/app/api/geocoding/search/route.ts) — Nominatim (OpenStreetMap) is
// only ever called server-side, from that route, never directly from the
// browser. See that route for why (Nominatim's usage policy requires an
// identifying User-Agent and discourages/forbids exactly the kind of
// client-scattered calls a browser-side integration would produce).

export class GeocodingError extends Error {}

export type GeocodeResult = {
  latitude: number;
  longitude: number;
};

// One geocode attempt for the address/city/state the user typed. Returns
// null (not an error) when Nominatim has no match for this query — the
// caller shows a friendly "no encontramos esta dirección" message and
// lets the user keep editing or continue without a pin. Throws
// GeocodingError only for actual failures (network, service unavailable,
// unexpected response shape).
export async function locateOnMap(
  params: { address: string; city: string; state: string },
  signal: AbortSignal,
): Promise<GeocodeResult | null> {
  const url = new URL("/api/geocoding/search", window.location.origin);
  url.searchParams.set("address", params.address);
  url.searchParams.set("city", params.city);
  url.searchParams.set("state", params.state);

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal });
  } catch (cause) {
    if (signal.aborted) throw cause; // let AbortError propagate as-is
    throw new GeocodingError("No pudimos ubicar esta dirección en este momento.");
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new GeocodingError("No pudimos ubicar esta dirección en este momento.");
  }

  const data = (await response.json()) as { latitude?: unknown; longitude?: unknown };
  if (typeof data.latitude !== "number" || typeof data.longitude !== "number") return null;
  return { latitude: data.latitude, longitude: data.longitude };
}
