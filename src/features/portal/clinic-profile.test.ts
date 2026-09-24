import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PrimaryLocation } from "@/features/clinic/data";
import { directionsUrl, formatClinicAddress, hasUsableCoordinates, teamCards } from "./clinic-profile";

// /portal/clinica — real clinic profile only; every missing piece omitted.

function location(overrides: Partial<PrimaryLocation> = {}): PrimaryLocation {
  return {
    id: "loc-1",
    name: "Sede principal",
    address: "Cra 10 # 20-30",
    city: "Tunja",
    state: "Boyacá",
    country: "CO",
    phone: null,
    timezone: "America/Bogota",
    latitude: 5.5353,
    longitude: -73.3678,
    codPrestador: null,
    ...overrides,
  };
}

describe("Dónde estamos", () => {
  it("map only with usable coordinates — never a broken map", () => {
    expect(hasUsableCoordinates(location())).toBe(true);
    expect(hasUsableCoordinates(null)).toBe(false);
    expect(hasUsableCoordinates(location({ latitude: null }))).toBe(false);
    expect(hasUsableCoordinates(location({ longitude: null }))).toBe(false);
    expect(hasUsableCoordinates(location({ latitude: 0, longitude: 0 }))).toBe(false);
    expect(hasUsableCoordinates(location({ latitude: 95 }))).toBe(false);
    expect(hasUsableCoordinates(location({ longitude: Number.NaN }))).toBe(false);
  });

  it("'Cómo llegar' uses exact coordinates, falls back to the real address, and is absent without either", () => {
    expect(directionsUrl(location())).toBe("https://www.google.com/maps/dir/?api=1&destination=5.5353,-73.3678");
    expect(directionsUrl(location({ latitude: null, longitude: null }))).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("Cra 10 # 20-30, Tunja, Boyacá")}`,
    );
    expect(directionsUrl(location({ latitude: null, longitude: null, address: null, city: " ", state: null }))).toBeNull();
    expect(directionsUrl(null)).toBeNull();
  });

  it("address joins only real parts; none → null (no invented text)", () => {
    expect(formatClinicAddress(location({ state: null }))).toBe("Cra 10 # 20-30, Tunja");
    expect(formatClinicAddress(location({ address: null, city: null, state: null }))).toBeNull();
  });
});

describe("Nuestro equipo", () => {
  it("real fields only; missing photo/specialty/registro are omitted, never invented", () => {
    expect(
      teamCards([
        { professionalProfileId: "p1", name: "Admin Borcelle 2", avatarUrl: "https://x/avatar.png", specialty: "Ortodoncia", licenseNumber: "RM-1" },
        { professionalProfileId: "p2", name: "Ana Ruiz", avatarUrl: null, specialty: null, licenseNumber: "  " },
      ]),
    ).toEqual([
      { id: "p1", name: "Admin Borcelle 2", avatarUrl: "https://x/avatar.png", specialty: "Ortodoncia", licenseNumber: "RM-1" },
      { id: "p2", name: "Ana Ruiz", avatarUrl: undefined, specialty: null, licenseNumber: null },
    ]);
    expect(teamCards([])).toEqual([]);
  });
});

describe("/portal/clinica sources", () => {
  const screen = fs.readFileSync(path.resolve(__dirname, "my-clinic-screen.tsx"), "utf8");
  const page = fs.readFileSync(path.resolve(__dirname, "../../app/portal/clinica/page.tsx"), "utf8");
  const code = (text: string) => text.split("\n").filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l)).join("\n");

  it("every read is scoped to the patient's own resolved clinic (never a URL/prop id)", () => {
    expect(page).toContain("const context = await resolvePatientContext(supabase);");
    expect(page).toContain("fetchClinicGalleryPhotos(supabase, clinicId)");
    expect(page).toContain("fetchMyClinicProfessionals(supabase)");
    expect(page).not.toMatch(/\bparams\b|searchParams/);
  });

  it("sections hide without data; no invented content", () => {
    expect(code(screen)).toContain("{gallery.status === \"ok\" && gallery.value.length > 0 && (");
    expect(code(screen)).toContain("{team.length > 0 && (");
    expect(code(screen)).toContain("{showMap && location && (");
    expect(code(screen)).not.toMatch(/Odontología general|placeholder|demo/i);
  });

  // No local Postgres here (same caveat as every SQL test in this repo).
  it("the team comes from get_my_clinic_professionals(): active clinical professionals of her own clinic only", () => {
    const sql = fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20260908090000_create_appointment_requests.sql"), "utf8");
    const fn = sql.slice(sql.indexOf("create function public.get_my_clinic_professionals()"), sql.indexOf("revoke execute on function public.get_my_clinic_professionals()"));
    expect(fn).toContain("where pp.active");
    expect(fn).toContain("and m.status = 'active'");
    expect(fn).toContain("and m.role in ('clinic_admin', 'dentist')");
    expect(fn).toContain("and pt.clinic_id = pp.clinic_id");
    expect(fn).toContain("where l.profile_id = auth.uid()");
  });
});
