-- Odentia Core — Platform → Prospectos: status transition RPC
--
-- Second checkpoint of the commercial funnel (see 20260916190000's own
-- header, already applied to remote). Platform's own Prospectos screen
-- lets a Superadmin move a Prospecto through a minimal, sequential
-- pipeline — this migration never converts a Prospecto into a clinic
-- (see CLAUDE.md's Prospecto Comercial section: that stays a separate,
-- later, explicit Superadmin action reusing provision_clinic()).
--
-- Reuses commercial_prospects' existing is_platform_superadmin()-scoped
-- SELECT policy (commercial_prospects_select_superadmin, 20260916190000)
-- completely unchanged — this migration only adds the one legal WRITE
-- path. No table-level UPDATE grant to anon/authenticated is added
-- anywhere: this SECURITY DEFINER function remains the only way status
-- ever changes, and it changes ONLY status (+ updated_at via the
-- existing set_updated_at trigger) — identity/contact columns
-- (first_name/last_name/clinic_name/email/phone/city) are never
-- touched here; there is deliberately no general "edit prospect" RPC.
create function public.update_commercial_prospect_status(
  p_prospect_id uuid,
  p_new_status public.commercial_prospect_status
)
returns public.commercial_prospect_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.commercial_prospect_status;
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'update_commercial_prospect_status requires an authenticated session';
  end if;

  if not public.is_platform_superadmin() then
    raise exception 'only a platform superadmin can update a commercial prospect' using errcode = '42501';
  end if;

  -- Row-level lock: the transition check below must see the REAL,
  -- current status at the exact moment of this UPDATE, never a
  -- `currentStatus` the caller believes is current (that value is never
  -- even accepted as a parameter here). `for update` blocks a concurrent
  -- transition attempt on the same row until this one commits or rolls
  -- back — the same simple, single-row locking approach every other
  -- state transition in this schema already uses (e.g.
  -- accept_clinic_invitation()'s own row lock on clinic_invitations).
  select status into v_current
  from public.commercial_prospects
  where id = p_prospect_id
  for update;

  if v_current is null then
    raise exception 'prospect not found';
  end if;

  -- Minimal sequential pipeline (CLAUDE.md's Prospecto Comercial
  -- section): new → contacted → demo_scheduled → demo_completed → won.
  -- `lost` is reachable from any non-terminal state (never from `won` or
  -- from `lost` itself). `won` and `lost` are both terminal for this
  -- MVP — no transition out of either is ever allowed. A prospect can
  -- only ever reach `won` immediately after `demo_completed`: `new`/
  -- `contacted`/`demo_scheduled` → `won` are all deliberately rejected,
  -- not just unreached by the UI — a future clinic-conversion checkpoint
  -- will rely on `won` always implying a real demo actually happened
  -- first.
  if p_new_status = 'lost' then
    v_allowed := v_current not in ('won', 'lost');
  elsif v_current = 'new' and p_new_status = 'contacted' then
    v_allowed := true;
  elsif v_current = 'contacted' and p_new_status = 'demo_scheduled' then
    v_allowed := true;
  elsif v_current = 'demo_scheduled' and p_new_status = 'demo_completed' then
    v_allowed := true;
  elsif v_current = 'demo_completed' and p_new_status = 'won' then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'invalid status transition from % to %', v_current, p_new_status;
  end if;

  update public.commercial_prospects
  set status = p_new_status
  where id = p_prospect_id;
  -- updated_at is set by the existing set_updated_at trigger
  -- (20260916190000) — never written here directly.

  return p_new_status;
end;
$$;

revoke execute on function public.update_commercial_prospect_status(uuid, public.commercial_prospect_status) from public;
grant execute on function public.update_commercial_prospect_status(uuid, public.commercial_prospect_status) to authenticated;
-- Not granted to anon: only an authenticated, real platform Superadmin
-- may ever reach this — is_platform_superadmin() is the actual
-- authorization boundary; this grant only lets an authenticated call
-- reach the function body at all, same pattern as every other
-- privileged RPC in this schema (invite_clinic_member,
-- provision_clinic, provision_clinic_team_member, ...).
