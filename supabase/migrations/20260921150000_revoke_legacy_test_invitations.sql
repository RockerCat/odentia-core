-- Odentia Core — one-time, narrowly-scoped data cleanup: revoke 7 known
-- legacy test clinic_invitations rows.
--
-- Context ("Odentia — eliminar invitaciones legacy de prueba y retirar
-- Confirm Signup", 2026-09-21): these 7 rows were created by Alex during
-- development testing, before "Unify clinic team invitation activation"
-- (2026-09-21) required every invite_clinic_member() call to carry
-- pre-provisioned identity. Confirmed via a direct, read-only query
-- against the real linked project immediately before this migration:
-- exactly 7 rows with status = 'pending' and (first_name is null or
-- last_name is null or phone is null), none of whose emails has any
-- clinic_memberships row in the target clinic (no materialized access
-- depends on any of them). Product-confirmed: not real users, safe to
-- retire.
--
-- Revoked, not deleted — 'revoked' already exists on the
-- invitation_status enum (foundation schema) and is already fully
-- handled on every read path (accept_clinic_invitation()'s own "this
-- invitation was revoked" rejection, preview_clinic_invitation()'s own
-- status resolution) — this migration is the first thing to ever WRITE
-- it, since no revoke RPC/UI exists yet and building one is out of this
-- checkpoint's scope (a one-time cleanup, not a new ongoing Clinic Admin
-- capability). Preserves history, matches this checkpoint's own explicit
-- preference for revoke over physical DELETE.
--
-- Hardcoded id list, not a broad WHERE clause: this must never silently
-- catch a future or different row that happens to also lack identity —
-- the WHERE clause below re-asserts the exact same shape (pending +
-- missing identity) as a second, defense-in-depth condition on top of the
-- id list, so a row that somehow changed shape between the read above and
-- this migration's application is never touched.
update public.clinic_invitations
set status = 'revoked'
where id in (
  '5acf7945-c446-4f75-ae96-3f3cc4f65d47',
  'de67a8f4-4f97-474a-b1b4-17b2e5009cbe',
  'ef49cd7b-7588-4788-a4fc-a4458397eeb3',
  'e1cb5e6c-7cde-498a-b1dc-0e10e3a95d9b',
  '3f8802ea-c078-467b-8209-63b704343686',
  '433cae57-40fe-4b94-a96d-9c563f828eca',
  '5b2d12cb-8677-4c43-872d-a40674963c26'
)
and status = 'pending'
and (first_name is null or last_name is null or phone is null);
