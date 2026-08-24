-- Odentia Core — Foundation RLS policies (Paso 3D)
--
-- Builds authorization on top of the 11 tables created in
-- 20260824210644_create_foundation_schema.sql (already RLS-enabled with
-- zero policies). This migration adds the authorization helpers and the
-- foundational policies — deny-by-default stays the posture for anything
-- not explicitly granted below.
--
-- Explicitly deferred to a future Server Action/RPC migration (NOT done
-- here, by design): clinic_memberships INSERT/UPDATE, professional_profiles
-- INSERT/UPDATE, clinic_invitations UPDATE (accept/revoke), patient_user_links
-- INSERT (token consumption), patient_access_invitations UPDATE (revoke),
-- clinics INSERT (onboarding). See section-by-section comments below for
-- why each one specifically was left out rather than granted loosely.
--
-- Principle used throughout when a choice was ambiguous: less privilege
-- over more convenience. Every deferred mutation is deny-by-default today,
-- not "handled insecurely" — RLS with no policy for a command is a hard
-- block, not an open door.

-- ============================================================
-- Authorization helpers
-- ============================================================
-- All SECURITY DEFINER, owned by the migration role (postgres), which has
-- BYPASSRLS in Supabase projects — this is deliberate and is what makes
-- these safe to call from *inside* policies on the very tables they read
-- (clinic_memberships, platform_roles, patients) without infinite RLS
-- recursion: the function's internal query bypasses RLS entirely rather
-- than re-evaluating the calling policy. `set search_path = ''` plus
-- fully-qualified `public.`/`pg_catalog` references throughout closes the
-- search_path-hijacking hole that an unqualified search_path would leave
-- open on a SECURITY DEFINER function. `stable` (not `volatile`) since
-- each is a pure read within the current transaction/statement.
--
-- EXECUTE is revoked from PUBLIC and re-granted to `authenticated` only —
-- these return booleans/uuids derived from the caller's own auth.uid(),
-- so there's no real data-leak risk either way, but there's no reason for
-- `anon` to be able to call them either.

create function public.is_clinic_member(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_memberships m
    where m.clinic_id = target_clinic_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
  );
$$;

create function public.has_clinic_role(target_clinic_id uuid, target_roles public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_memberships m
    where m.clinic_id = target_clinic_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.role = any (target_roles)
  );
$$;
-- One reusable, parametrized helper instead of is_admin()/is_dentist()/
-- is_assistant() — every role-specific policy below is
-- has_clinic_role(clinic_id, ARRAY['clinic_admin']) or similar.

create function public.is_platform_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_roles r
    where r.profile_id = auth.uid()
      and r.role = 'superadmin'
  );
$$;
-- Deliberately NOT combined into a generic
-- `can_access_any_clinic_data() = is_clinic_member(x) OR is_platform_superadmin()`
-- helper — platform administration is not clinical access (see CLAUDE.md
-- Domain Model). Each policy below decides per table, explicitly, whether
-- is_platform_superadmin() applies at all; most clinic-scoped tables never
-- reference it (see section 19 of the design: patients,
-- patient_access_invitations and patient_user_links never grant superadmin
-- read access here).

create function public.shares_active_clinic_with(other_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_memberships m1
    join public.clinic_memberships m2 on m2.clinic_id = m1.clinic_id
    where m1.profile_id = auth.uid()
      and m1.status = 'active'
      and m2.profile_id = other_profile_id
      and m2.status = 'active'
  );
$$;
-- Backs "teammates can see each other's basic profile" without a policy
-- having to inline this join itself.

create function public.clinic_id_for_patient(target_patient_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.clinic_id
  from public.patients p
  where p.id = target_patient_id;
$$;
-- patient_user_links has no clinic_id column of its own (by design — see
-- the v1 data model). This is the one clean way for its policies to ask
-- "which clinic does this link's patient belong to" without either (a)
-- adding a denormalized column outside this migration's scope, or (b)
-- relying on nested-RLS-inside-a-policy semantics being obviously correct
-- to a future reader — this makes the bypass explicit and auditable.

revoke execute on function public.is_clinic_member(uuid) from public;
revoke execute on function public.has_clinic_role(uuid, public.membership_role[]) from public;
revoke execute on function public.is_platform_superadmin() from public;
revoke execute on function public.shares_active_clinic_with(uuid) from public;
revoke execute on function public.clinic_id_for_patient(uuid) from public;

grant execute on function public.is_clinic_member(uuid) to authenticated;
grant execute on function public.has_clinic_role(uuid, public.membership_role[]) to authenticated;
grant execute on function public.is_platform_superadmin() to authenticated;
grant execute on function public.shares_active_clinic_with(uuid) to authenticated;
grant execute on function public.clinic_id_for_patient(uuid) to authenticated;


-- ============================================================
-- profiles
-- ============================================================

create policy profiles_select_self_or_clinicmate
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.shares_active_clinic_with(id));

