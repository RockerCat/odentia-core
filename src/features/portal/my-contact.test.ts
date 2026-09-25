import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";

let rpcResult: { error: unknown } = { error: null };
const rpc = vi.fn(async () => rpcResult);
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

const { updateMyPatientPhone } = await import("./my-contact-actions");
const { MyProfileCard } = await import("./my-profile-card");
const { buildMyProfileCardData, formatBirthDate } = await import("./my-profile");

// /portal/perfil: the patient edits ONLY her own phone (patients.phone —
// what the Portal, Pacientes and Agenda show). Everything else read-only.

beforeEach(() => {
  rpcResult = { error: null };
  rpc.mockClear();
});

describe("updateMyPatientPhone", () => {
  it("saves the trimmed phone via update_my_patient_phone — never an id", async () => {
    expect(await updateMyPatientPhone("  +57 300 123 4567 ")).toEqual({ status: "ok", value: "+57 300 123 4567" });
    expect(rpc).toHaveBeenCalledWith("update_my_patient_phone", { p_phone: "+57 300 123 4567" });
  });

  it("empty clears it; an invalid phone never reaches the RPC; an RPC failure is a visible error", async () => {
    expect(await updateMyPatientPhone("   ")).toEqual({ status: "ok", value: null });
    rpc.mockClear();
    expect((await updateMyPatientPhone("llámame")).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
    rpcResult = { error: { message: "no single linked patient record" } };
    expect(await updateMyPatientPhone("3001234567")).toEqual({ status: "error", message: "No pudimos guardar tu teléfono. Intenta de nuevo." });
  });
});

describe("migration 20260925170000 — update_my_patient_phone (static)", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20260925170000_update_my_patient_phone.sql"), "utf8");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  it("resolves her own patient row from auth.uid() (exactly one link), and only writes phone", () => {
    expect(code).toContain("create function public.update_my_patient_phone(p_phone text)");
    expect(code).toContain("where l.profile_id = auth.uid();");
    expect(code).toContain("if v_links <> 1 then");
    const set = code.slice(code.indexOf("update public.patients"), code.indexOf("where id = v_patient_id;"));
    expect(set.replace(/\s+/g, " ").trim()).toBe("update public.patients set phone = v_phone");
  });

  it("is additive: no grant widening on patients, no RLS/table change", () => {
    expect(code).not.toMatch(/\bgrant\s+(update|insert|delete)\b[^;]*on public\.patients/i);
    expect(code).not.toMatch(/\b(alter table|create policy|alter policy|drop)\b/i);
  });
});

