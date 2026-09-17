-- Odentia Core — preview_patient_access_invitation(): safe, pre-auth
-- Patient invitation preview
--
-- "Prompt Master — Corregir invitación/acceso de Patient reutilizando el
-- patrón de Team Invitations": the Team flow (preview_clinic_invitation(),
-- 20260916120000/20260916130000) already fixed this exact gap for staff —
-- /invitacion/[token] validates the token AND resolves pre-provisioned
-- identity BEFORE ever asking for account details, so a person who's
-- already known to the system never re-types name/apellido/email.
-- /portal/invitacion/[token] never had an equivalent: it went straight to
-- a generic AccountStep (name/apellido/email/password) with no read path
-- at all into the Patient this invitation actually points at, even though
-- that Patient (first_name/last_name/email) already exists. This RPC is
-- the missing read path — same anon-callable, read-only, minimal-payload
-- shape as preview_clinic_invitation(), adapted to patient_access_invitations'
-- own shape (no `email`/`status` columns — see that table's own migration
-- comment: this is a deliberate QR/link-claim design, not an oversight).
--
-- Status is derived here exactly the same way accept_patient_access_invitation()
-- already derives its own rejection messages (used_at/revoked_at/expires_at),
-- restated as a single value for display rather than duplicated per-branch
-- error text — this function never mutates any of those columns itself,
-- purely a read.
--
-- Never returns patient_id, clinic_id, invitation id, or token_hash — same
-- minimal-PII principle as preview_clinic_invitation()'s own comment: only
-- what the acceptance screen needs to render "vas a vincular tu cuenta con
-- Ana Pérez en Clínica X" and decide which of its states to show.
--
-- user_exists mirrors preview_clinic_invitation()'s own (profiles, not
-- auth.users — see that migration's comment for why), but resolved off the
-- PATIENT's own on-file email (public.patients.email), never a
-- client-supplied one — there is no invitation-level email to resolve it
-- from here, unlike clinic_invitations. patients.email is nullable (staff
-- may create a Patient without ever capturing one); when it's null,
-- user_exists is always false and the page/action layer is responsible for
-- failing closed on "no email to create an account with" rather than
-- inventing one.
create function public.preview_patient_access_invitation(p_token text)
returns table (
  status text,
  usable boolean,
  first_name text,
  last_name text,
  email text,
  clinic_name text,
  user_exists boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_hash text;
  v_invitation public.patient_access_invitations;
  v_patient public.patients;
  v_clinic_name text;
  v_status text;
  v_user_exists boolean;
begin
  v_token_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');

  select * into v_invitation
  from public.patient_access_invitations
  where public.patient_access_invitations.token_hash = v_token_hash;

  -- Not found: identical shape to preview_clinic_invitation()'s own
  -- not-found branch — status null-equivalent ('not-found'), usable
  -- false, everything else null/false.
  if v_invitation.id is null then
    return query select 'not-found'::text, false, null::text, null::text, null::text, null::text, false;
    return;
  end if;

  if v_invitation.revoked_at is not null then
    v_status := 'revoked';
  elsif v_invitation.used_at is not null then
    v_status := 'used';
  elsif v_invitation.expires_at <= now() then
    v_status := 'expired';
  else
    v_status := 'pending';
  end if;

  select * into v_patient from public.patients where id = v_invitation.patient_id;
  select c.name into v_clinic_name from public.clinics c where c.id = v_invitation.clinic_id;

  v_user_exists := false;
  if v_patient.email is not null then
    select exists (
      select 1 from public.profiles p where lower(p.email) = lower(v_patient.email)
    ) into v_user_exists;
  end if;

  return query
    select
      v_status,
      v_status = 'pending',
      v_patient.first_name,
      v_patient.last_name,
      v_patient.email,
      v_clinic_name,
      v_user_exists;
end;
$$;

revoke execute on function public.preview_patient_access_invitation(text) from public;
grant execute on function public.preview_patient_access_invitation(text) to anon, authenticated;
-- anon: required for the exact same reason as preview_clinic_invitation()
-- — the Portal invitation page must validate/preview the token before any
-- session exists at all. No direct SELECT granted anywhere on
-- patient_access_invitations, patients, clinics, or profiles — this
-- SECURITY DEFINER function is the only path, and it returns a fixed,
-- minimal column set regardless of caller. Knowledge of the real,
-- high-entropy raw token (pgcrypto-generated, same as every other
-- invitation in this schema) is what authorizes seeing this one patient's
-- minimal display identity — the same trust boundary
-- accept_patient_access_invitation() already relies on to let that same
-- token claim the record outright.