create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- WITH CHECK (id = auth.uid()) on the *new* row is what blocks id-
-- tampering: if an update tried to change id away from the caller's own
-- uid, the new row would fail the check and the whole UPDATE is rejected
-- — no separate "don't touch id" rule needed. No INSERT/DELETE policy:
-- profiles are only ever created by the handle_new_user trigger (which
-- bypasses RLS as SECURITY DEFINER) — deny-by-default already covers
-- both correctly.


-- ============================================================
-- platform_roles
-- ============================================================

create policy platform_roles_select_self_or_superadmin
  on public.platform_roles for select
  to authenticated
  using (profile_id = auth.uid() or public.is_platform_superadmin());
-- No INSERT/UPDATE/DELETE policy at all, including for superadmin —
-- granting platform roles is an exceptional administrative operation, not
-- something exposed through the normal Data API yet.


-- ============================================================
-- specialties — global catalog
-- ============================================================

create policy specialties_select_authenticated
  on public.specialties for select
  to authenticated
  using (true);

create policy specialties_insert_superadmin
  on public.specialties for insert
  to authenticated
  with check (public.is_platform_superadmin());

create policy specialties_update_superadmin
  on public.specialties for update
  to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());
-- No DELETE policy — retire a specialty via active = false.


-- ============================================================
-- clinics — the tenant itself
-- ============================================================

create policy clinics_select_member_or_superadmin
  on public.clinics for select
  to authenticated
  using (public.is_clinic_member(id) or public.is_platform_superadmin());

create policy clinics_update_admin
  on public.clinics for update
  to authenticated
  using (public.has_clinic_role(id, array['clinic_admin']::public.membership_role[]))
  with check (public.has_clinic_role(id, array['clinic_admin']::public.membership_role[]));
-- No INSERT policy: first-clinic/onboarding creation is deliberately not
-- exposed to the authenticated Data API yet — it needs a controlled
-- server-side flow (bootstraps the first clinic_admin membership too,
-- which nothing here can do atomically). No DELETE policy: the lifecycle
-- tool is clinics.status = 'suspended', never a row delete.


-- ============================================================
-- clinic_locations
-- ============================================================

create policy clinic_locations_select_member_or_superadmin
  on public.clinic_locations for select
  to authenticated
  using (public.is_clinic_member(clinic_id) or public.is_platform_superadmin());

create policy clinic_locations_insert_admin
  on public.clinic_locations for insert
  to authenticated
  with check (public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[]));

create policy clinic_locations_update_admin
  on public.clinic_locations for update
  to authenticated
  using (public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[]))
  with check (public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[]));
-- WITH CHECK re-runs the same admin check against the NEW row's clinic_id
-- — an admin of clinic A editing a location cannot re-point it at clinic B
-- unless they're also admin there. No DELETE policy: use active = false.


-- ============================================================
-- clinic_memberships — controls permissions, handled with the most care
-- ============================================================

create policy clinic_memberships_select_member_or_superadmin
  on public.clinic_memberships for select
  to authenticated
  using (public.is_clinic_member(clinic_id) or public.is_platform_superadmin());
-- No INSERT/UPDATE/DELETE policy at all yet — deliberately, per the
-- design brief: a plain client-side INSERT/UPDATE here could add a
-- membership without going through invitation acceptance, let an admin
-- silently reassign their own role, or deactivate the last remaining
-- admin of a clinic. None of those are safely expressible as a simple row
-- policy — they need a controlled RPC that can check "is this the last
-- active admin" etc. as real application logic, not a WITH CHECK
-- expression. Left fully blocked until that RPC exists.


-- ============================================================
-- professional_profiles
-- ============================================================

create policy professional_profiles_select_member_or_superadmin
  on public.professional_profiles for select
  to authenticated
  using (public.is_clinic_member(clinic_id) or public.is_platform_superadmin());
