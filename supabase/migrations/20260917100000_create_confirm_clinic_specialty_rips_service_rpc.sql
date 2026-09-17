-- Odentia Core — RIPS Fase A4: write path for clinic_specialty_rips_services
--
-- clinic_specialty_rips_services was created SELECT-only on purpose
-- (20260912130000, "se prioriza seguridad sobre conveniencia, dejando
-- select-only hasta que una RPC/Server Action real ... se implemente junto
-- a esa UI"). This migration is that RPC — the ONLY write path this
-- migration creates. No RLS INSERT/UPDATE/DELETE policy is added: the
-- table stays exactly as RLS-closed to `authenticated` as before (same
-- deny-by-default convention as clinic_invitations/professional_profiles/
-- patient_user_links — every write goes through a SECURITY DEFINER RPC,
-- never a direct table mutation from the client), and this is
-- deliberately the ONE sanctioned write path, not one of two.
--
-- ============================================================
-- Authorization / tenant isolation
-- ============================================================
-- clinic_id is NEVER a parameter of this function — there is nothing for
-- a caller to spoof. Exactly the same resolution invite_clinic_member()
-- already uses (team-invitation-rpcs migration): the caller's OWN active
-- clinic_admin membership, re-derived from clinic_memberships via
-- auth.uid() inside the function, never trusted from the client. A
-- clinic_admin of clinic A therefore cannot write configuration for
-- clinic B under any input — the function simply has no way to be told
-- "clinic B" in the first place.
--
-- ============================================================
-- Catalog integrity — Grupo is DERIVED, never client-supplied
-- ============================================================
-- The function takes ONLY a specialty and a Servicio (a
-- rips_reference_values row under catalog_key='Servicios') — never a
-- separate Grupo parameter. Grupo is read off that Servicio's own
-- parent_code (already populated at import time — see
-- docs/rips-catalogs.md: "Servicios.parent_code = GrupoServicios,
-- derivado del sufijo textual oficial de Descripcion") and independently
-- re-verified to exist as an active GrupoServicios row. This makes an
-- inconsistent Grupo/Servicio pair structurally impossible to persist:
-- there is no code path in this function that ever accepts a Grupo value
-- from outside the catalog itself.
--
-- ============================================================
-- Supersede, not overwrite
-- ============================================================
-- Same order as import_rips_reference_values's own supersede step
-- (rips-catalog-infrastructure migration): mark any existing 'active' row
-- for THIS (clinic_id, specialty_id) as 'superseded' BEFORE inserting the
-- new 'active' one, inside the same transaction — the partial unique
-- index (clinic_specialty_rips_services_active_unique_idx, "at most one
-- active row per clinic+specialty") is therefore never transiently
-- violated, and no history row is ever deleted or overwritten.
--
-- ============================================================
-- Never touches specialty_rips_service_defaults
-- ============================================================
-- That table is Odentia's own global suggestion, read-only from the app
-- (see its own migration) — this function never reads it, writes it, or
-- treats it as an input. Whatever the client's UI showed as a "sugerencia"
-- is re-typed by the admin's own explicit selection into
-- p_rips_reference_value_id; the suggestion itself carries no authority
-- here.

create function public.confirm_clinic_specialty_rips_service(
  p_specialty_id uuid,
  p_rips_reference_value_id uuid
)
returns public.clinic_specialty_rips_services
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_specialty_active boolean;
  v_servicio record;
  v_grupo_exists boolean;
  v_result public.clinic_specialty_rips_services;
begin
  if auth.uid() is null then
    raise exception 'confirm_clinic_specialty_rips_service requires an authenticated session';
  end if;

  -- Only ever the caller's OWN clinic, and only while an ACTIVE
  -- clinic_admin there — same resolution invite_clinic_member() already
  -- uses, never a client-supplied clinic_id (there is no such parameter
  -- on this function at all).
  select m.clinic_id into v_clinic_id
  from public.clinic_memberships m
  where m.profile_id = auth.uid()
    and m.role = 'clinic_admin'
    and m.status = 'active'
  limit 1;

  if v_clinic_id is null then
    raise exception 'only an active clinic_admin can confirm this configuration' using errcode = '42501';
  end if;

  select active into v_specialty_active
  from public.specialties
  where id = p_specialty_id;

  if v_specialty_active is null then
    raise exception 'specialty not found' using errcode = '22023';
  end if;
  if not v_specialty_active then
    raise exception 'cannot configure an inactive specialty' using errcode = '22023';
  end if;

  -- Must be an ACTIVE row of exactly the Servicios catalog — never trust
  -- the client's own notion of "this id is a Servicio"; re-resolved from
  -- the official catalog itself here, same integrity requirement the
  -- table's own composite FK (clinic_specialty_rips_services_rips_reference_value_fk,
  -- against (id, catalog_key)) also enforces structurally at INSERT time.
  select id, code, parent_code into v_servicio
  from public.rips_reference_values
  where id = p_rips_reference_value_id
    and catalog_key = 'Servicios'
    and status = 'active';

  if v_servicio.id is null then
    raise exception 'Servicio not found in the official catalog' using errcode = '22023';
  end if;

  if v_servicio.parent_code is null then
    raise exception 'Servicio % has no Grupo de servicios in the official catalog', v_servicio.code using errcode = '22023';
  end if;

  -- Grupo is DERIVED from the Servicio's own parent_code, never a
  -- separate client-supplied value — see this migration's own header.
  select exists (
    select 1 from public.rips_reference_values
    where catalog_key = 'GrupoServicios' and code = v_servicio.parent_code and status = 'active'
  ) into v_grupo_exists;

  if not v_grupo_exists then
    raise exception 'Grupo de servicios % (from Servicio %) is not an active row in the official catalog', v_servicio.parent_code, v_servicio.code using errcode = '22023';
  end if;

  -- Supersede any existing active configuration for THIS (clinic,
  -- specialty) BEFORE inserting the new one — see this migration's own
  -- header on why the order matters.
  update public.clinic_specialty_rips_services
  set status = 'superseded',
      valid_to = coalesce(valid_to, current_date - 1)
  where clinic_id = v_clinic_id
    and specialty_id = p_specialty_id
    and status = 'active';

  insert into public.clinic_specialty_rips_services (clinic_id, specialty_id, rips_reference_value_id)
  values (v_clinic_id, p_specialty_id, v_servicio.id)
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.confirm_clinic_specialty_rips_service(uuid, uuid) from public;
-- authenticated only — never anon: confirming institutional RIPS config
-- always requires being an authenticated, active clinic_admin, enforced
-- INSIDE the function itself (never relying on RLS alone, consistent with
-- every other write RPC in this schema, e.g. invite_clinic_member).
grant execute on function public.confirm_clinic_specialty_rips_service(uuid, uuid) to authenticated;
