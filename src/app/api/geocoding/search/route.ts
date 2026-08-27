import { NextResponse, type NextRequest } from "next/server";

// Server-side proxy to Nominatim (OpenStreetMap's public geocoding
// service) for the onboarding's "Ubicar en el mapa" step (Paso 2 — see
// src/features/onboarding/clinic-location-picker.tsx). The browser never
// calls Nominatim directly: this route is the one place that shapes the
// query, identifies the app, and could later add rate limiting/caching
// without touching the client.
//
// Usage-policy compliance
// (https://operations.osmfoundation.org/policies/nominatim/):
// - Identifying User-Agent (required — see USER_AGENT below; the default
//   User-Agent a bare fetch/library sends is explicitly not enough).
// - This endpoint is hit once per explicit "Ubicar en el mapa" click by a
//   real user during onboarding — never in bulk, never on a timer, never
//   reverse-geocoding a dataset. Odentia's primary function is dental
//   practice management, not geocoding, which is what the policy's
//   "applications whose primary function is related to geocoding must run
//   their own service" clause is aimed at — this is occasional, low-volume,
//   incidental use of the kind the public API is meant for.
// - Results are geocoded once and then persisted (see
//   src/features/onboarding/api.ts bootstrapClinic, which writes
//   latitude/longitude straight into clinic_locations) rather than
//   re-queried — no repeated identical lookups. The outbound fetch below
//   also opts into Next.js's fetch cache for the rare case of the exact
//   same query repeating within a day.
// - Attribution is rendered on the map itself (see
//   clinic-location-map.tsx), as the ODbL requires.
//
// If onboarding volume ever grows enough that this stops being
// "occasional, single-thread, one machine" — see the policy — the
// fallback is a self-hosted Nominatim instance or a paid provider, not
// pushing past these limits.

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

// Identifies this app per Nominatim's usage policy. Not a secret — no
// signup/token exists for the public Nominatim API.
const USER_AGENT = "OdentiaCore/1.0 (+https://odentia.com; contacto@odentia.com)";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = (searchParams.get("address") ?? "").trim();
  const city = (searchParams.get("city") ?? "").trim();
  const state = (searchParams.get("state") ?? "").trim();

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  // "[address], [city], [state], Colombia" — see the task's approved
  // query shape. countrycodes=co scopes results server-side too.
  const query = [address, city, state, "Colombia"].filter(Boolean).join(", ");

  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "co");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "es");

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 86400 },
    });
  } catch {
    return NextResponse.json({ error: "geocoding service unavailable" }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "geocoding service unavailable" }, { status: 502 });
  }

  const results = (await response.json()) as Array<{ lat?: string; lon?: string }>;
  const first = results[0];
  const latitude = first?.lat !== undefined ? Number(first.lat) : NaN;
  const longitude = first?.lon !== undefined ? Number(first.lon) : NaN;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Only latitude/longitude cross this boundary — display_name, place_id,
  // osm_id, importance, etc. from Nominatim's response are dropped here
  // and never reach the client or get persisted (see CLAUDE.md-adjacent
  // task scope: no raw provider payloads in our own state).
  return NextResponse.json({ latitude, longitude });
}