-- No INSERT/UPDATE policy. INSERT: creation is bundled with membership
-- creation (invitation acceptance / admin-becomes-dentist flow), same RPC
-- boundary as clinic_memberships above. UPDATE: even scoped to
-- clinic_admin or to the profile's own owner, RLS can only filter by row,
-- not by column — nothing here stops a full-row UPDATE from also rewriting
-- clinic_id/clinic_membership_id (the composite FK would reject a truly
-- cross-tenant value, but not a swap to a *different* membership within
-- the same clinic). Reserved for a future RPC with an explicit column
-- whitelist rather than accepting that risk for convenience now. No
-- DELETE policy: use active = false.


-- ============================================================
-- clinic_invitations
-- ============================================================

create policy clinic_invitations_select_admin
  on public.clinic_invitations for select
  to authenticated
  using (public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[]));

create policy clinic_invitations_insert_admin
  on public.clinic_invitations for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[])
  );
-- No UPDATE policy: accepting an invitation must only ever happen as the
-- side effect of a validated token-consumption flow (setting `status`,
-- `accepted_membership_id`), never a bare client UPDATE that could mark
-- an invitation `accepted` without ever actually granting a membership.
-- Revoking is the same story — reserved for that future RPC. No DELETE
-- policy: use status = 'revoked'.


-- ============================================================
-- patients — clinic team access; clinic_admin/dentist/assistant read,
-- only clinic_admin/assistant write (dentist never creates patients here)
-- ============================================================

create policy patients_select_member
  on public.patients for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

create policy patients_insert_admin_or_assistant
  on public.patients for insert
  to authenticated
  with check (public.has_clinic_role(clinic_id, array['clinic_admin', 'assistant']::public.membership_role[]));

create policy patients_update_admin_or_assistant
  on public.patients for update
  to authenticated
  using (public.has_clinic_role(clinic_id, array['clinic_admin', 'assistant']::public.membership_role[]))
  with check (public.has_clinic_role(clinic_id, array['clinic_admin', 'assistant']::public.membership_role[]));
-- dentist: SELECT only, by design (matches current UI — odontólogos don't
-- create/edit patient records). No DELETE policy: use active = false.


-- ============================================================
-- Paciente autenticado leyendo su propia ficha — separate, additive
-- policy (Postgres OR's multiple permissive policies for the same
-- command together, so this doesn't touch the staff policy above)
-- ============================================================

create policy patients_select_own_via_link
  on public.patients for select
  to authenticated
  using (
    exists (
      select 1
      from public.patient_user_links l
      where l.patient_id = patients.id
        and l.profile_id = auth.uid()
    )
  );
-- Access is exclusively through an explicit patient_user_links row —
-- never by matching email/document/phone. No UPDATE policy for the
-- patient: which fields they may eventually self-edit is a future design
-- decision, not assumed here.


-- ============================================================
-- patient_access_invitations
-- ============================================================

create policy patient_access_invitations_select_admin_or_assistant
  on public.patient_access_invitations for select
  to authenticated
  using (public.has_clinic_role(clinic_id, array['clinic_admin', 'assistant']::public.membership_role[]));

create policy patient_access_invitations_insert_admin_or_assistant
  on public.patient_access_invitations for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.has_clinic_role(clinic_id, array['clinic_admin', 'assistant']::public.membership_role[])
  );
-- clinic_id/patient_id tenant consistency is additionally guaranteed by
-- the composite FK from the previous migration — RLS and the FK are two
-- independent layers here, not one relying on the other. No UPDATE
-- policy: even just revoking needs the RPC, so a client can't set
-- used_at/revoked_at directly. No SELECT-by-token-for-anon policy of any
-- kind — deliberately not created; token consumption is a future
-- SECURITY DEFINER RPC, never a row the anon role can query directly. No
-- DELETE policy.


-- ============================================================
-- patient_user_links — the most sensitive table: the only bridge from a
-- patient record to an authenticated account
-- ============================================================

create policy patient_user_links_select_self
  on public.patient_user_links for select
  to authenticated
  using (profile_id = auth.uid());

create policy patient_user_links_select_staff
  on public.patient_user_links for select
  to authenticated
  using (
    public.has_clinic_role(
      public.clinic_id_for_patient(patient_id),
      array['clinic_admin', 'assistant']::public.membership_role[]
    )
  );
-- dentist deliberately excluded — least privilege, not required for any
-- current screen. No INSERT/UPDATE/DELETE policy of any kind: a link may
-- only ever be created by consuming a valid patient_access_invitations
-- token through a future RPC — never a direct client insert, which would
-- otherwise let anyone claim any patient record by guessing/brute-forcing
-- IDs.
