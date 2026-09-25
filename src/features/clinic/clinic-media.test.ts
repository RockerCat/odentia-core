import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clinicCoverPath, galleryPhotoPath, MAX_CLINIC_GALLERY_PHOTOS, planGalleryUploads, profileAvatarPath, validateClinicImage } from "./clinic-media-data";

// Clinic profile media: "Conoce nuestra clínica" gallery (max 5) and
// admin-managed professional photos (migration 20260924160000).

const calls: string[] = [];
let insertResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let deleteResult: { data: unknown; error: unknown } = { data: [{ id: "g1" }], error: null };
let rpcResult: { error: unknown } = { error: null };
let sessionUserId: string | null = "33333333-3333-3333-3333-333333333333";
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
    auth: { getUser: async () => ({ data: { user: sessionUserId ? { id: sessionUserId } : null } }) },
  }),
}));

const { deleteClinicGalleryPhoto, removeClinicCover, removeMemberAvatar, removeMyAvatar, uploadClinicCover, uploadClinicGalleryPhoto, uploadMemberAvatar, uploadMyAvatar } =
  await import("./clinic-media-actions");

const CLINIC = "11111111-1111-1111-1111-111111111111";
const photoFile = (type = "image/jpeg", size = 1000) => new File([new Uint8Array(size)], "foto.jpg", { type });

