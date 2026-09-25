"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { updatePrimaryLocation } from "@/features/clinic/actions";
import type { PrimaryLocation } from "@/features/clinic/data";
import { FIELD_CLASS } from "@/features/dashboard/form-primitives";
import { GeocodingError, locateOnMap } from "@/features/location/geocoding";

// Leaflet touches window/document at import time — must never be part of
// the server-rendered bundle. Same shared map as onboarding — see
// src/features/location/clinic-location-map.tsx.
const ClinicLocationMap = dynamic(
  () => import("@/features/location/clinic-location-map").then((mod) => mod.ClinicLocationMap),
  {
    ssr: false,
    loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-foreground/5 lg:h-72" />,
  },
);

const NOT_FOUND_MESSAGE = "No encontramos esta dirección. Puedes ajustar los datos e intentarlo de nuevo.";
const GENERIC_ERROR_MESSAGE = "No pudimos ubicar esta dirección en este momento. Intenta de nuevo más tarde.";

// "Ubicación de la sede principal" — real address/city/state + map, editing
// the ONE existing is_primary clinic_locations row (never creates a
// second one — see CLAUDE.md task scope, section 6). Reuses the exact same
// geocoding/map pieces as the real onboarding (see
// src/features/location/{geocoding,clinic-location-map}.tsx) and the same
// invalidate-coordinates-on-text-edit rule: editing address/city/state
// after a pin existed would otherwise leave a mismatched
// "dirección A + coordenadas de dirección B" — clearing lat/lng and
// requiring "Ubicar en el mapa" again is what prevents that (same as
// onboarding's ClinicLocationPicker).
export function PrimaryLocationSection({ location }: { location: PrimaryLocation | null }) {
  const [address, setAddress] = useState(location?.address ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [state, setState] = useState(location?.state ?? "");
  const [latitude, setLatitude] = useState<number | null>(location?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(location?.longitude ?? null);
  const [dirty, setDirty] = useState(false);

  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!location) {
    return (
      <div>
        <p className="text-sm font-medium text-foreground/80">Ubicación de la sede principal</p>
        <p className="mt-1 text-xs text-muted-foreground">Dirección no configurada.</p>
      </div>
    );
  }

  // Editing the address text after a successful geocode/drag makes the
  // existing pin stale — it would point at a different place than what's
  // now on screen. Clear it and make the user re-confirm with "Ubicar en
  // el mapa" instead of silently persisting a mismatched pin.
  const updateField = (patch: Partial<{ address: string; city: string; state: string }>) => {
    setSaveError(null);
    setLocateError(null);
    if (patch.address !== undefined) setAddress(patch.address);
    if (patch.city !== undefined) setCity(patch.city);
    if (patch.state !== undefined) setState(patch.state);
    setLatitude(null);
    setLongitude(null);
    setDirty(true);
  };

  const handleLocate = async () => {
    if (!address.trim() || locating) return;
    setLocating(true);
    setLocateError(null);
    const controller = new AbortController();

    try {
      const result = await locateOnMap({ address, city, state }, controller.signal);
      if (!result) {
        setLocateError(NOT_FOUND_MESSAGE);
        return;
      }
      setLatitude(result.latitude);
      setLongitude(result.longitude);
      setDirty(true);
    } catch (error) {
      if (controller.signal.aborted) return;
      setLocateError(error instanceof GeocodingError ? error.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setLocating(false);
    }
  };

  // Dragging the marker only ever updates lat/lng — the address/city/state
  // text stays exactly as-is (no reverse geocoding in V1, same as
  // onboarding).
  const handleMarkerMove = ({ latitude: lat, longitude: lng }: { latitude: number; longitude: number }) => {
    setLatitude(lat);
    setLongitude(lng);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const outcome = await updatePrimaryLocation(location.id, { address, city, state, latitude, longitude });
    setSaving(false);
    if (outcome.status === "error") {
      setSaveError("No pudimos guardar la ubicación. Intenta de nuevo.");
      return;
    }
    setDirty(false);
  };

  const hasPin = latitude !== null && longitude !== null;

  return (
    <div>
      <p className="text-sm font-medium text-foreground/80">Ubicación de la sede principal</p>

      {/* lg+: map left, fields right (~50/50). Below lg: fields first, then
          the full-width map (DOM order; the map is moved first only at lg). */}
      <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-label-foreground">Dirección</span>
            <input
              className={FIELD_CLASS}
              value={address}
              placeholder="Dirección no configurada"
              onChange={(e) => updateField({ address: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-label-foreground">Ciudad</span>
            <input
              className={FIELD_CLASS}
              value={city}
              placeholder="No configurada"
              onChange={(e) => updateField({ city: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-label-foreground">Departamento</span>
            <input
              className={FIELD_CLASS}
              value={state}
              placeholder="No configurado"
              onChange={(e) => updateField({ state: e.target.value })}
            />
          </label>

          <div>
            <button
              type="button"
              onClick={handleLocate}
              disabled={!address.trim() || locating}
              className="text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
            >
              {locating ? "Ubicando…" : hasPin ? "Actualizar ubicación" : "Ubicar en el mapa"}
            </button>
            {locateError && <p className="mt-1.5 text-xs text-danger">{locateError}</p>}
          </div>

          {dirty && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar ubicación"}
              </button>
              {saveError && <p className="text-xs text-danger">{saveError}</p>}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col lg:order-first">
          {hasPin ? (
            <>
              <ClinicLocationMap
                latitude={latitude}
                longitude={longitude}
                onMarkerMove={handleMarkerMove}
                className="h-64 w-full rounded-lg lg:h-auto lg:min-h-72 lg:flex-1"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">Arrastra el marcador si la ubicación no es exacta.</p>
            </>
          ) : (
            <p className="flex min-h-32 flex-1 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
              Esta sede aún no está ubicada en el mapa.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
