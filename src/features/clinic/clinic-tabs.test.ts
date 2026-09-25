import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { ClinicDetail, TeamMember } from "./data";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => "/clinica" }));

const { ClinicSettingsScreen, CLINIC_TABS } = await import("./clinic-settings-screen");

// /clinica reorganized into client-side tabs — same sections, same
// behavior, nothing duplicated, "Mi información profesional" removed.

const clinic: ClinicDetail = {
  id: "c1",
  name: "Clinica Borcelle 2",
  legalName: null,
  taxId: "900123",
  email: "hola@borcelle.co",
  phone: "+57 300",
  logoUrl: null,
  status: "active",
  createdAt: "2026-09-01",
  trialEndsAt: null,
  description: "Marketing de la clínica",
  coverUrl: null,
};
const self: TeamMember = {
  membershipId: "m1",
  profileId: "u1",
  firstName: "Admin",
  lastName: "Borcelle 2",
  email: "admin@borcelle.co",
  phone: null,
  avatarUrl: null,
  role: "clinic_admin",
  status: "active",
  professionalProfile: {
    id: "pp1",
    active: true,
    licenseNumber: "RM-1",
    specialtyId: null,
    specialtyName: "Ortodoncia",
    defaultAppointmentDurationMinutes: 30,
    bio: null,
    documentType: null,
    documentNumber: null,
  },
} as TeamMember;

const render = (selfMember: TeamMember | null = self) =>
  renderToStaticMarkup(
    createElement(
      ToastProvider,
      null,
      createElement(ClinicSettingsScreen, {
        clinic,
        location: null,
        members: selfMember ? [selfMember] : [],
        selfMember,
        pendingInvitations: [],
        rooms: [],
        ripsRelevantSpecialties: [],
        ripsConfirmedServices: [],
        ripsSuggestions: [],
        ripsGrupoServiciosOptions: [],
        ripsServiciosOptions: [],
        galleryPhotos: [],
      }),
    ),
  );

const panel = (html: string, id: string) => {
  const start = html.indexOf(`id="clinica-panel-${id}"`);
  const next = html.indexOf('id="clinica-panel-', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
};

describe("/clinica tabs", () => {
  it("four tabs in order, Información selected by default; the others are hidden (still mounted)", () => {
    expect(CLINIC_TABS.map((t) => t.label)).toEqual(["Información", "Equipo", "RIPS", "Portal público"]);
    const html = render();
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/id="clinica-tab-info"[^>]*aria-selected="true"/);
    for (const id of ["equipo", "rips", "portal"]) {
      expect(html).toMatch(new RegExp(`id="clinica-tab-${id}"[^>]*aria-selected="false"`));
      expect(html).toMatch(new RegExp(`id="clinica-panel-${id}"[^>]*hidden=""`));
    }
    expect(html).not.toMatch(/id="clinica-panel-info"[^>]*hidden=""/);
  });

  it("Información: datos generales + logo, ubicación, consultorios — in that order, no description", () => {
    const info = panel(render(), "info");
    const order = ["Información general", "Logo de la clínica", "Consultorios"].map((t) => info.indexOf(t));
    expect(order.every((i) => i > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(info).toContain("NIT");
    expect(info).not.toContain("Descripción de la clínica");
  });

  it("Equipo: member cards (80px photo/initials, name, role, specialty, status, same actions) — 1 per row, 2 from lg", () => {
    const equipo = panel(render(), "equipo");
    expect(equipo).toContain('<ul class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">');
    const card = equipo.slice(equipo.indexOf("<li"), equipo.indexOf("</li>"));
    expect(card).toMatch(/<span class="flex size-20[^"]*">AB<\/span>/);
    expect(card).toContain("Admin Borcelle 2");
    expect(card).toContain("Administrador · Odontólogo");
    expect(card).toContain(">Ortodoncia</p>");
    expect(card).toContain("Activo");
    for (const action of ["Subir foto", "Editar", "Desactivar"]) expect(card).toContain(action);
    expect(equipo.indexOf("Invitaciones pendientes")).toBeGreaterThan(equipo.indexOf("</ul>"));
  });

  it("Equipo: a discreet link to her own professional profile, only when she has one", () => {
    const equipo = panel(render(), "equipo");
    expect(equipo).toContain("Agregar miembro");
    expect(equipo).toContain('href="/mi-perfil-profesional"');
    expect(panel(render({ ...self, professionalProfile: null }), "equipo")).not.toContain("/mi-perfil-profesional");
  });

  it("RIPS: Configuración RIPS then Servicios RIPS por especialidad; #rips anchor kept", () => {
    const rips = panel(render(), "rips");
    expect(rips).toContain('id="rips"');
    expect(rips.indexOf("Configuración RIPS")).toBeLessThan(rips.indexOf("Servicios RIPS por especialidad"));
  });

  it("Portal público: description on top, then cover | gallery side by side from lg", () => {
    const portal = panel(render(), "portal");
    expect(portal).toContain(">Portal público</h2>");
    expect(portal).not.toContain("Portal del paciente</h2>");
    const pair = portal.slice(portal.indexOf("lg:grid-cols-2"));
    expect(pair.indexOf("Foto de portada")).toBeGreaterThan(-1);
    expect(pair.indexOf("Fotos de la clínica")).toBeGreaterThan(pair.indexOf("Foto de portada"));
    expect(portal).toContain("Personaliza cómo ven tus pacientes la clínica en su Portal.");
    const order = ["Descripción de la clínica", "Foto de portada", "Fotos de la clínica"].map((t) => portal.indexOf(t));
    expect(order.every((i) => i > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(portal).toContain("Marketing de la clínica");
  });

  it("nothing duplicated; 'Mi información profesional' is gone from /clinica", () => {
    const html = render();
    expect(html.match(/>Descripción de la clínica<\/dt>/g)?.length).toBe(1);
    expect(html.match(/Foto de portada/g)?.length).toBe(1);
    expect(html).not.toMatch(/Mi información profesional|Mi perfil profesional<\/h2>|Editar perfil profesional/);
  });

  it("Información: location is fields + map, map first only at lg; the map re-measures after being hidden", () => {
    const location = fs.readFileSync(path.resolve(__dirname, "primary-location-section.tsx"), "utf8");
    expect(location).toContain('<div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">');
    expect(location).toContain('<div className="flex min-w-0 flex-col lg:order-first">');
    expect(location.indexOf("Dirección</span>")).toBeLessThan(location.indexOf("<ClinicLocationMap\n"));
    const map = fs.readFileSync(path.resolve(__dirname, "../location/clinic-location-map.tsx"), "utf8");
    expect(map).toContain("new ResizeObserver(");
    expect(map).toContain("map.invalidateSize()");
    // Portal's read-only map keeps its default size.
    expect(map).toContain('className = "h-40 w-full rounded-md sm:h-48"');
  });

  it("/clinica#rips opens the RIPS tab (the /rips 'Corregir' links)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "clinic-settings-screen.tsx"), "utf8");
    expect(src).toContain('if (window.location.hash !== "#rips") return;');
    expect(src).toContain('setTab("rips");');
    expect(src).toContain('window.addEventListener("hashchange", syncFromHash);');
  });
});
