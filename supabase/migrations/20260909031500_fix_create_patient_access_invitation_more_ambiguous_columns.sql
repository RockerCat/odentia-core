-- Odentia Core — create_patient_access_invitation: fix the REMAINING
-- ambiguous column references the previous migration (20260909030000)
-- missed on a first pass.
--
-- That migration fixed the "clinic_id" ambiguity but a second real E2E
-- attempt against production immediately hit another one of the exact
-- same class:
--   ERROR 42702: column reference "patient_id" is ambiguous
--
-- This function's own `returns table (id, patient_id, clinic_id,
-- expires_at, raw_token)` creates an implicit PL/pgSQL variable per
-- column — a full re-read of the function body (not just the one line
-- that already failed) found THREE more bare references matching those
-- same output column names, all against public.patient_access_invitations
-- or public.patient_user_links:
--   - `where patient_id = p_patient_id` (the "already linked" exists check)
--   - `where patient_id = p_patient_id ... and expires_at > now()` (the
--     supersede-pending-invitation UPDATE) — both patient_id AND
--     expires_at are ambiguous there.
-- Fixed by aliasing every table referenced in this function body, not
-- just the one that already broke — the same discipline
-- invite_clinic_member() already follows throughout. No other behavior
-- changes — same signature, same checks, same order.
create or replace function public.create_patient_access_invitation(p_patient_id uuid)
returns table (
  id uuid,
  patient_id uuid,
  clinic_id uuid,
  expires_at timestamptz,
  raw_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_patient_active boolean;
  v_raw_token text;
  v_token_hash text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'create_patient_access_invitation requires an authenticated session';
  end if;

  select p.clinic_id, p.active into v_clinic_id, v_patient_active
  from public.patients p
  where p.id = p_patient_id;

  if v_clinic_id is null then
    raise exception 'patient not found' using errcode = '42501';
  end if;

  if not public.has_clinic_role(v_clinic_id, array['clinic_admin', 'assistant']::public.membership_role[]) then
    raise exception 'only an active clinic_admin or assistant can grant portal access' using errcode = '42501';
  end if;

  if not v_patient_active then
    raise exception 'cannot invite an inactive patient' using errcode = '22023';
  end if;

  -- Aliased (pul.patient_id) — bare "patient_id" is ambiguous against
  -- this function's own RETURNS TABLE column of the same name.
  if exists (select 1 from public.patient_user_links pul where pul.patient_id = p_patient_id) then
    raise exception 'this patient is already linked to a portal account' using errcode = '22023';
  end if;

  -- Aliased (pai.patient_id, pai.expires_at) — same ambiguity risk, twice
  -- over, in this one UPDATE's WHERE clause.
  update public.patient_access_invitations pai
  set revoked_at = now()
  where pai.patient_id = p_patient_id
    and pai.used_at is null
    and pai.revoked_at is null
    and pai.expires_at > now();

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '7 days';

  insert into public.patient_access_invitations (clinic_id, patient_id, token_hash, created_by, expires_at)
  values (v_clinic_id, p_patient_id, v_token_hash, auth.uid(), v_expires_at)
  returning public.patient_access_invitations.id into v_invitation_id;

  return query
    select v_invitation_id, p_patient_id, v_clinic_id, v_expires_at, v_raw_token;
end;
$$;

revoke execute on function public.create_patient_access_invitation(uuid) from public;
grant execute on function public.create_patient_access_invitation(uuid) to authenticated;
