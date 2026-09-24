import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { galleryPhotoPath, MAX_CLINIC_GALLERY_PHOTOS, professionalPhotoPath, validateClinicImage } from "./clinic-media-data";

// Clinic profile media: "Conoce nuestra clínica" gallery (max 5) and
// admin-managed professional photos (migration 20260924160000).

const calls: string[] = [];
let insertResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let deleteResult: { data: unknown; error: unknown } = { data: [{ id: "g1" }], error: null };
let rpcResult: { error: unknown } = { error: null };
const rpc = vi.fn(async () => rpcResult);

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: async (p: string, _f: unknown, opts: { upsert?: boolean }) => {
          calls.push(`upload:${p}:${opts?.upsert ? "upsert" : "new"}`);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          calls.push(`remove:${paths.join(",")}`);
          return { error: null };
        },
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/clinic-media/${p}` } }),
      }),
    },
    from: () => ({
      insert: (row: { storage_path: string }) => {
        calls.push(`insert:${row.storage_path}`);
        return { select: () => ({ single: async () => insertResult }) };
      },
      delete: () => ({
        eq: () => ({
          select: async () => {
            calls.push("delete-row");
            return deleteResult;
          },
        }),
      }),
    }),
    rpc,
  }),
}));

const { deleteClinicGalleryPhoto, removeProfessionalPhoto, uploadClinicGalleryPhoto, uploadProfessionalPhoto } = await import("./clinic-media-actions");

const CLINIC = "11111111-1111-1111-1111-111111111111";
const photoFile = (type = "image/jpeg", size = 1000) => new File([new Uint8Array(size)], "foto.jpg", { type });

beforeEach(() => {
  calls.length = 0;
  insertResult = { data: null, error: null };
  deleteResult = { data: [{ id: "g1" }], error: null };
  rpcResult = { error: null };
  rpc.mockClear();
});

describe("validation and paths", () => {
  it("accepts JPG/PNG/WebP up to 5 MB, rejects the rest", () => {
    expect(validateClinicImage({ type: "image/webp", size: 5 * 1024 * 1024 })).toBeNull();
    expect(validateClinicImage({ type: "image/svg+xml", size: 10 })).not.toBeNull();
    expect(validateClinicImage({ type: "image/jpeg", size: 5 * 1024 * 1024 + 1 })).not.toBeNull();
  });

  it("paths always live in the clinic's own folder", () => {
    expect(galleryPhotoPath(CLINIC, "abc")).toBe(`${CLINIC}/gallery/abc`);
    expect(professionalPhotoPath(CLINIC, "pp-1")).toBe(`${CLINIC}/professionals/pp-1`);
    expect(MAX_CLINIC_GALLERY_PHOTOS).toBe(5);
  });
});

describe("gallery writes", () => {
  it("uploads the object then creates the row", async () => {
    insertResult = { data: { id: "g1", storage_path: `${CLINIC}/gallery/g1`, created_at: "2026-09-24" }, error: null };
    const outcome = await uploadClinicGalleryPhoto(CLINIC, photoFile());
    expect(outcome.status).toBe("ok");
    expect(calls[0]).toMatch(new RegExp(`^upload:${CLINIC}/gallery/.+:new$`));
    expect(calls[1]).toMatch(/^insert:/);
  });

  it("a full gallery (6th photo) removes the just-uploaded object — no orphan — and says so", async () => {
    insertResult = { data: null, error: { message: "clinic gallery is full (max 5 photos)" } };
    const outcome = await uploadClinicGalleryPhoto(CLINIC, photoFile());
    expect(outcome).toEqual({ status: "error", message: "La galería ya tiene el máximo de 5 fotos." });
    expect(calls.at(-1)).toMatch(new RegExp(`^remove:${CLINIC}/gallery/`));
  });

  it("an invalid file never reaches Storage", async () => {
    expect((await uploadClinicGalleryPhoto(CLINIC, photoFile("image/gif"))).status).toBe("error");
    expect(calls).toEqual([]);
  });

  it("delete removes the row first, then the Storage object", async () => {
    expect(await deleteClinicGalleryPhoto({ id: "g1", storagePath: `${CLINIC}/gallery/g1` })).toEqual({ status: "ok", value: undefined });
    expect(calls).toEqual(["delete-row", `remove:${CLINIC}/gallery/g1`]);
  });

  it("an RLS-filtered delete (another clinic's photo → 0 rows) is an error and touches no file", async () => {
    deleteResult = { data: [], error: null };
    expect((await deleteClinicGalleryPhoto({ id: "g-other", storagePath: "other/gallery/x" })).status).toBe("error");
    expect(calls).toEqual(["delete-row"]);
  });
});

describe("professional photo", () => {
  it("overwrites ONE fixed object per professional (no orphans on replace) and sets it via set_professional_photo", async () => {
    const outcome = await uploadProfessionalPhoto(CLINIC, "pp-1", photoFile("image/png"));
    expect(calls).toEqual([`upload:${CLINIC}/professionals/pp-1:upsert`]);
    expect(outcome.status).toBe("ok");
    expect(rpc).toHaveBeenCalledWith("set_professional_photo", {
      p_professional_profile_id: "pp-1",
      p_avatar_url: expect.stringMatching(new RegExp(`/clinic-media/${CLINIC}/professionals/pp-1\\?v=\\d+$`)),
    });
  });

  it("remove clears it via the RPC, then deletes the object", async () => {
    expect((await removeProfessionalPhoto(CLINIC, "pp-1")).status).toBe("ok");
    expect(rpc).toHaveBeenCalledWith("set_professional_photo", { p_professional_profile_id: "pp-1", p_avatar_url: null });
    expect(calls).toEqual([`remove:${CLINIC}/professionals/pp-1`]);
  });

  it("an unauthorized RPC (another clinic) surfaces as an error and deletes nothing", async () => {
    rpcResult = { error: { message: "not authorized to manage this professional" } };
    expect((await removeProfessionalPhoto(CLINIC, "pp-x")).status).toBe("error");
    expect(calls).toEqual([]);
  });
});

// No local Postgres here (same caveat as every SQL test in this repo) —
// static checks of the migration's tenant/permission predicates.
describe("migration 20260924160000 — tenant isolation and permissions (static)", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20260924160000_clinic_portal_profile_media.sql"), "utf8");

  it("bucket: public images only, 5 MB; writes need clinic_admin of the path's clinic (or Superadmin)", () => {
    expect(sql).toContain("values ('clinic-media', 'clinic-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])");
    for (const op of ["insert", "update", "delete"]) expect(sql).toContain(`create policy clinic_media_${op}_admin`);
    expect(sql.match(/public\.owns_clinic_logo_path\(name\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("gallery rows: path must be the clinic's own gallery folder; max 5 enforced under a per-clinic lock", () => {
    expect(sql).toContain("split_part(storage_path, '/', 1) = clinic_id::text and split_part(storage_path, '/', 2) = 'gallery'");
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('clinic_gallery_photos:' || new.clinic_id::text))");
    expect(sql).toContain(">= 5 then");
  });

  it("gallery read: clinic team, Superadmin, or a patient linked to THAT clinic; writes: that clinic's admin (or Superadmin)", () => {
    expect(sql).toContain("public.is_clinic_member(clinic_id)");
    expect(sql).toContain("and p.clinic_id = clinic_gallery_photos.clinic_id");
    expect(sql).toContain("where l.profile_id = auth.uid()");
    expect(sql.match(/public\.has_clinic_role\(clinic_id, array\['clinic_admin'\]::public\.membership_role\[\]\)/g)?.length).toBe(2);
    expect(sql).toContain("grant select, insert, delete on public.clinic_gallery_photos to authenticated;");
    expect(sql).not.toContain("on public.clinic_gallery_photos for update");
  });

  it("set_professional_photo derives the clinic from the DB, requires its admin, and only accepts that clinic's own photo URL", () => {
    const fn = sql.slice(sql.indexOf("create function public.set_professional_photo"));
    expect(fn).toContain("security definer");
    expect(fn).toContain("where pp.id = p_professional_profile_id;");
    expect(fn).toContain("public.has_clinic_role(v_clinic_id, array['clinic_admin']::public.membership_role[])");
    expect(fn).toContain("'/storage/v1/object/public/clinic-media/' || v_clinic_id::text || '/professionals/' || p_professional_profile_id::text");
    expect(fn).toContain("where id = v_profile_id;");
    expect(fn.slice(0, fn.indexOf(")"))).not.toMatch(/p_clinic_id/);
  });
});
