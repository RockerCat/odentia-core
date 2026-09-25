import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { TeamMember } from "./data";

let rpcResult: { error: unknown } = { error: null };
const rpc = vi.fn(async () => rpcResult);
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

const { updateMyPersonalInfo, validatePersonalInfo } = await import("./personal-info-actions");
const { MyProfessionalProfileSection } = await import("./my-professional-profile-section");
const { PersonalInfoForm } = await import("./personal-info-form");

// "Editar información personal" (Mi perfil profesional): the signed-in
// user's OWN name/phone in profiles — the single source every surface reads.

beforeEach(() => {
  rpcResult = { error: null };
  rpc.mockClear();
});

describe("updateMyPersonalInfo", () => {
  it("saves trimmed name/phone through update_my_personal_info — never sending a user id", async () => {
    const outcome = await updateMyPersonalInfo({ firstName: "  Ana ", lastName: " Ruiz ", phone: " +57 300 123 4567 " });
    expect(outcome).toEqual({ status: "ok", value: { firstName: "Ana", lastName: "Ruiz", phone: "+57 300 123 4567" } });
    expect(rpc).toHaveBeenCalledWith("update_my_personal_info", { p_first_name: "Ana", p_last_name: "Ruiz", p_phone: "+57 300 123 4567" });
    const args = (rpc.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(Object.keys(args).some((k) => /id/i.test(k))).toBe(false);
  });

  it("an empty phone clears it (null); name and surname are required", async () => {
    expect(validatePersonalInfo({ firstName: "Ana", lastName: "Ruiz", phone: "  " })).toEqual({ value: { firstName: "Ana", lastName: "Ruiz", phone: null } });
    expect(validatePersonalInfo({ firstName: " ", lastName: "Ruiz", phone: "" })).toEqual({ error: "Escribe tu nombre y tu apellido." });
    expect("error" in validatePersonalInfo({ firstName: "Ana", lastName: "Ruiz", phone: "llámame" })).toBe(true);
    expect("error" in validatePersonalInfo({ firstName: "A".repeat(81), lastName: "Ruiz", phone: "" })).toBe(true);
  });

  it("invalid input never reaches the RPC; an RPC failure is a visible error, never a false success", async () => {
    expect((await updateMyPersonalInfo({ firstName: "", lastName: "", phone: "" })).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
    rpcResult = { error: { message: "invalid phone" } };
    expect(await updateMyPersonalInfo({ firstName: "Ana", lastName: "Ruiz", phone: "" })).toEqual({
      status: "error",
      message: "No pudimos guardar tus datos. Intenta de nuevo.",
    });
  });
});

describe("migration 20260925160000 — update_my_personal_info (static)", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20260925160000_update_my_personal_info.sql"), "utf8");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  it("always targets auth.uid() — no profile id parameter to spoof — and only name/phone", () => {
    expect(code).toContain("create function public.update_my_personal_info(p_first_name text, p_last_name text, p_phone text)");
    expect(code).toContain("v_profile_id uuid := auth.uid();");
    expect(code).toContain("where id = v_profile_id;");
    const set = code.slice(code.indexOf("update public.profiles"), code.indexOf("where id = v_profile_id;"));
    expect(set).not.toMatch(/email|avatar_url/);
  });

  it("is additive: no grant widening on profiles, no RLS/table change", () => {
    expect(code).not.toMatch(/\bgrant\s+(update|insert|delete)\b[^;]*on public\.profiles/i);
    expect(code).not.toMatch(/\b(alter table|create policy|alter policy|drop)\b/i);
  });
});

