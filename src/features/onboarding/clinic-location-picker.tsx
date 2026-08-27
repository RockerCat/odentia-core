"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { INPUT_CLASS } from "./field-classes";
import { GeocodingError, locateOnMap } from "./geocoding";
import type { ClinicLocationData } from "./types";

// Leaflet touches window/document at import time — must never be part of
// the server-rendered bundle. Loaded client-side only, and only once
// there's a pin to show (see below).
const ClinicLocationMap = dynamic(() => import("./clinic-location-map").then((mod) => mod.ClinicLocationMap), {
  ssr: false,
  loading: () => <div className="mt-2.5 h-40 w-full animate-pulse rounded-md bg-foreground/5 sm:h-48" />,
});

const NOT_FOUND_MESSAGE =
  "No encontramos esta dirección. Puedes ajustar los datos e intentarlo de nuevo o continuar sin ubicarla en el mapa.";
const GENERIC_ERROR_MESSAGE =
  "No pudimos ubicar esta dirección en este momento. Puedes intentarlo de nuevo o continuar sin ubicarla en el mapa.";

// Paso 2's location sub-section: manual Dirección/Ciudad/Departamento
// fields (always editable, never blocked on any external service) plus an
// explicit "Ubicar en el mapa" action that geocodes them through our own
// backend (see geocoding.ts) and shows a compact, draggable Leaflet pin.
// `location` is lifted to onboarding-wizard.tsx (like clinic/role/logo
// already are) so it survives Paso 2 → Paso 3 → Atrás.
export function ClinicLocationPicker({
  location,
  onChange,
}: {
  location: ClinicLocationData;
  onChange: (next: ClinicLocationData) => void;
}) {
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Editing the address text after a successful geocode makes the
  // existing pin stale — it would point at a different place than what's
  // now on screen. Clear it and make the user re-confirm with "Ubicar en
  // el mapa" instead of silently persisting a mismatched pin.
  const updateField = (patch: Partial<Pick<ClinicLocationData, "locationAddress" | "locationCity" | "locationState">>) => {
    setLocateError(null);
    onChange({ ...location, ...patch, locationLatitude: null, locationLongitude: null });
  };

  const handleLocate = async () => {
    if (!location.locationAddress.trim() || locating) return;
    setLocating(true);
    setLocateError(null);
    const controller = new AbortController();

    try {
      const result = await locateOnMap(
        { address: location.locationAddress, city: location.locationCity, state: location.locationState },
        controller.signal,
      );
      if (!result) {
        setLocateError(NOT_FOUND_MESSAGE);
        return;
      }
      onChange({ ...location, locationLatitude: result.latitude, locationLongitude: result.longitude });
    } catch (error) {
      if (controller.signal.aborted) return;
      setLocateError(error instanceof GeocodingError ? error.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setLocating(false);
    }
  };

  // Dragging the marker only ever updates lat/lng — the address/city/state
  // text the user typed stays exactly as-is (see CLAUDE.md task scope: no
  // reverse geocoding in V1).
  const handleMarkerMove = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    onChange({ ...location, locationLatitude: latitude, locationLongitude: longitude });
  };

  const hasPin = location.locationLatitude !== null && location.locationLongitude !== null;

  return (
    <div>
      <p className="text-sm font-medium text-foreground/80">Ubicación de la sede principal</p>

      <div className="mt-2 flex flex-col gap-3">
        <label htmlFor="locationAddress" className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground/80">Dirección</span>
          <input
            id="locationAddress"
            className={INPUT_CLASS}
            value={location.locationAddress}
            onChange={(e) => updateField({ locationAddress: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label htmlFor="locationCity" className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground/80">Ciudad</span>
            <input
              id="locationCity"
              className={INPUT_CLASS}
              value={location.locationCity}
              onChange={(e) => updateField({ locationCity: e.target.value })}
            />
          </label>
          <label htmlFor="locationState" className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground/80">Departamento</span>
            <input
              id="locationState"
              className={INPUT_CLASS}
              value={location.locationState}
              onChange={(e) => updateField({ locationState: e.target.value })}
            />
          </label>
        </div>

        <div>
          <button
            type="button"
            onClick={handleLocate}
            disabled={!location.locationAddress.trim() || locating}
            className="text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
          >
            {locating ? "Ubicando..." : "Ubicar en el mapa"}
          </button>

          {locateError && <p className="mt-1.5 text-xs text-danger">{locateError}</p>}

          {hasPin && location.locationLatitude !== null && location.locationLongitude !== null && (
            <div className="mt-2.5">
              <ClinicLocationMap
                latitude={location.locationLatitude}
                longitude={location.locationLongitude}
                onMarkerMove={handleMarkerMove}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">Arrastra el marcador si la ubicación no es exacta.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
