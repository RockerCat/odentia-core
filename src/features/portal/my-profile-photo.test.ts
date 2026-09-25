import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { PatientContext } from "@/features/session/types";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const { MyProfile } = await import("./my-profile");

// Every user's ONE profile photo (profiles.avatar_url) — self-managed from
// her own profile surface, shown wherever she appears; initials without it.

const context = (avatarUrl: string | null): PatientContext => ({
  status: "ok",
  profile: { id: "u-1", firstName: "Alex", lastName: "Paciente", email: "a@x.co", phone: null, avatarUrl },
  patient: { id: "p-1", firstName: "Alex", lastName: "Paciente", email: "a@x.co", phone: null, documentId: null, birthDate: null, clinicId: "c1" },
  clinic: { id: "c1", name: "C", slug: "c", logoUrl: null, phone: null, status: "active", description: null, coverUrl: null },
});
const render = (avatarUrl: string | null) => renderToStaticMarkup(createElement(ToastProvider, null, createElement(MyProfile, { context: context(avatarUrl) })));

describe("Patient Portal · Mi perfil photo", () => {
  it("shows her real photo (object-cover) with Cambiar/Quitar", () => {
    const html = render("https://p.supabase.co/storage/v1/object/public/clinic-media/avatars/u-1?v=1");
    expect(html).toMatch(/<img[^>]*src="https:\/\/p\.supabase\.co\/storage\/v1\/object\/public\/clinic-media\/avatars\/u-1\?v=1"[^>]*object-cover/);
    expect(html).toContain("Cambiar foto");
    expect(html).toContain("Quitar foto");
  });

  it("without a photo: real initials + Subir foto, no Quitar, never a mock image", () => {
    const html = render(null);
    expect(html).toContain(">AP</span>");
    expect(html).toContain("Subir foto");
    expect(html).not.toContain("Quitar foto");
    expect(html).not.toContain("<img");
    expect(html).toContain("JPG, PNG o WebP · máx. 5 MB");
  });
});

describe("one photo, every surface (sources)", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

  it("self-service surfaces all use ProfilePhotoField (set_my_avatar) — every role has one", () => {
    for (const f of [
      "features/portal/my-profile.tsx",
      "features/dashboard/admin-profile-modal.tsx",
      "features/dashboard/assistant-profile-modal.tsx",
      "features/clinic/my-professional-profile-section.tsx",
    ]) {
      expect(read(f)).toContain("<ProfilePhotoField");
    }
  });

  it("Equipo writes the same per-user photo; no per-clinic/per-profile photo write path remains in the app", () => {
    expect(read("features/clinic/member-photo-controls.tsx")).toContain("uploadMemberAvatar(member, file)");
    for (const f of ["features/clinic/clinic-media-actions.ts", "features/clinic/member-photo-controls.tsx", "features/clinic/clinic-settings-screen.tsx"]) {
      expect(read(f)).not.toMatch(/set_professional_photo|set_clinic_member_photo|\/professionals\/|\/members\//);
    }
  });

  it("headers read profiles.avatar_url and re-resolve when the photo changes", () => {
    expect(read("components/shell/portal-shell.tsx")).toContain("context.profile.avatarUrl");
    expect(read("components/shell/use-shell-identity.ts")).toContain("avatar_url: profile.avatarUrl");
    for (const f of ["features/session/use-patient-context.ts", "features/session/use-current-user-context.ts"]) {
      expect(read(f)).toContain("onIdentityChanged(");
    }
    expect(read("features/clinic/profile-photo-field.tsx")).toContain("notifyIdentityChanged();");
  });
});