beforeEach(() => {
  calls.length = 0;
  insertResult = { data: null, error: null };
  deleteResult = { data: [{ id: "g1" }], error: null };
  rpcResult = { error: null };
  sessionUserId = "33333333-3333-3333-3333-333333333333";
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
    expect(profileAvatarPath("u-1")).toBe("avatars/u-1");
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

describe("profile photo — ONE per user (profiles.avatar_url, avatars/<profileId>)", () => {
  const ME = "33333333-3333-3333-3333-333333333333";
  const member = { membershipId: "m-1", profileId: "44444444-4444-4444-4444-444444444444" };

  it("self-service: uploads to the SESSION user's own object and saves via set_my_avatar (no id sent to the RPC)", async () => {
    const outcome = await uploadMyAvatar(photoFile("image/png"));
    expect(outcome.status).toBe("ok");
    expect(calls).toEqual([`upload:avatars/${ME}:upsert`]);
    expect(rpc).toHaveBeenCalledWith("set_my_avatar", {
      p_avatar_url: expect.stringMatching(new RegExp(`/clinic-media/avatars/${ME}\\?v=\\d+$`)),
    });
  });

  it("replace overwrites the same object (no accumulation); remove clears the pointer then deletes it", async () => {
    await uploadMyAvatar(photoFile("image/png"));
    await uploadMyAvatar(photoFile("image/webp"));
    expect(calls).toEqual([`upload:avatars/${ME}:upsert`, `upload:avatars/${ME}:upsert`]);
    calls.length = 0;
    expect(await removeMyAvatar()).toEqual({ status: "ok", value: undefined });
    expect(rpc).toHaveBeenLastCalledWith("set_my_avatar", { p_avatar_url: null });
    expect(calls).toEqual([`remove:avatars/${ME}`]);
  });

  it("invalid type/size or no session never reaches Storage", async () => {
    expect(await uploadMyAvatar(photoFile("image/gif"))).toEqual({ status: "error", message: "Usa una imagen JPG, PNG o WebP." });
    expect((await uploadMyAvatar(photoFile("image/jpeg", 5 * 1024 * 1024 + 1))).status).toBe("error");
    sessionUserId = null;
    expect((await uploadMyAvatar(photoFile())).status).toBe("error");
    expect((await removeMyAvatar()).status).toBe("error");
    expect(calls).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Clinic Admin (Equipo) writes the SAME per-user object/field via set_clinic_member_avatar", async () => {
    expect((await uploadMemberAvatar(member, photoFile("image/webp"))).status).toBe("ok");
    expect(calls).toEqual([`upload:avatars/${member.profileId}:upsert`]);
    expect(rpc).toHaveBeenCalledWith("set_clinic_member_avatar", {
      p_membership_id: "m-1",
      p_avatar_url: expect.stringMatching(new RegExp(`/clinic-media/avatars/${member.profileId}\\?v=\\d+$`)),
    });
    calls.length = 0;
    expect((await removeMemberAvatar(member)).status).toBe("ok");
    expect(rpc).toHaveBeenLastCalledWith("set_clinic_member_avatar", { p_membership_id: "m-1", p_avatar_url: null });
    expect(calls).toEqual([`remove:avatars/${member.profileId}`]);
  });

  it("a rejected RPC (another clinic's member / someone else's photo) is an error and deletes nothing", async () => {
    rpcResult = { error: { message: "not authorized to manage this member" } };
    expect((await removeMemberAvatar(member)).status).toBe("error");
    expect((await removeMyAvatar()).status).toBe("error");
    expect(calls).toEqual([]);
  });
});

describe("migration 20260925140000 — self-service profile avatar (static)", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20260925140000_self_service_profile_avatar.sql"), "utf8");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const fnBody = (name: string) => code.slice(code.indexOf(`create function public.${name}`), code.indexOf(`revoke execute on function public.${name}`));

  it("is additive: new functions + avatars/ storage policies only, no table/column/RLS/data change", () => {
    expect(code).not.toMatch(/\b(drop|alter table|alter policy|insert into|delete from|truncate)\b/i);
    expect(code).not.toMatch(/on public\.\w+ for /);
    for (const op of ["insert", "update", "delete"]) {
      expect(code).toContain(`create policy clinic_media_avatar_${op}`);
    }
    expect(code.match(/bucket_id = 'clinic-media' and public\.owns_profile_avatar_path\(name\)/g)?.length).toBe(4);
  });

  it("set_my_avatar: the target is ALWAYS auth.uid() — no profile id parameter to spoof", () => {
    const fn = fnBody("set_my_avatar");
    expect(fn).toContain("create function public.set_my_avatar(p_avatar_url text)");
    expect(fn).toContain("v_profile_id uuid := auth.uid();");
    expect(fn).toContain("not public.is_profile_avatar_url(v_profile_id, p_avatar_url)");
    expect(fn).toContain("where id = v_profile_id;");
  });

  it("set_clinic_member_avatar: clinic from the membership; its admin (or Superadmin) only; that member's own object", () => {
    const fn = fnBody("set_clinic_member_avatar");
    expect(fn).toContain("where m.id = p_membership_id;");
    expect(fn).toContain("public.has_clinic_role(v_clinic_id, array['clinic_admin']::public.membership_role[])");
    expect(fn).toContain("not public.is_profile_avatar_url(v_profile_id, p_avatar_url)");
    expect(fn.slice(0, fn.indexOf(")"))).not.toMatch(/p_clinic_id|p_profile_id/);
  });

  it("storage: only the owner, or an admin of a clinic the owner belongs to — never a patient's photo by staff", () => {
    const fn = fnBody("can_manage_profile_avatar");
    expect(fn).toContain("select p_profile_id = auth.uid()");
    expect(fn).toContain("from public.clinic_memberships m");
    expect(fn).toContain("where m.profile_id = p_profile_id");
    expect(fnBody("owns_profile_avatar_path")).toContain("'^avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'");
  });

  it("upsert also needs SELECT (a real 400 without it): 20260925150000 adds it with the SAME guard, nothing wider", () => {
    const select = fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20260925150000_profile_avatar_storage_select.sql"), "utf8");
    const body = select.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
    expect(body).toBe(
      "create policy clinic_media_avatar_select\n  on storage.objects for select\n  to authenticated\n  using (bucket_id = 'clinic-media' and public.owns_profile_avatar_path(name));",
    );
  });

  it("the only accepted URL is that user's own avatars/<id> object", () => {
    expect(code).toContain("'^https?://[^/?#]+/storage/v1/object/public/clinic-media/avatars/' || p_profile_id::text || '(\\?v=[0-9]+)?$'");
    const re = (id: string) => new RegExp(`^https?://[^/?#]+/storage/v1/object/public/clinic-media/avatars/${id}(\\?v=[0-9]+)?$`);
    expect(re("u-1").test("https://p.supabase.co/storage/v1/object/public/clinic-media/avatars/u-1?v=3")).toBe(true);
    expect(re("u-1").test("https://p.supabase.co/storage/v1/object/public/clinic-media/avatars/u-2?v=3")).toBe(false);
    expect(re("u-1").test(`https://p.supabase.co/storage/v1/object/public/clinic-media/${CLINIC}/members/m-1`)).toBe(false);
  });
});

describe("migration 20260925120000 — Portal team + member photo (static)", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20260925120000_portal_clinic_team_and_member_photo.sql"), "utf8");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  it("is additive: only new functions, no table/policy/data changes, booking RPC untouched", () => {
    expect(code).not.toMatch(/\b(drop|alter table|create policy|alter policy|insert into|delete from|truncate)\b/i);
    expect(code).not.toContain("get_my_clinic_professionals");
  });

  it("get_my_clinic_team: active real clinic roles of the CALLER's own linked clinic only (no param to spoof)", () => {
    const fn = code.slice(code.indexOf("create function public.get_my_clinic_team()"), code.indexOf("revoke execute on function public.get_my_clinic_team()"));
    expect(fn).toContain("security definer");
    expect(fn).toContain("where m.status = 'active'");
    expect(fn).toContain("and m.role in ('clinic_admin', 'dentist', 'assistant')");
    expect(fn).toContain("where l.profile_id = auth.uid()");
    expect(fn).toContain("and pt.clinic_id = m.clinic_id");
    // Professional fields only for an ACTIVE professional profile.
    expect(fn).toContain("left join public.professional_profiles pp on pp.clinic_membership_id = m.id and pp.active");
    // Never a Superadmin by virtue of platform_roles, never contact data.
    expect(fn).not.toMatch(/platform_roles|is_platform_superadmin|email|phone/);
    expect(fn.slice(0, fn.indexOf(")"))).toBe("create function public.get_my_clinic_team(");
  });

  it("set_clinic_member_photo: clinic derived from the membership, its admin (or Superadmin), own members/<id> object only", () => {
    const fn = code.slice(code.indexOf("create function public.set_clinic_member_photo"));
    expect(fn).toContain("security definer");
    expect(fn).toContain("where m.id = p_membership_id;");
    expect(fn).toContain("public.has_clinic_role(v_clinic_id, array['clinic_admin']::public.membership_role[])");
    expect(fn).toContain("'/members/' || p_membership_id::text || '(\\?v=[0-9]+)?$'");
    expect(fn).toContain("where id = v_profile_id;");
    const re = new RegExp(`^https?://[^/?#]+/storage/v1/object/public/clinic-media/${CLINIC}/members/m-1(\\?v=[0-9]+)?$`);
    expect(re.test(`https://p.supabase.co/storage/v1/object/public/clinic-media/${CLINIC}/members/m-1?v=2`)).toBe(true);
    expect(re.test(`https://p.supabase.co/storage/v1/object/public/clinic-media/other/members/m-1?v=2`)).toBe(false);
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