describe("/mi-perfil-profesional page layout", () => {
  const member = (overrides: Partial<TeamMember> = {}): TeamMember =>
    ({
      membershipId: "m1",
      profileId: "u1",
      firstName: "Ana",
      lastName: "Ruiz",
      email: "ana@clinica.co",
      phone: "+57 300 123 4567",
      avatarUrl: null,
      role: "dentist",
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
      ...overrides,
    }) as TeamMember;
  const render = (m: TeamMember, variant: "card" | "page" = "page") =>
    renderToStaticMarkup(
      createElement(
        ToastProvider,
        null,
        createElement(MyProfessionalProfileSection, { selfMember: m, specialties: [], documentTypes: [], onSaved: () => {}, variant }),
      ),
    );

  it("identity column first (large photo/initials, name, email, phone, personal edit), then the professional column", () => {
    const html = render(member());
    expect(html).toContain("lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]");
    const identity = html.indexOf('aria-label="Mi identidad"');
    const professional = html.indexOf('aria-label="Mi perfil profesional"');
    expect(identity).toBeGreaterThan(-1);
    expect(professional).toBeGreaterThan(identity);
    const identityHtml = html.slice(identity, professional);
    expect(identityHtml).toContain("size-52");
    expect(identityHtml).toContain(">AR</span>");
    expect(identityHtml).toContain("Ana Ruiz");
    expect(identityHtml).toContain("ana@clinica.co");
    expect(identityHtml).toContain("+57 300 123 4567");
    expect(identityHtml).toContain("Editar información personal");
    expect(identityHtml).toContain("Subir foto");
  });

  it("'Editar perfil profesional' sits at the top of the professional section, not as a bottom link", () => {
    const html = render(member());
    const section = html.slice(html.indexOf('aria-label="Mi perfil profesional"'));
    expect(section.match(/Editar perfil profesional/g)?.length).toBe(1);
    expect(section.indexOf("Editar perfil profesional")).toBeLessThan(section.indexOf("Especialidad"));
    expect(section).toContain("Ortodoncia");
    expect(section).toContain("RM-1");
  });

  it("no phone → no phone line (nothing invented)", () => {
    const html = render(member({ phone: null }));
    expect(html).not.toContain("+57");
  });

  it("/clinica's compact card variant is unchanged: no identity column, no personal edit, bottom edit link", () => {
    const html = render(member(), "card");
    expect(html).not.toContain('aria-label="Mi identidad"');
    expect(html).not.toContain("Editar información personal");
    expect(html).toContain("Editar perfil profesional");
    expect(html).toContain("size-16");
  });
});

describe("inline editing (no modal)", () => {
  const section = fs.readFileSync(path.resolve(__dirname, "my-professional-profile-section.tsx"), "utf8");

  it("the personal edit form renders inline with current values, read-only email + note, and Cancelar/Guardar", () => {
    const html = renderToStaticMarkup(
      createElement(PersonalInfoForm, {
        initial: { firstName: "Ana", lastName: "Ruiz", phone: "+57 300 123 4567" },
        email: "ana@clinica.co",
        onCancel: () => {},
        onSaved: () => {},
      }),
    );
    expect(html).not.toContain('role="dialog"');
    expect(html).toContain('value="Ana"');
    expect(html).toContain('value="Ruiz"');
    expect(html).toContain('value="+57 300 123 4567"');
    const emailInput = html.match(/<input[^>]*value="ana@clinica\.co"[^>]*>/)?.[0] ?? "";
    expect(emailInput).toMatch(/readonly=""/i);
    expect(emailInput).toContain('disabled=""');
    expect(html).toContain("Es tu correo de inicio de sesión; no se cambia desde aquí.");
    expect(html.indexOf("Cancelar")).toBeLessThan(html.indexOf("Guardar"));
  });

  it("no phone → an empty phone input, nothing invented", () => {
    const html = renderToStaticMarkup(
      createElement(PersonalInfoForm, { initial: { firstName: "Ana", lastName: "Ruiz", phone: null }, email: "a@x.co", onCancel: () => {}, onSaved: () => {} }),
    );
    expect(html).toMatch(/<input type="tel"[^>]*value=""/);
  });

  it("the personal column swaps read lines for the form in place (photo stays); the old modal is gone", () => {
    expect(section).not.toMatch(/PersonalInfoModal|role="dialog"/);
    expect(fs.existsSync(path.resolve(__dirname, "personal-info-modal.tsx"))).toBe(false);
    expect(section).toContain("{!editingPersonal && (");
    expect(section).toContain("{editingPersonal ? (\n              <PersonalInfoForm");
    // Cancel = back to read mode, no backend call; success = back to read + header refresh + toast.
    expect(section).toContain("onCancel={() => setEditingPersonal(false)}");
    expect(section).toContain("notifyIdentityChanged();");
  });

  it("only one section edits at a time", () => {
    expect(section).toContain("if (!professionalProfile || editingPersonal) return;");
    expect(section).toMatch(/const startCreate = \(\) => \{\n    if \(editingPersonal\) return;/);
    // "Editar información personal" is disabled while the professional form is open, and vice versa.
    expect(section).toContain("disabled={mode !== \"view\"}");
    expect(section.match(/disabled=\{editingPersonal\}/g)?.length).toBe(2);
  });

  it("the professional edit stays inline in the same section, reusing the existing form/actions", () => {
    expect(section).toContain("{mode === \"editing\" || mode === \"creating\" ? (\n        <ProfileForm");
    expect(section).toContain("await updateMyProfessionalProfile(input, specialtyNameById)");
  });
});
