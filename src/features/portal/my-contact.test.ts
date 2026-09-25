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
const { MyContactDetails } = await import("./my-contact-details");

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

describe("MyContactDetails — read mode", () => {
  const render = (phone: string | null) =>
    renderToStaticMarkup(
      createElement(ToastProvider, null, createElement(MyContactDetails, { phone, email: "alexsosa.me+paciente@gmail.com", documentId: "CC 423423424343" })),
    );

  it("shows phone/email/document and the inline edit action (no modal)", () => {
    const html = render("+573173672033");
    expect(html).toContain("Editar información personal");
    expect(html).not.toContain('role="dialog"');
    expect(html).toContain("+573173672033");
    expect(html).toContain("alexsosa.me+paciente@gmail.com");
    expect(html).toContain("CC 423423424343");
    // Long values wrap inside the card instead of overflowing it.
    expect(html).toContain("min-w-0 text-right font-medium break-all");
  });

  it("no phone → 'No registrado', nothing invented", () => {
    expect(render(null)).toContain("No registrado");
  });

  it("edit mode offers ONLY the phone as editable; email and document are disabled (source)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "my-contact-details.tsx"), "utf8");
    expect(src.match(/readOnly disabled/g)?.length).toBe(2);
    expect(src).toContain("await updateMyPatientPhone(draft)");
    expect(src).toContain("Es tu correo de inicio de sesión; no se cambia desde aquí.");
    expect(src).toContain('onClick={() => setEditing(false)}');
  });
});
