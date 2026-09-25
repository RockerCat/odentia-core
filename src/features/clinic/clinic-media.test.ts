import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clinicCoverPath, galleryPhotoPath, MAX_CLINIC_GALLERY_PHOTOS, planGalleryUploads, professionalPhotoPath, validateClinicImage } from "./clinic-media-data";

// Clinic profile media: "Conoce nuestra clínica" gallery (max 5) and
// admin-managed professional photos (migration 20260924160000).

const calls: string[] = [];
let insertResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let deleteResult: { data: unknown; error: unknown } = { data: [{ id: "g1" }], error: null };
let rpcResult: { error: unknown } = { error: null };
let updateResult: { data: unknown; error: unknown } = { data: [{ id: "c1" }], error: null };
const updates: unknown[] = [];
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
      update: (values: unknown) => {
        updates.push(values);
        return {
          eq: () => ({
            select: async () => {
              calls.push("update-row");
              return updateResult;
            },
          }),
        };
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

const { deleteClinicGalleryPhoto, removeClinicCover, removeProfessionalPhoto, uploadClinicCover, uploadClinicGalleryPhoto, uploadProfessionalPhoto } =
  await import("./clinic-media-actions");

const CLINIC = "11111111-1111-1111-1111-111111111111";
const photoFile = (type = "image/jpeg", size = 1000) => new File([new Uint8Array(size)], "foto.jpg", { type });

beforeEach(() => {
  calls.length = 0;
  insertResult = { data: null, error: null };
  deleteResult = { data: [{ id: "g1" }], error: null };
  rpcResult = { error: null };
  updateResult = { data: [{ id: "c1" }], error: null };
  updates.length = 0;
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

describe("gallery multi-add plan (drop / multi-select)", () => {
  const named = (name: string, type = "image/jpeg", size = 1000) => new File([new Uint8Array(size)], name, { type });

  it("never exceeds 5 in total: extra valid files are counted as overflow, not uploaded", () => {
    const plan = planGalleryUploads([named("a"), named("b"), named("c")], 3);
    expect(plan.accepted.map((f) => f.name)).toEqual(["a", "b"]);
    expect(plan.overflow).toBe(1);
    expect(planGalleryUploads([named("a")], 5)).toEqual({ accepted: [], rejected: [], overflow: 1 });
  });

  it("validates type/size before any upload and reports each rejected file by name", () => {
    const plan = planGalleryUploads([named("ok.png", "image/png"), named("anim.gif", "image/gif"), named("big.jpg", "image/jpeg", 5 * 1024 * 1024 + 1)], 0);
    expect(plan.accepted.map((f) => f.name)).toEqual(["ok.png"]);
    expect(plan.rejected).toEqual([
      { name: "anim.gif", message: "Usa una imagen JPG, PNG o WebP." },
      { name: "big.jpg", message: "La imagen supera el tamaño máximo de 5 MB." },
    ]);
    expect(plan.overflow).toBe(0);
  });

  it("keeps the chosen order", () => {
    expect(planGalleryUploads([named("1"), named("2"), named("3")], 0).accepted.map((f) => f.name)).toEqual(["1", "2", "3"]);
  });
});

describe("clinic cover (Foto de portada)", () => {
  it("overwrites ONE fixed object per clinic (replace never leaves an orphan), then sets clinics.cover_url", async () => {
    expect(clinicCoverPath(CLINIC)).toBe(`${CLINIC}/cover`);
    const outcome = await uploadClinicCover(CLINIC, photoFile("image/webp"));
    expect(calls).toEqual([`upload:${CLINIC}/cover:upsert`, "update-row"]);
    expect(outcome.status).toBe("ok");
    expect(updates).toEqual([{ cover_url: expect.stringMatching(new RegExp(`/clinic-media/${CLINIC}/cover\\?v=\\d+$`)) }]);
    // Replacing is the exact same call → same object.
    await uploadClinicCover(CLINIC, photoFile("image/png"));
    expect(calls.filter((c) => c.startsWith("upload:"))).toEqual([`upload:${CLINIC}/cover:upsert`, `upload:${CLINIC}/cover:upsert`]);
  });

  it("an invalid file never reaches Storage or the DB", async () => {
    expect(await uploadClinicCover(CLINIC, photoFile("image/svg+xml"))).toEqual({ status: "error", message: "Usa una imagen JPG, PNG o WebP." });
    expect(await uploadClinicCover(CLINIC, photoFile("image/jpeg", 5 * 1024 * 1024 + 1))).toEqual({
      status: "error",
      message: "La imagen supera el tamaño máximo de 5 MB.",
    });
    expect(calls).toEqual([]);
  });

  it("an RLS-filtered update (not this clinic's admin → 0 rows) is an error", async () => {
    updateResult = { data: [], error: null };
    expect((await uploadClinicCover(CLINIC, photoFile())).status).toBe("error");
    expect((await removeClinicCover(CLINIC)).status).toBe("error");
    // The failed remove touched no file.
    expect(calls.filter((c) => c.startsWith("remove:"))).toEqual([]);
  });

  it("remove clears the pointer (Portal → generic fallback, never stored), then deletes the object", async () => {
    expect(await removeClinicCover(CLINIC)).toEqual({ status: "ok", value: undefined });
    expect(updates).toEqual([{ cover_url: null }]);
    expect(calls).toEqual(["update-row", `remove:${CLINIC}/cover`]);
  });
});

describe("migration 20260925100000 — clinic cover (static)", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20260925100000_add_clinic_cover_photo.sql"), "utf8");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  it("is additive: one nullable column + a check + a column-level UPDATE grant, no policy/data changes", () => {
    expect(code).toContain("add column cover_url text,");
    expect(code).toContain("grant update (cover_url) on public.clinics to authenticated;");
    expect(code).not.toMatch(/\b(drop|delete|truncate|create policy|alter policy|insert into|update public\.)/i);
    // No fallback value is ever written: no default.
    expect(code).not.toMatch(/default/i);
  });

  it("cover_url can only be null or THIS clinic's own clinic-media cover object", () => {
    expect(code).toContain("cover_url is null");
    expect(code).toContain("/storage/v1/object/public/clinic-media/' || id::text || '/cover(\\?v=[0-9]+)?$'");
    const re = (id: string) => new RegExp(`^https?://[^/?#]+/storage/v1/object/public/clinic-media/${id}/cover(\\?v=[0-9]+)?$`);
    expect(re(CLINIC).test(`https://p.supabase.co/storage/v1/object/public/clinic-media/${CLINIC}/cover?v=1`)).toBe(true);
    expect(re(CLINIC).test("https://p.supabase.co/storage/v1/object/public/clinic-media/other/cover?v=1")).toBe(false);
    expect(re(CLINIC).test(`https://p.supabase.co/storage/v1/object/public/clinic-media/${CLINIC}/gallery/x`)).toBe(false);
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
