import type { PrimaryLocation } from "@/features/clinic/data";

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

// "Nuestro equipo" — the clinic's whole ACTIVE team (get_my_clinic_team():
// clinic_admin/dentist/assistant memberships of the patient's own clinic).
// A member with an active professional profile is shown by her clinical
// identity (specialty/registro, even when she's also the clinic's admin);
// anyone else by her human role — never an invented specialty/registro.
export type ClinicTeamRole = "clinic_admin" | "dentist" | "assistant";

export type ClinicTeamMemberRow = {
  clinicId: string;
  profileId: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: ClinicTeamRole;
  professionalProfileId: string | null;
  licenseNumber: string | null;
  specialtyName: string | null;
};

export type TeamCard = {
  id: string;
  name: string;
  avatarUrl: string | undefined;
  specialty: string | null;
  licenseNumber: string | null;
  // Non-clinical members only ("Administrador", "Asistente", …).
  roleLabel: string | null;
  isUsualDentist: boolean;
};

const NON_CLINICAL_ROLE_LABELS: Record<ClinicTeamRole, string> = {
  clinic_admin: "Administrador",
  dentist: "Odontólogo",
  assistant: "Asistente",
};

// `usualDentistProfileId` is usualDentistProfileIdFrom() (usual-dentist.ts —
// the same rule Historia Clínica / Mi salud dental use), never re-derived
// here. When that person is in THIS clinic's active team she goes first,
// once, with the badge; otherwise the team keeps its own order, no badge.
export function teamCards(rows: ClinicTeamMemberRow[], clinicId: string, usualDentistProfileId: string | null): TeamCard[] {
  const cards = rows
    .filter((r) => r.clinicId === clinicId)
    .map((r): TeamCard => {
      const clinical = r.professionalProfileId !== null;
      return {
        id: r.profileId,
        name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || NON_CLINICAL_ROLE_LABELS[r.role],
        avatarUrl: r.avatarUrl?.trim() || undefined,
        specialty: clinical ? r.specialtyName?.trim() || null : null,
        licenseNumber: clinical ? r.licenseNumber?.trim() || null : null,
        roleLabel: clinical ? null : NON_CLINICAL_ROLE_LABELS[r.role],
        isUsualDentist: usualDentistProfileId !== null && r.profileId === usualDentistProfileId,
      };
    });
  return [...cards.filter((c) => c.isUsualDentist), ...cards.filter((c) => !c.isUsualDentist)];
}

// "Conoce nuestra clínica" — composition by photo count (order as stored,
// never reshuffled). Mobile-first:
// - single: one wide photo.
// - pair: both photos complete, side by side.
// - editorial (3–5): below sm, a native horizontal swipe strip (CSS scroll
//   snap, no library/autoplay/arrows) showing ~2.5 square photos — the cut
//   third says "there's more". It bleeds to the screen edge through the
//   page's own 16px gutter (-mx-4/px-4), so only the strip scrolls, never
//   the page. From sm: the grid — a wide main photo + secondaries; on
//   desktop the main takes the left half (2×2) and the secondaries fill a
//   2×2 area on the right, an odd secondary out spanning the full row.
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
      return "grid grid-cols-2 gap-2 sm:gap-3";
    case "editorial":
      return [
        "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0",
        "lg:h-[26rem] lg:grid-cols-4 lg:grid-rows-2",
      ].join(" ");
  }
}

// Mobile strip tile: (100% − 2 gaps) / 2.5 → two full photos + half a third.
const STRIP_TILE = "aspect-square w-[calc((100%-1rem)/2.5)] shrink-0 snap-start sm:w-full sm:shrink";

export function galleryTileClass(layout: GalleryLayout, index: number, count: number): string {
  if (layout === "single") return "aspect-[4/3] w-full sm:aspect-[21/9]";
  if (layout === "pair") return "aspect-[4/3] w-full";
  if (index === 0) return `${STRIP_TILE} sm:col-span-2 sm:aspect-[16/10] lg:row-span-2 lg:aspect-auto lg:h-full`;
  const secondaries = count - 1;
  // 2 secondaries (3 photos): side by side from sm, stacked halves on desktop.
  if (secondaries === 2) return `${STRIP_TILE} sm:aspect-[4/3] lg:col-span-2 lg:aspect-auto lg:h-full`;
  // 3 secondaries (4 photos): the last one closes the grid spanning 2.
  if (secondaries === 3 && index === count - 1) return `${STRIP_TILE} sm:col-span-2 sm:aspect-[16/9] lg:aspect-auto lg:h-full`;
  return `${STRIP_TILE} sm:aspect-[4/3] lg:aspect-auto lg:h-full`;
}

// "Nuestro equipo" — compact portrait cards, never a carousel: 2 columns
// on mobile (1 professional = one column-wide card, never stretched), 3 at
// sm, 4 at lg.
export const TEAM_GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4";
