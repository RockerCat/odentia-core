-- Odentia Core — allow a Platform Superadmin to manage the logo of a
-- clinic she provisioned, without an artificial membership
--
-- Closes a real gap found while wiring "Prospecto ganado → Crear clínica"
-- (and Platform → Clínicas → Crear clínica, which shares the same
-- PlatformClinicForm): provision_clinic() (20260916110000) deliberately
-- creates a clinic with ZERO memberships — a Superadmin must never become
-- an artificial clinic_admin of a clinic she provisions (see CLAUDE.md's
-- Domain Model, Superadmin section). But both authorization gates
-- uploadClinicLogo() (src/features/clinic/logo.ts, unmodified, reused
-- as-is) depends on are scoped ONLY to has_clinic_role(clinic_id,
-- ['clinic_admin']) — so a Superadmin, having no membership at all in the
-- clinic she just created, was rejected by both, immediately after
-- provisioning it. This migration widens exactly those two gates, the
-- same `or is_platform_superadmin()` pattern already used for
-- clinic_invitations_select_admin / profiles_select_self_or_clinicmate /
-- clinics_select_member_or_superadmin (20260916170000) — never a new
-- membership, never a broader Storage grant, never authenticated-at-large.
--
-- ============================================================
-- 1. clinics_update_admin — allow Superadmin to set logo_url (and any
--    other clinic field this policy already permitted an admin to write)
-- ============================================================
-- ALTER POLICY, not DROP+CREATE: policy name/command/role list are
-- unchanged, only the USING/WITH CHECK expressions widen, exactly like
-- clinic_invitations_select_admin's own precedent. A Clinic Admin's own
-- existing authorization over her clinic is completely untouched — this
-- only ADDS a second, independent way to pass the same check.
alter policy clinics_update_admin
  on public.clinics
  using (
    public.has_clinic_role(id, array['clinic_admin']::public.membership_role[])
    or public.is_platform_superadmin()
  )
  with check (
    public.has_clinic_role(id, array['clinic_admin']::public.membership_role[])
    or public.is_platform_superadmin()
  );

-- ============================================================
-- 2. owns_clinic_logo_path() — the one shared gate behind all three
--    clinic_logos_* Storage policies (insert/update/delete)
-- ============================================================
-- CREATE OR REPLACE against the exact same signature/return type — a
-- single-point fix, not three duplicated policy rewrites (the task's own
-- preference). Path/clinic_id validation is completely unchanged: a
-- malformed or non-UUID leading path segment still resolves to `false`
-- before either authorization check ever runs, so this never widens
-- access to a path that isn't already a real, well-formed
-- `<clinic_id>/...` — a Superadmin gets exactly the same "manage any real
-- clinic's own logo, nothing else" scope this whole initiative already
-- gives her over clinics/clinic_invitations/clinic_memberships, scoped to
-- the clinic-logos bucket alone (no other bucket references this
-- function).
create or replace function public.owns_clinic_logo_path(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
begin
  begin
    v_clinic_id := split_part(object_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return public.has_clinic_role(v_clinic_id, array['clinic_admin']::public.membership_role[])
    or public.is_platform_superadmin();
end;
$$;
