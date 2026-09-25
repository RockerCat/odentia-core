import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLINIC_DESCRIPTION_MAX_LENGTH, normalizeClinicDescription } from "./description";

const { from, update, eq } = vi.hoisted(() => {
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { from, update, eq };
});
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from }) }));

import { updateClinicInfo } from "./actions";

// clinics.description — Portal "Sobre nosotros" (/portal/clinica).

describe("normalizeClinicDescription", () => {
  it("blank/null → null (section hidden); real text is trimmed, line breaks kept", () => {
    expect(normalizeClinicDescription(null)).toBeNull();
    expect(normalizeClinicDescription(undefined)).toBeNull();
    expect(normalizeClinicDescription("")).toBeNull();
    expect(normalizeClinicDescription("  \n\t ")).toBeNull();
    expect(normalizeClinicDescription("  Somos una clínica.\n\nAtendemos niños. ")).toBe("Somos una clínica.\n\nAtendemos niños.");
  });
});

describe("updateClinicInfo — description", () => {
  beforeEach(() => vi.clearAllMocks());

  it("goes through the existing clinics update (same flow, scoped by clinic id)", async () => {
    await expect(updateClinicInfo("clinic-1", { description: " Hola\nmundo " })).resolves.toEqual({ status: "ok" });
    expect(from).toHaveBeenCalledWith("clinics");
    expect(update).toHaveBeenCalledWith({ description: "Hola\nmundo" });
    expect(eq).toHaveBeenCalledWith("id", "clinic-1");
  });

  it("clearing stores NULL, never an empty string", async () => {
    await updateClinicInfo("clinic-1", { description: "   " });
    expect(update).toHaveBeenCalledWith({ description: null });
  });

  it("other fields are untouched by the description normalization", async () => {
    await updateClinicInfo("clinic-1", { name: "Clínica X" });
    expect(update).toHaveBeenCalledWith({ name: "Clínica X" });
  });

  it("a DB rejection (e.g. RLS or >500 check) is reported as an error", async () => {
    eq.mockResolvedValueOnce({ error: { message: "violates check constraint" } } as never);
    await expect(updateClinicInfo("clinic-1", { description: "x" })).resolves.toEqual({ status: "error" });
  });
});

// No local Postgres here (same caveat as every SQL test in this repo).
describe("migration 20260924170000_add_clinic_description", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20260924170000_add_clinic_description.sql"), "utf8");
  const code = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

  it("is additive: one nullable column + a 500 check matching the UI limit", () => {
    expect(CLINIC_DESCRIPTION_MAX_LENGTH).toBe(500);
    expect(code).toContain("add column description text,");
    expect(code).not.toMatch(/not null/i);
    expect(code).toContain(`check (description is null or char_length(description) <= ${CLINIC_DESCRIPTION_MAX_LENGTH})`);
    // No data rewrite (the only "update" is the column GRANT below).
    expect(code.replace(/grant update \(description\)/, "")).not.toMatch(/\b(update|delete|insert|drop|truncate)\b/i);
  });

  it("widens no permission: no policy/role/function change; only the new column joins the existing column-level UPDATE grant", () => {
    expect(code).not.toMatch(/\b(policy|revoke|function|security definer|row level security|anon)\b/i);
    const grants = code.match(/grant[^;]*;/gi) ?? [];
    expect(grants).toEqual(["grant update (description) on public.clinics to authenticated;"]);
  });

  it("writes stay under the existing clinics_update_admin policy (clinic_admin of that clinic or Superadmin)", () => {
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    const stmts = fs
      .readdirSync(dir)
      .sort()
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8").replace(/--.*$/gm, ""))
      .join("\n")
      .split(";");
    const latest = stmts.filter((stmt) => /(create|alter) policy clinics_update_admin\b/.test(stmt)).at(-1) ?? "";
    expect(latest).toContain("alter policy clinics_update_admin");
    expect(latest).toContain("public.has_clinic_role(id, array['clinic_admin']::public.membership_role[])");
    expect(latest).toContain("or public.is_platform_superadmin()");
    expect(latest).not.toMatch(/dentist|assistant|patient_user_links/);
    // status/trial_ends_at stay RPC-only: no later grant ever adds them back.
    const clinicUpdateGrants = stmts.filter((stmt) => /grant update[^]*on public\.clinics/.test(stmt));
    // Later additive column grants (e.g. cover_url) never revoke it.
    expect(clinicUpdateGrants.join("\n")).toMatch(/grant update \(description\) on public\.clinics to authenticated/);
    expect(stmts.filter((stmt) => /revoke update[^]*on public\.clinics/.test(stmt))).toHaveLength(1);
    expect(clinicUpdateGrants.join("\n")).not.toMatch(/status|trial_ends_at|legal_name/);
  });
});
