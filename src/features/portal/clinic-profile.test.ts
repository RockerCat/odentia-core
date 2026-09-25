import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PrimaryLocation } from "@/features/clinic/data";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CLINIC_COVER_FALLBACK_SRC, resolveClinicCover, type ClinicGalleryPhoto } from "@/features/clinic/clinic-media-data";
import type { PatientClinic } from "@/features/session/types";
import {
  directionsUrl,
  formatClinicAddress,
  galleryGridClass,
  galleryLayout,
  galleryTileClass,
  hasUsableCoordinates,
  teamCards,
} from "./clinic-profile";
import { MyClinicScreen } from "./my-clinic-screen";

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
    expect(code(screen)).toContain("{layout && (");
    expect(code(screen)).toContain("{team.length > 0 && (");
    expect(code(screen)).toContain("{showMap && location && (");
    expect(code(screen)).not.toMatch(/Odontología general|placeholder|demo/i);
  });

  it("'Sobre nosotros': only with a real description, after identity/contact and before 'Dónde estamos', line breaks kept", () => {
    const body = code(screen);
    expect(body).toContain("const description = normalizeClinicDescription(clinic?.description);");
    const section = body.slice(body.indexOf("{description && ("), body.indexOf("{(showMap || directions) && ("));
    expect(section).toContain("Sobre nosotros");
    expect(section).toContain("whitespace-pre-line");
    expect(section).toContain("{description}</p>");
    expect(body.indexOf("{description && (")).toBeGreaterThan(body.indexOf("WhatsApp"));
    expect(body.indexOf("{description && (")).toBeLessThan(body.indexOf("Dónde estamos"));
    // Null/blank → nothing rendered at all (no empty card, no placeholder).
    expect(body.match(/Sobre nosotros/g)?.length).toBe(1);
    expect(section).not.toMatch(/No configurado|EMPTY_VALUE|:\s*null/);
  });

  it("the description is read only through resolvePatientContext()'s own clinic embed (patient-scoped)", () => {
    const resolver = fs.readFileSync(path.resolve(__dirname, "../session/resolve-patient-context.ts"), "utf8");
    expect(resolver).toContain("clinic:clinics(id, name, slug, logo_url, phone, status, description, cover_url))");
    expect(resolver).toContain('.eq("profile_id", user.id)');
    expect(resolver).toContain("description: clinicRow.description,");
    expect(page).toContain("if (context.status === \"ok\") clinic = context.clinic;");
    expect(page).not.toMatch(/from\("clinics"\)/);
  });

  it("'Nuestro equipo' cards: responsive grid, one prominent avatar (photo or same-size initials), optional lines only when real", () => {
    const team = screen.slice(screen.indexOf("{team.length > 0 && ("), screen.indexOf('{professionals.status === "error" && ('));
    expect(team).toContain('className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"');
    expect(team).toContain("max-w-[320px]");
    // One UserAvatar for both cases → a real photo and the initials fallback share size/prominence.
    expect(team.match(/<UserAvatar/g)?.length).toBe(1);
    expect(team).toContain('sizeClassName="size-24 ring-4 ring-background shadow-sm"');
    expect(team).toContain("{member.specialty && <p");
    expect(team).toContain("{member.licenseNumber && (");
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

describe("Portada (hero)", () => {
  const clinic = (overrides: Partial<PatientClinic> = {}): PatientClinic => ({
    id: "c1",
    name: "Clínica Borcelle",
    slug: "borcelle",
    logoUrl: null,
    phone: null,
    status: "active",
    description: null,
    coverUrl: null,
    ...overrides,
  });
  const render = (c: PatientClinic, loc: PrimaryLocation | null = null, photos: ClinicGalleryPhoto[] = []) =>
    renderToStaticMarkup(
      createElement(MyClinicScreen, { clinic: c, location: loc, gallery: { status: "ok", value: photos }, professionals: { status: "ok", value: [] } }),
    );
  const COVER = "https://proj.supabase.co/storage/v1/object/public/clinic-media/c1/cover?v=1";

  it("no configured cover → the bundled generic asset (resolved at render, never a stored value)", () => {
    expect(resolveClinicCover(null)).toEqual({ src: CLINIC_COVER_FALLBACK_SRC, isFallback: true });
    expect(resolveClinicCover("  ")).toEqual({ src: CLINIC_COVER_FALLBACK_SRC, isFallback: true });
    expect(CLINIC_COVER_FALLBACK_SRC.startsWith("/")).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, "../../../public", CLINIC_COVER_FALLBACK_SRC.slice(1)))).toBe(true);
    expect(render(clinic())).toContain(`src="${CLINIC_COVER_FALLBACK_SRC}"`);
  });

  it("a real cover is shown as-is instead of the fallback", () => {
    expect(resolveClinicCover(COVER)).toEqual({ src: COVER, isFallback: false });
    const html = render(clinic({ coverUrl: COVER }));
    expect(html).toContain(`src="${COVER}"`);
    expect(html).not.toContain(CLINIC_COVER_FALLBACK_SRC);
  });

  it("identity/contact over the cover shows only real data — nothing invented when missing", () => {
    const bare = render(clinic());
    expect(bare).toContain("Clínica Borcelle");
    expect(bare).not.toMatch(/No registrado|WhatsApp|tel:|Logo de|Dónde estamos|Conoce nuestra clínica/);

    const full = render(clinic({ phone: "+57 300 123 4567", logoUrl: "https://x/logo.png" }), location());
    expect(full).toContain('href="https://wa.me/573001234567"');
    expect(full).toContain('href="tel:+573001234567"');
    expect(full).toContain('alt="Logo de Clínica Borcelle"');
    // The address lives on the portada only — not repeated in "Dónde estamos".
    expect(full.match(/Cra 10 # 20-30, Tunja, Boyacá/g)?.length).toBe(1);
  });
});

describe("Conoce nuestra clínica — editorial gallery", () => {
  const photos = (n: number): ClinicGalleryPhoto[] =>
    Array.from({ length: n }, (_, i) => ({ id: `g${i}`, storagePath: `c1/gallery/g${i}`, url: `https://x/g${i}.jpg`, createdAt: `2026-09-2${i}` }));

  it("picks the variant by count", () => {
    expect(galleryLayout(0)).toBeNull();
    expect(galleryLayout(1)).toBe("single");
    expect(galleryLayout(2)).toBe("pair");
    for (const n of [3, 4, 5]) expect(galleryLayout(n)).toBe("editorial");
  });

  it("mobile-first: never more than 2 per row below lg; pair is 1 col on mobile, 50/50 from sm", () => {
    expect(galleryGridClass("single")).toBe("grid grid-cols-1");
    expect(galleryGridClass("pair")).toMatch(/^grid grid-cols-1 .*sm:grid-cols-2/);
    expect(galleryGridClass("editorial")).toMatch(/^grid grid-cols-2 .*lg:grid-cols-4 lg:grid-rows-2/);
  });

  it("editorial: a wide main photo + secondaries; an odd secondary out spans the row (no orphan gap)", () => {
    expect(galleryTileClass("editorial", 0, 5)).toContain("col-span-2");
    expect(galleryTileClass("editorial", 0, 5)).toContain("lg:row-span-2");
    // 3 photos: 2 secondaries side by side on mobile, stacked halves on desktop.
    expect(galleryTileClass("editorial", 1, 3)).toContain("lg:col-span-2");
    // 4 photos: the last of 3 secondaries spans 2.
    expect(galleryTileClass("editorial", 3, 4)).toMatch(/^col-span-2/);
    expect(galleryTileClass("editorial", 1, 4)).not.toContain("col-span-2");
    // 5 photos: 4 secondaries fill a 2×2 area.
    for (const i of [1, 2, 3, 4]) expect(galleryTileClass("editorial", i, 5)).not.toContain("col-span");
  });

  it("renders every photo in stored order with object-cover (never distorted), and nothing without photos", () => {
    const clinicRow: PatientClinic = { id: "c1", name: "C", slug: "c", logoUrl: null, phone: null, status: "active", description: null, coverUrl: null };
    const html = renderToStaticMarkup(
      createElement(MyClinicScreen, { clinic: clinicRow, location: null, gallery: { status: "ok", value: photos(4) }, professionals: { status: "ok", value: [] } }),
    );
    const order = [0, 1, 2, 3].map((i) => html.indexOf(`https://x/g${i}.jpg`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.match(/object-cover/g)?.length).toBe(5); // 4 photos + the cover
    expect(html).toContain("Conoce nuestra clínica");
  });
});
