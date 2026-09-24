import type { PrimaryLocation } from "@/features/clinic/data";
import type { PortalProfessional } from "./requests-data";

// /portal/clinica — pure rules for what the clinic profile may show. Only
// real configured data; every missing piece is omitted, never invented.

// Real, usable coordinates (both present, finite, in range) — anything
// else renders no map at all rather than a broken one.
export function hasUsableCoordinates(location: Pick<PrimaryLocation, "latitude" | "longitude"> | null): boolean {
  if (!location) return false;
  const { latitude, longitude } = location;
  return (
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

// The sede's real address, joining only the parts that exist; null when
// none do.
export function formatClinicAddress(location: Pick<PrimaryLocation, "address" | "city" | "state"> | null): string | null {
  if (!location) return null;
  const parts = [location.address, location.city, location.state].map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(", ") : null;
}

// "Cómo llegar" — Google Maps directions (no API key): exact coordinates
// when configured, otherwise the real address; null when there's neither.
export function directionsUrl(location: PrimaryLocation | null): string | null {
  if (location && hasUsableCoordinates(location)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
  }
  const address = formatClinicAddress(location);
  return address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : null;
}

// "Nuestro equipo" card — photo (or UserAvatar's initials), name, and only
// the optional fields that really exist.
export type TeamCard = { id: string; name: string; avatarUrl: string | undefined; specialty: string | null; licenseNumber: string | null };

export function teamCards(professionals: PortalProfessional[]): TeamCard[] {
  return professionals.map((p) => ({
    id: p.professionalProfileId,
    name: p.name,
    avatarUrl: p.avatarUrl ?? undefined,
    specialty: p.specialty?.trim() || null,
    licenseNumber: p.licenseNumber?.trim() || null,
  }));
}
