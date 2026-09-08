-- Odentia Core — Patient Portal: consume a patient_access_invitations
-- token into a real patient_user_links row
--
-- patients/patient_access_invitations/patient_user_links already exist
-- (foundation schema, 20260824210644) with RLS deliberately closed on
-- every patient_user_links write for `authenticated` — that migration's
-- own comment already names exactly this gap: "a link may only ever be
-- created by consuming a valid patient_access_invitations token through a
-- future RPC — never a direct client insert, which would otherwise let
-- anyone claim any patient record by guessing/brute-forcing IDs." This
-- migration is that RPC — no new table, no new RLS policy (the deny-by-
-- default policy on patient_user_links' INSERT stays exactly as strict
-- for any other path; SECURITY DEFINER writes on the function owner's
-- behalf, bypassing it only for this one sanctioned write).
--
-- Same token-hashing convention as invite_clinic_member()/
-- accept_clinic_invitation() (team-invitation-rpcs migration): pgcrypto's
-- digest() for a real SHA-256 hash, token_hash already a column on
-- patient_access_invitations, never the raw token stored. Unlike
-- clinic_invitations, patient_access_invitations has no `email` column at
-- all — this is a deliberate QR/link-claim design (see that table's own
-- migration comment: "pre-authorization for a patient to claim their own
-- record via QR/link"), not an oversight to fix here: whoever presents a
-- valid, unused, unexpired, unrevoked token is the one authorized to claim
-- it, exactly as already designed. Issuing a token (the staff-facing
-- "generate a QR/link for this patient" UI) is out of this task's scope —
-- only the acceptance/consumption side, per the task's own instructions;
-- the existing patient_access_invitations_insert_admin_or_assistant RLS
-- policy already lets staff create a row directly today.
create extension if not exists pgcrypto with schema extensions;

create function public.accept_patient_access_invitation(p_token text)
returns public.patients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_hash text;
  v_invitation public.patient_access_invitations;
  v_result public.patients;
begin
  if auth.uid() is null then
    raise exception 'accept_patient_access_invitation requires an authenticated session';
  end if;

  v_token_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');

  select * into v_invitation
  from public.patient_access_invitations
  where token_hash = v_token_hash;

  if v_invitation.id is null then
    raise exception 'this invitation link is not valid';
  end if;
  if v_invitation.revoked_at is not null then
    raise exception 'this invitation was revoked';
  end if;
  if v_invitation.used_at is not null then
    raise exception 'this invitation was already used';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception 'this invitation has expired';
  end if;

  -- Structural backstop is patient_user_links_patient_id_key (unique on
  -- patient_id, foundation schema) — this pre-check exists only to raise a
  -- clear, specific error instead of a raw unique_violation, same "pre-
  -- check for UX, constraint for the real guarantee under concurrency"
  -- split as every other racy write in this schema.
  if exists (select 1 from public.patient_user_links where patient_id = v_invitation.patient_id) then
    raise exception 'this patient record is already linked to an account';
  end if;

  -- Deliberately NO check that auth.uid() has no other patient_user_links
  -- row already: patient_user_links caps ONE linked account per patient
  -- record (unique on patient_id), never one patient per account — the
  -- same real person can legitimately be a patient at more than one
  -- clinic. resolve-patient-context.ts is what surfaces that ambiguity
  -- honestly to the Portal (a "multiple-links" state, never a silent
  -- pick) rather than this RPC refusing a second, entirely valid link.
  insert into public.patient_user_links (patient_id, profile_id, patient_access_invitation_id)
  values (v_invitation.patient_id, auth.uid(), v_invitation.id);

  update public.patient_access_invitations set used_at = now() where id = v_invitation.id;

  select * into v_result from public.patients where id = v_invitation.patient_id;
  return v_result;
end;
$$;

revoke execute on function public.accept_patient_access_invitation(text) from public;
grant execute on function public.accept_patient_access_invitation(text) to authenticated;
-- Not granted to anon: consuming an invitation always requires being
-- authenticated first (sign up or log in) — same convention as
-- accept_clinic_invitation, see /invitacion/[token]/page.tsx's own flow.
