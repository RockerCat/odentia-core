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
    expect(CLINIC_TABS.map((t) => t.label)).toEqual(["Información", "Equipo", "RIPS", "Portal del paciente"]);
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

  it("Equipo: the team section (+ a discreet link to her own professional profile, only when she has one)", () => {
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

  it("Portal del paciente: description, then cover, then gallery", () => {
    const portal = panel(render(), "portal");
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

  it("/clinica#rips opens the RIPS tab (the /rips 'Corregir' links)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "clinic-settings-screen.tsx"), "utf8");
    expect(src).toContain('if (window.location.hash !== "#rips") return;');
    expect(src).toContain('setTab("rips");');
    expect(src).toContain('window.addEventListener("hashchange", syncFromHash);');
  });
});
