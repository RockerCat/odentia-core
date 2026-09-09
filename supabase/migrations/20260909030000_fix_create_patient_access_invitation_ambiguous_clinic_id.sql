-- Odentia Core — fix create_patient_access_invitation's ambiguous "clinic_id"
--
-- Same bug class as 20260909020000 (accept_clinic_invitation), confirmed
-- live against production the same way — a real "Dar acceso al Portal"
-- click failed outright:
--
--   ERROR 42702: column reference "clinic_id" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--
-- Root cause: this function's own `returns table (id uuid, patient_id
-- uuid, clinic_id uuid, expires_at timestamptz, raw_token text)` creates
-- an implicit PL/pgSQL variable per column, so the bare "clinic_id" in
--   select clinic_id, active into v_clinic_id, v_patient_active
--   from public.patients where id = p_patient_id;
-- was ambiguous against public.patients.clinic_id. This made granting
-- ANY patient Portal access fail unconditionally. Fix: alias the table.
-- No other behavior changes — same signature, same checks, same order.
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

  -- The patient's REAL clinic_id, resolved server-side from the patient
  -- row itself — never a client-supplied clinic_id. p_patient_id is never
  -- trusted to already belong to the caller's own clinic; that's exactly
  -- what the has_clinic_role() check right below enforces against this
  -- resolved value. Aliased (p.clinic_id/p.active) — bare "clinic_id" here
  -- is ambiguous against this function's own RETURNS TABLE column of the
  -- same name (see this migration's own header comment).
  select p.clinic_id, p.active into v_clinic_id, v_patient_active
  from public.patients p
  where p.id = p_patient_id;

  if v_clinic_id is null then
    raise exception 'patient not found' using errcode = '42501';
  end if;

  -- Only an active clinic_admin or assistant of THIS patient's own
  -- clinic — same two roles patient_access_invitations_insert_admin_or_
  -- assistant already authorizes for a direct INSERT, reused here as the
  -- real application-logic gate instead of a WITH CHECK expression (same
  -- "RPC layer for what RLS alone can't safely express" reasoning as
  -- invite_clinic_member). A Dentist calling this simply fails here —
  -- never widened beyond the existing policy's own two roles. Also what
  -- makes "staff of clinic A inviting a patient of clinic B" structurally
  -- impossible: has_clinic_role is checked against v_clinic_id (the
  -- PATIENT's real clinic), not the caller's own — a caller with no role
  -- in that specific clinic never passes, regardless of which clinic they
  -- do belong to.
  if not public.has_clinic_role(v_clinic_id, array['clinic_admin', 'assistant']::public.membership_role[]) then
    raise exception 'only an active clinic_admin or assistant can grant portal access' using errcode = '42501';
  end if;

  if not v_patient_active then
    raise exception 'cannot invite an inactive patient' using errcode = '22023';
  end if;

  -- Already linked — the one case this RPC must refuse outright, never
  -- issuing a second invitation for an already-claimed patient record.
  -- Structural backstop is patient_user_links_patient_id_key (unique on
  -- patient_id) either way; this is the clear, specific message the UI
  -- maps to "Este paciente ya tiene acceso al Portal".
  if exists (select 1 from public.patient_user_links where patient_id = p_patient_id) then
    raise exception 'this patient is already linked to a portal account' using errcode = '22023';
  end if;

  -- A still-pending, unexpired invitation for this patient is silently
  -- superseded, never left to accumulate as a second live token. This is
  -- NOT an error path: patient_access_invitations only ever stores
  -- token_hash (see that table's own migration) — the original raw token
  -- from whenever that pending row was created is permanently
  -- irrecoverable, so "reuse the existing invitation" is not an option
  -- that exists in this model. The only honest, secure behavior is to
  -- revoke it and mint a fresh one below, so the CTA in
  -- patient-record-modal.tsx can always be clicked again (lost link,
  -- closed modal, whatever) and just work — never a "there's already a
  -- pending invitation" dead end. An already-expired/used/revoked row is
  -- untouched by this UPDATE (its own WHERE already excludes them) and
  -- simply stays as history, exactly as CLAUDE.md's "no eliminar
  -- físicamente" convention already does for every other artifact table
  -- in this schema.
  update public.patient_access_invitations
  set revoked_at = now()
  where patient_id = p_patient_id
    and used_at is null
    and revoked_at is null
    and expires_at > now();

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  -- Same 7-day window invite_clinic_member() already uses for team
  -- invitations — no reason for a different convention here, and nothing
  -- in this task's scope calls for a configurable one.
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
