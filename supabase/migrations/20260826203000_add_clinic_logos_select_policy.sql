-- Odentia Core — clinic-logos Storage: missing SELECT policy
--
-- Root cause (confirmed against the live project via a rolled-back
-- reproduction — see the onboarding logo-upload incident on the first
-- real bootstrap_clinic() run, clinic dbead7c2-fd67-4358-ac37-75df731f6015):
-- storage-api's own upload handler runs `INSERT ... RETURNING` to get the
-- created object's metadata back for its HTTP response. Postgres requires
-- a RETURNING row to also satisfy the table's SELECT policy, not just the
-- INSERT policy's WITH CHECK — even though the INSERT's WITH CHECK alone
-- passes, the statement as a whole fails with 42501 ("new row violates
-- row-level security policy") because storage.objects has no SELECT
-- policy for `authenticated` at all.
--
-- 20260826140000_create_clinic_logos_storage.sql deliberately skipped a
-- SELECT policy on the (correct, but incomplete) reasoning that the
-- bucket's public=true flag covers reads. That only covers the public
-- HTTP read endpoint (an application-level bypass in Storage, not a
-- Postgres RLS policy) — it does nothing for the RETURNING clause on the
-- authenticated user's own INSERT. This migration adds exactly the
-- missing policy, reusing the same ownership predicate
-- (owns_clinic_logo_path) already used by insert/update/delete.
create policy clinic_logos_select_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'clinic-logos'
    and public.owns_clinic_logo_path(name)
  );
