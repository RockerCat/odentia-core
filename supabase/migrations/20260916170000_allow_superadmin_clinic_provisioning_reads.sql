-- Odentia Core — Platform visibility for a pending first-Clinic-Admin
-- invitation and the identity of an already-active one.
--
-- Closes the two RLS gaps confirmed while wiring
-- /platform/clinicas/[slug] → "Asignar administrador":
--
--   1. clinic_invitations_select_admin (20260824212631) authorizes only
--      via has_clinic_role(clinic_id, ['clinic_admin']) — a Superadmin,
--      who structurally has zero clinic_memberships, gets zero rows even
--      when a pending clinic_admin invitation exists for a clinic she is
--      actively provisioning. provision_first_clinic_admin_invitation()
--      (20260916150000) already enforces the "no second pending
--      invitation" rule correctly at the RPC level regardless — this is
--      purely a Platform UI visibility gap, not a security gap.
--
--   2. profiles_select_self_or_clinicmate (20260824212631) authorizes
--      only via id = auth.uid() or shares_active_clinic_with(id) — same
--      structural gap: a Superadmin shares no active clinic with anyone,
--      so she can never resolve an arbitrary Clinic Admin's name/email
--      via a plain client-side select, even though clinic_memberships
--      itself already confirms that admin's existence to her.
--
-- Both fixes are ALTER POLICY, not DROP+CREATE: only the USING expression
-- changes, the policy name/command/role list stay identical, and every
-- existing authorized path (a clinic_admin reading her own clinic's
-- invitations; anyone reading their own or a real clinicmate's profile)
-- is preserved verbatim, ORed with is_platform_superadmin() exactly like
-- clinics_select_member_or_superadmin / clinic_memberships_select_member_
-- or_superadmin / professional_profiles_select_member_or_superadmin
-- already do.
--
-- profiles was inspected before touching this: id, first_name, last_name,
-- email, phone, avatar_url, created_at, updated_at (foundation schema,
-- never altered since) — no credentials, no tokens, no clinical data.
-- This is exactly the administrative staff-identity surface a Superadmin
-- who already provisions clinics and their first admin is expected to
-- read; profiles already carries a table-wide
-- `grant select on public.profiles to authenticated` (20260827130000), so
-- no grant change is needed here — only the RLS row filter widens.

alter policy clinic_invitations_select_admin
  on public.clinic_invitations
  using (
    public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[])
    or public.is_platform_superadmin()
  );

-- clinic_invitations_select_admin (INSERT is untouched — provisioning
-- writes stay exclusively through the existing SECURITY DEFINER RPCs).
-- The existing column-scoped grant (20260914120000) only covers the
-- columns fetchPendingInvitations() itself needs (id, clinic_id, email,
-- role, status, expires_at, created_at) — Platform's own pending-
-- first-admin card additionally needs the pre-provisioned identity
-- columns (first_name/last_name/phone, added in 20260916150000) to show
-- the same "who did the Superadmin already invite" context
-- preview_clinic_invitation() shows the invitee herself. Never
-- token_hash/invited_by/accepted_membership_id — not referenced by any
-- query this migration enables.
grant select (first_name, last_name, phone) on public.clinic_invitations to authenticated;

alter policy profiles_select_self_or_clinicmate
  on public.profiles
  using (
    id = auth.uid()
    or public.shares_active_clinic_with(id)
    or public.is_platform_superadmin()
  );
