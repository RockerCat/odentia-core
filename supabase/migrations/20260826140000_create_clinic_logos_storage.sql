-- Odentia Core — clinic-logos Storage bucket
--
-- Storage-only migration for the real onboarding flow (Paso 2 — Clínica):
-- clinic branding logos need somewhere real to live once the mock file
-- picker in the onboarding wizard is wired to Supabase Storage. Does not
-- touch the v1 domain model — only storage.buckets/storage.objects.
--
-- Public bucket: logos are branding assets (never clinical/patient data),
-- get shown across the UI and, later, PDFs, and a public bucket lets the
-- app render them with a plain URL instead of minting signed URLs on every
-- read. Write access stays locked down below — a public bucket only means
-- reads bypass RLS via the public object URL; it does not affect INSERT/
-- UPDATE/DELETE, which remain governed by the policies in this file.
--
-- file_size_limit/allowed_mime_types mirror the onboarding UI's own
-- validation (clinic-logo-picker.tsx: PNG/JPG/SVG, max 2MB) as a
-- server-side backstop — the client check is UX, this is the real limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinic-logos',
  'clinic-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/svg+xml']
)
on conflict (id) do nothing;

-- Path convention enforced by policy, not just client convention:
-- <clinic_id>/<filename>, e.g. <clinic_id>/logo.png. No email/NIT/name/
-- other personal or business-identifying data in the path — see task scope.
-- This helper turns the leading path segment into a clinic_id and checks
-- the caller is that clinic's clinic_admin, reusing the same
-- has_clinic_role() helper the domain-table policies already use (see
-- 20260824212631_create_foundation_rls_policies.sql). A malformed/foreign
-- leading segment (not a uuid) resolves to false rather than raising, so a
-- bad path is a clean permission denial, not a Postgres error.
create function public.owns_clinic_logo_path(object_name text)
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

  return public.has_clinic_role(v_clinic_id, array['clinic_admin']::public.membership_role[]);
end;
$$;

-- Write access: only the clinic_admin of the clinic a path belongs to may
-- upload/replace/remove that clinic's logo — never "any authenticated user
-- to any path." Reads need no policy here: the bucket is public, so
-- storage.objects RLS is bypassed for the public-URL read path.
create policy clinic_logos_insert_admin
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'clinic-logos' and public.owns_clinic_logo_path(name));

create policy clinic_logos_update_admin
  on storage.objects for update
  to authenticated
  using (bucket_id = 'clinic-logos' and public.owns_clinic_logo_path(name))
  with check (bucket_id = 'clinic-logos' and public.owns_clinic_logo_path(name));

create policy clinic_logos_delete_admin
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'clinic-logos' and public.owns_clinic_logo_path(name));
