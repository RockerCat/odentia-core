"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

// Shared compact, draggable confirmation map — used by both the real
// onboarding (see onboarding/clinic-location-picker.tsx) and /clinica's
// own sede principal editor (see clinic/primary-location-section.tsx).
// Moved here from src/features/onboarding/ once a second real consumer
// existed (see geocoding.ts's own header for why — one shared
// implementation, never copy-pasted).
//
// Leaflet's default marker icon resolves its image URLs (marker-icon.png
// etc.) relative to the page — a well-known problem under any bundler,
// Next.js included: the icon silently fails to load instead of throwing,
// so it just isn't there. Rather than fight the bundler over
// leaflet/dist/images/*.png asset URLs, this pin is a self-contained
// inline SVG (no image request at all, nothing to mis-resolve). Built
// once at module scope, reused for every <Marker>.
const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="#2563eb"/>
    <circle cx="14" cy="14" r="5.5" fill="white"/>
  </svg>`,
  iconSize: [28, 40],
  iconAnchor: [14, 40],
});

const DEFAULT_ZOOM = 16;

// MapContainer only applies `center`/`zoom` on first mount — this re-centers
// the existing map instance whenever a fresh "Ubicar en el mapa" result
// changes the coordinates from outside. Dragging the marker itself does
// NOT go through here (see the Marker's own dragend handler below), so a
// manual drag never fights the user by snapping back to center.
function RecenterOnChange({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, DEFAULT_ZOOM);
    // Only the coordinates should trigger a recenter, not the `map`
    // instance identity or DEFAULT_ZOOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1]]);
  return null;
}

// Leaflet measures its container once; if it was resized while hidden
// (e.g. /clinica keeps inactive tabs mounted with display:none) it would
// render with stale dimensions. Re-measure whenever the container's size
// actually changes — including going from hidden (0×0) to visible.
function InvalidateSizeOnResize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) map.invalidateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// Renders only once coordinates exist (from a successful geocode, a
// dragged marker, or a prior saved value); moving the marker only ever
// reports new coordinates upward, never touches address/city/state.
export function ClinicLocationMap({
  latitude,
  longitude,
  onMarkerMove,
  className = "h-40 w-full rounded-md sm:h-48",
}: {
  latitude: number;
  longitude: number;
  // Box size/shape; the default is the compact map every caller had.
  className?: string;
  // Omitted → a read-only map (e.g. the Patient Portal's "Dónde estamos");
  // Clínica's own sede editor passes it to make the marker draggable.
  onMarkerMove?: (next: { latitude: number; longitude: number }) => void;
}) {
  const center: [number, number] = [latitude, longitude];

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom={false}
      className={className}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker
        position={center}
        icon={pinIcon}
        draggable={Boolean(onMarkerMove)}
        eventHandlers={
          onMarkerMove
            ? {
                dragend(event) {
                  const marker = event.target as L.Marker;
                  const position = marker.getLatLng();
                  onMarkerMove({ latitude: position.lat, longitude: position.lng });
                },
              }
            : {}
        }
      />
      <RecenterOnChange center={center} />
      <InvalidateSizeOnResize />
    </MapContainer>
  );
}
