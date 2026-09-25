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

// "Conoce nuestra clínica" — editorial composition by photo count (order
// as stored, never reshuffled). Mobile-first: never more than 2 per row.
// - single: one wide protagonist.
// - pair: two equal tiles (stacked on mobile, 50/50 from sm).
// - editorial (3–5): a full-width main photo + secondaries 2 per row on
//   mobile/tablet; on desktop the main takes the left half (2×2) and the
//   secondaries fill a 2×2 area on the right. An odd secondary out spans
//   the full row so there's never an orphan gap.
export type GalleryLayout = "single" | "pair" | "editorial";

export function galleryLayout(count: number): GalleryLayout | null {
  if (count <= 0) return null;
  if (count === 1) return "single";
  if (count === 2) return "pair";
  return "editorial";
}

export function galleryGridClass(layout: GalleryLayout): string {
  switch (layout) {
    case "single":
      return "grid grid-cols-1";
    case "pair":
      return "grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3";
    case "editorial":
      return "grid grid-cols-2 gap-2 sm:gap-3 lg:h-[26rem] lg:grid-cols-4 lg:grid-rows-2";
  }
}

export function galleryTileClass(layout: GalleryLayout, index: number, count: number): string {
  if (layout === "single") return "aspect-[4/3] sm:aspect-[21/9]";
  if (layout === "pair") return "aspect-[4/3]";
  if (index === 0) return "col-span-2 aspect-[16/10] lg:row-span-2 lg:aspect-auto lg:h-full";
  const secondaries = count - 1;
  // 2 secondaries (3 photos): side by side on mobile, stacked full-height
  // halves on desktop.
  if (secondaries === 2) return "aspect-[4/3] lg:col-span-2 lg:aspect-auto lg:h-full";
  // 3 secondaries (4 photos): the last one closes the grid spanning 2.
  if (secondaries === 3 && index === count - 1) return "col-span-2 aspect-[16/9] lg:aspect-auto lg:h-full";
  return "aspect-[4/3] lg:aspect-auto lg:h-full";
}
