"use client";

import dynamic from "next/dynamic";

// Read-only map for "Dónde estamos" — the same Leaflet/OpenStreetMap
// component Clínica's sede editor uses (no API key, no geocoding on render),
// loaded client-only like there. Only rendered with usable coordinates
// (hasUsableCoordinates) — never a broken/empty map.
const ClinicLocationMap = dynamic(
  () => import("@/features/location/clinic-location-map").then((mod) => mod.ClinicLocationMap),
  {
    ssr: false,
    loading: () => <div className="h-40 w-full animate-pulse rounded-md bg-foreground/5 sm:h-48" />,
  },
);

export function ClinicLocationView({ latitude, longitude }: { latitude: number; longitude: number }) {
  return <ClinicLocationMap latitude={latitude} longitude={longitude} />;
}
