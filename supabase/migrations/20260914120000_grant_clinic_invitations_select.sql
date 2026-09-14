-- Odentia Core — fix: fetchPendingInvitations() failing on /clinica with a
-- permission-denied error on clinic_invitations
--
-- Root cause: clinic_invitations_select_admin (20260824212631) is a real,
-- correct RLS policy — but an RLS policy only ever filters ROWS a role is
-- otherwise already allowed to query; it never substitutes for the
-- object-level GRANT Postgres checks first. Every other table in this
-- schema that has an authenticated-facing RLS SELECT policy also carries
-- its own explicit `grant select ... to authenticated` (see e.g.
-- professional_availability, patients, appointments, professional_profiles
-- migrations) — clinic_invitations never got one, because until
-- fetchPendingInvitations() (this task's own "Invitaciones pendientes"
-- feature), nothing ever queried this table directly as the caller's own
-- JWT role: invite_clinic_member()/accept_clinic_invitation()/
-- regenerate_clinic_invitation() are all SECURITY DEFINER, which bypasses
-- both grants and RLS on the function owner's behalf (see each of those
-- migrations' own comments) — so the missing grant simply never mattered
-- until now. (A 42501 "permission denied for table clinic_invitations" was
-- inferred from this exact structural gap plus PostgREST's documented
-- error shape for a missing GRANT — never directly observed/captured from
-- a live run, since this migration wasn't applied yet when the gap was
-- found.)
--
-- Minimal privilege: SELECT only, and only on the specific columns
-- fetchPendingInvitations() (src/features/clinic/data.ts) actually
-- references — never the whole row, and never a table-wide `grant select`
-- that would additionally make token_hash (or invited_by/
-- accepted_membership_id) queryable by any authenticated role that
-- clears RLS:
--
--   id, email, role, status, expires_at — the columns in its own
--     .select(...) list.
--   clinic_id                            — referenced by its own
--     .eq("clinic_id", clinicId) filter; without column-level SELECT on
--     it, PostgREST's WHERE clause on this column would itself be denied,
--     independent of RLS.
--   created_at                           — referenced by its own
--     .order("created_at", ...) clause, same reasoning.
--
-- invited_by/accepted_membership_id/token_hash are not referenced
-- anywhere in that query (select list, filters, or ordering) and are
-- deliberately left out — not granted preventively. INSERT/UPDATE/DELETE
-- on clinic_invitations stay exactly as before — deny-by-default for
-- `authenticated`, reachable only through the existing SECURITY DEFINER
-- RPCs — this migration adds nothing there.
grant select (
  id,
  clinic_id,
  email,
  role,
  status,
  expires_at,
  created_at
) on public.clinic_invitations to authenticated;