describe("/portal/perfil card", () => {
  type Ok = Parameters<typeof buildMyProfileCardData>[0];
  const context = (patient: Partial<Ok["patient"]> = {}): Ok => ({
    status: "ok",
    profile: { id: "u1", firstName: "X", lastName: "Y", email: "x@y.co", phone: null, avatarUrl: null },
    patient: {
      id: "p1",
      firstName: "Alex",
      lastName: "Paciente",
      email: "alexsosa.me+pacienteborcelle2@gmail.com",
      phone: "+573173672033",
      documentId: "423423424343",
      documentType: "CC",
      documentNumber: "423423424343",
      birthDate: "2006-03-12",
      clinicId: "c1",
      ...patient,
    },
    clinic: { id: "c1", name: "Clinica Borcelle 2", slug: "c", logoUrl: null, phone: null, status: "active", description: null, coverUrl: null },
  });
  const render = (data: ReturnType<typeof buildMyProfileCardData>) =>
    renderToStaticMarkup(createElement(ToastProvider, null, createElement(MyProfileCard, { data })));

  it("birth date is a calendar date (no timezone shift)", () => {
    expect(formatBirthDate("2006-03-12")).toBe("12 de marzo de 2006");
  });

  it("document: RIPS type label + number when set; the legacy free-text document otherwise", () => {
    expect(buildMyProfileCardData(context(), "Cédula ciudadanía", null)).toMatchObject({ documentTypeLabel: "Cédula ciudadanía", documentNumber: "423423424343" });
    expect(buildMyProfileCardData(context(), null, null)).toMatchObject({ documentTypeLabel: "CC" });
    expect(buildMyProfileCardData(context({ documentType: null, documentNumber: null, documentId: "CC 99" }), null, null)).toMatchObject({
      documentTypeLabel: null,
      documentNumber: "CC 99",
    });
  });

  it("identity column first (photo, name, age, inline edit) → Mi información → Mi clínica; lg 30/70", () => {
    const html = render(buildMyProfileCardData(context(), "Cédula ciudadanía", { name: "Admin Borcelle 2", specialty: "Ortodoncia", avatarUrl: null }));
    expect(html).toContain("lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]");
    const at = (label: string) => html.indexOf(`aria-label="${label}"`);
    expect(at("Mi identidad")).toBeGreaterThan(-1);
    expect(at("Mi información")).toBeGreaterThan(at("Mi identidad"));
    expect(at("Mi clínica")).toBeGreaterThan(at("Mi información"));
    const identity = html.slice(at("Mi identidad"), at("Mi información"));
    expect(identity).toContain("size-40 lg:size-52");
    expect(identity).toContain("Alex Paciente");
    expect(identity).toMatch(/\d+ años/);
    expect(identity).toContain("Editar información personal");
    expect(html).not.toContain('role="dialog"');
    const info = html.slice(at("Mi información"), at("Mi clínica"));
    // Email breaks after "@" (user / domain) rather than mid-domain.
    expect(info).toContain("alexsosa.me+pacienteborcelle2@<wbr/>gmail.com");
    for (const text of ["Fecha de nacimiento", "12 de marzo de 2006", "+573173672033", "Tipo de documento", "Cédula ciudadanía", "Número de documento"]) {
      expect(info).toContain(text);
    }
    // Age lives under the name only.
    expect(info).not.toContain("años");
    const clinic = html.slice(at("Mi clínica"));
    expect(clinic).toContain("Clinica Borcelle 2");
    expect(clinic).toContain("Tu odontólogo habitual");
    expect(clinic).toContain("Admin Borcelle 2");
    expect(clinic).toContain("Ortodoncia");
  });

  it("usual dentist shows her own avatar (object-cover), or her real initials without a photo", () => {
    const clinicOf = (html: string) => html.slice(html.indexOf('aria-label="Mi clínica"'));
    const withPhoto = clinicOf(
      render(buildMyProfileCardData(context(), null, { name: "Admin Borcelle 2", specialty: "Ortodoncia", avatarUrl: "https://x/admin.jpg" })),
    );
    expect(withPhoto).toMatch(/<img[^>]*src="https:\/\/x\/admin\.jpg"[^>]*class="size-11 shrink-0 rounded-full object-cover"/);
    expect(withPhoto.indexOf("admin.jpg")).toBeLessThan(withPhoto.indexOf("Admin Borcelle 2</span>"));
    const initials = clinicOf(render(buildMyProfileCardData(context(), null, { name: "Admin Borcelle 2", specialty: null, avatarUrl: null })));
    expect(initials).toMatch(/<span class="flex size-11 [^"]*rounded-full[^"]*">A2<\/span>/);
    expect(initials).not.toContain("<img");
    expect(initials).not.toContain("text-xs font-medium text-primary");
  });

  it("the page passes the usual dentist's profiles.avatar_url from the same team card (no extra query)", () => {
    const page = fs.readFileSync(path.resolve(__dirname, "../../app/portal/perfil/page.tsx"), "utf8");
    expect(page).toContain("usualDentist = { name: card.name, specialty: card.specialty, avatarUrl: card.avatarUrl ?? null }");
  });

  it("no usual dentist → the row is simply omitted; missing values read 'No registrado'", () => {
    const html = render(buildMyProfileCardData(context({ phone: null, birthDate: null }), null, null));
    expect(html).not.toContain("Tu odontólogo habitual");
    expect(html.match(/No registrado/g)?.length).toBe(2);
  });

  it("edit mode offers ONLY the phone as editable; email disabled; same save logic (source)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "my-profile-card.tsx"), "utf8");
    expect(src.match(/readOnly disabled/g)?.length).toBe(1);
    expect(src.match(/<input/g)?.length).toBe(2);
    expect(src).toContain("await updateMyPatientPhone(draft)");
    expect(src).toContain("Es tu correo de inicio de sesión; no se cambia desde aquí.");
    expect(src).toContain("Tu nombre, documento y fecha de nacimiento los actualiza tu clínica.");
    expect(src).toContain("onClick={() => setEditing(false)}");
  });

  it("the usual dentist reuses /portal/clinica's exact rule and sources", () => {
    const page = fs.readFileSync(path.resolve(__dirname, "../../app/portal/perfil/page.tsx"), "utf8");
    expect(page).toContain("fetchPatientClinicalEncounters(supabase, clinic.id, patient.id).then(usualDentistProfileIdFrom");
    expect(page).toContain("teamCards(teamRows, clinic.id, usualDentistProfileId).find((c) => c.isUsualDentist)");
  });
});
