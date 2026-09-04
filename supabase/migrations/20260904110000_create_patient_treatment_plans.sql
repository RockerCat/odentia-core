-- Odentia Core — Plan de Tratamiento (Historia Clínica → Resumen →
-- "Tratamientos activos")
--
-- A treatment is "active" only if it exists EXPLICITLY as an item in the
-- patient's own plan (status planned/in_progress) — never inferred from
-- patient_clinical_encounters (past visits), completed procedures,
-- appointments.reason (a scheduling-time snapshot, not a clinical plan),
-- or the treatments catalog itself (a clinic-wide list of names, no
-- per-patient lifecycle — see that migration's own comment). See
-- resumen-tab.tsx's former comment on why card 5 stayed a placeholder
-- until this table existed.
--
-- Two tables, same shape reasoning as patient_clinical_notes:
--   - patient_treatment_plans: one row per patient (like
--     patient_medical_histories — a patient has ONE plan, not a list of
--     named plans). No title/label column: nothing in this task's UX
--     needs one (there's no "create a plan" step at all — see the item
--     RPC below, which silently creates this row on first use), and an
--     unused column is worse than no column (see CLAUDE.md: avoid
--     unnecessary abstractions). Add one later if a real need appears.
--   - patient_treatment_plan_items: the actual treatments, one row each,
--     with their own status/notes/order. treatment_id is an OPTIONAL
--     reference to the treatments catalog (an item can be pure free
--     text); treatment_name is always a SNAPSHOT taken at write time —
--     renaming or deactivating a catalog treatment later must never
--     retroactively change what an existing item's history says it was
--     (same "snapshot, not live join" principle as appointments.reason).
--
-- Same tenant-integrity/authorization shape as patient_clinical_notes:
-- composite FK ties patient_id to its real clinic_id structurally on
-- BOTH tables (denormalized clinic_id/patient_id on items too, not just
-- a join through the plan — same defense-in-depth convention
-- patient_clinical_documents/patient_clinical_notes already use), every
-- write goes through a SECURITY DEFINER RPC gated by
-- is_active_clinical_professional() (reused as-is, not redefined).
-- Nothing here is ever physically deleted — a cancelled/completed item
-- stays in its own status forever, same "logical lifecycle only"
-- convention as every other clinical table in this schema.
create table public.patient_treatment_plans (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_treatment_plans_patient_id_key unique (patient_id),
  constraint patient_treatment_plans_patient_clinic_fk
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade
);

create trigger set_updated_at
  before update on public.patient_treatment_plans
  for each row execute function public.set_updated_at();

create index patient_treatment_plans_clinic_id_idx on public.patient_treatment_plans (clinic_id);

create table public.patient_treatment_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.patient_treatment_plans (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null,
  -- Optional catalog link — set null (never cascaded to delete the item)
  -- if the referenced treatment is later removed from the catalog; the
  -- item's own treatment_name snapshot survives either way.
  treatment_id uuid references public.treatments (id) on delete set null,
  treatment_name text not null check (length(btrim(treatment_name)) > 0),
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  notes text,
  -- Manual ordering within the plan (see reorder — out of this task's
  -- scope; items are created at the end via max(sort_order)+1 and stay
  -- in that order until a future task adds reordering).
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_treatment_plan_items_patient_clinic_fk
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade
);

create trigger set_updated_at
  before update on public.patient_treatment_plan_items
  for each row execute function public.set_updated_at();

create index patient_treatment_plan_items_plan_id_idx on public.patient_treatment_plan_items (plan_id);
create index patient_treatment_plan_items_clinic_id_idx on public.patient_treatment_plan_items (clinic_id);
create index patient_treatment_plan_items_patient_id_idx on public.patient_treatment_plan_items (patient_id);
-- Speeds up the Resumen card's/PDF's own "active only" (planned +
-- in_progress) filter and the plan modal's Activos/Completados/
-- Cancelados views.
create index patient_treatment_plan_items_status_idx on public.patient_treatment_plan_items (status);

alter table public.patient_treatment_plans enable row level security;
alter table public.patient_treatment_plan_items enable row level security;

-- READ: any active clinic member (clinic_admin/dentist/assistant) — same
-- shape as every other clinical table's own _select_member policy.
-- Asistente is read-only BY OMISSION, not a separate role check: no
-- INSERT/UPDATE policy exists on either table (see below), and every
-- write RPC re-checks is_active_clinical_professional(), which an
-- Asistente never passes.
create policy patient_treatment_plans_select_member
  on public.patient_treatment_plans for select
  to authenticated
  using (public.is_clinic_member(clinic_id));
create policy patient_treatment_plan_items_select_member
  on public.patient_treatment_plan_items for select
  to authenticated
  using (public.is_clinic_member(clinic_id));
-- No INSERT/UPDATE/DELETE policy at all on either table, deliberately —
-- same reasoning as patient_clinical_notes/patient_clinical_documents:
-- the write authorization rule isn't expressible as a simple row filter
-- without risking a client forging created_by/updated_by or moving a row
-- to a different patient_id/clinic_id. Every write goes through the RPCs
-- below instead.
grant select on public.patient_treatment_plans to authenticated;
grant select on public.patient_treatment_plan_items to authenticated;

-- Internal helper (not exposed to clients) — returns the patient's plan
-- id, creating the plan row on first use. There is deliberately no
-- client-facing "create plan" RPC: a patient's plan exists implicitly the
-- moment their first treatment item is added (see
-- insert_patient_treatment_plan_item below), matching the UX (no "create
-- plan" step anywhere — see this migration's own top comment on why
-- patient_treatment_plans has no title column).
create function public.get_or_create_patient_treatment_plan(p_patient_id uuid, p_clinic_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
begin
  select id into v_plan_id from public.patient_treatment_plans where patient_id = p_patient_id;
  if v_plan_id is not null then
    return v_plan_id;
  end if;

  insert into public.patient_treatment_plans (clinic_id, patient_id, created_by)
  values (p_clinic_id, p_patient_id, auth.uid())
  on conflict (patient_id) do nothing
  returning id into v_plan_id;

  if v_plan_id is null then
    -- Lost a concurrent-insert race — the other transaction's row is
    -- already there.
    select id into v_plan_id from public.patient_treatment_plans where patient_id = p_patient_id;
  end if;

  return v_plan_id;
end;
$$;

revoke execute on function public.get_or_create_patient_treatment_plan(uuid, uuid) from public;
-- Not granted to `authenticated` at all — internal helper only, called
-- from the SECURITY DEFINER RPCs below after they've already verified
-- authorization. Granting it directly would let any authenticated user
-- create a plan row (harmless on its own, but needless surface area).

-- Create a treatment item — resolves the patient's REAL clinic_id server-
-- side (never accepts one as an argument), checks
-- is_active_clinical_professional(), gets-or-creates the plan, computes
-- the next sort_order, and inserts with created_by always auth.uid().
-- p_treatment_id is optional; treatment_name is always required (the
-- snapshot — see this migration's own top comment) regardless of whether
-- a catalog treatment was picked.
create function public.insert_patient_treatment_plan_item(
  p_patient_id uuid,
  p_treatment_id uuid,
  p_treatment_name text,
  p_notes text
)
returns public.patient_treatment_plan_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_plan_id uuid;
  v_next_order integer;
  v_result public.patient_treatment_plan_items;
begin
  select clinic_id into v_clinic_id from public.patients where id = p_patient_id;
  if v_clinic_id is null then
    raise exception 'patient not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  -- A caller-supplied treatment_id must actually belong to this same
  -- clinic — never trust it blindly (a cross-clinic id here would
  -- otherwise silently leak which treatments another clinic's catalog
  -- has, via the FK still resolving).
  if p_treatment_id is not null and not exists (
    select 1 from public.treatments where id = p_treatment_id and clinic_id = v_clinic_id
  ) then
    raise exception 'treatment does not belong to this clinic';
  end if;

  v_plan_id := public.get_or_create_patient_treatment_plan(p_patient_id, v_clinic_id);

  select coalesce(max(sort_order), -1) + 1 into v_next_order
  from public.patient_treatment_plan_items
  where plan_id = v_plan_id;

  insert into public.patient_treatment_plan_items (
    plan_id, clinic_id, patient_id, treatment_id, treatment_name, notes, sort_order, created_by
  )
  values (
    v_plan_id, v_clinic_id, p_patient_id, p_treatment_id, p_treatment_name, p_notes, v_next_order, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.insert_patient_treatment_plan_item(uuid, uuid, text, text) from public;
grant execute on function public.insert_patient_treatment_plan_item(uuid, uuid, text, text) to authenticated;

-- Edit content only (treatment_id/treatment_name/notes) — never status
-- (see update_patient_treatment_plan_item_status below, a deliberately
-- separate action) and never plan_id/patient_id/sort_order. Resolves
-- clinic_id from the item row itself, same authorization boundary as
-- insert above. Re-picking a different catalog treatment here takes a
-- FRESH snapshot at edit time — an intentional user action, not the
-- catalog rename this task's own "no debe alterar el historial" rule is
-- about (that rule is about a passive rename in Configuración, never
-- about an explicit re-edit here).
create function public.update_patient_treatment_plan_item(
  p_item_id uuid,
  p_treatment_id uuid,
  p_treatment_name text,
  p_notes text
)
returns public.patient_treatment_plan_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_result public.patient_treatment_plan_items;
begin
  select clinic_id into v_clinic_id from public.patient_treatment_plan_items where id = p_item_id;
  if v_clinic_id is null then
    raise exception 'treatment plan item not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  if p_treatment_id is not null and not exists (
    select 1 from public.treatments where id = p_treatment_id and clinic_id = v_clinic_id
  ) then
    raise exception 'treatment does not belong to this clinic';
  end if;

  update public.patient_treatment_plan_items
  set treatment_id = p_treatment_id, treatment_name = p_treatment_name, notes = p_notes, updated_by = auth.uid()
  where id = p_item_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.update_patient_treatment_plan_item(uuid, uuid, text, text) from public;
grant execute on function public.update_patient_treatment_plan_item(uuid, uuid, text, text) to authenticated;

-- Status change only — deliberately separate from content edit above
-- (same "editar" vs "cambiar estado" separation the approved UX calls
-- for). Same authorization boundary. Never touched by
-- Atenciones/encounters (see this migration's own top comment: completing
-- a procedure during an atención never auto-completes a plan item in this
-- task) — the only way status changes is this RPC, called from the plan
-- management UI.
create function public.update_patient_treatment_plan_item_status(
  p_item_id uuid,
  p_status text
)
returns public.patient_treatment_plan_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_result public.patient_treatment_plan_items;
begin
  if p_status not in ('planned', 'in_progress', 'completed', 'cancelled') then
    raise exception 'invalid status';
  end if;

  select clinic_id into v_clinic_id from public.patient_treatment_plan_items where id = p_item_id;
  if v_clinic_id is null then
    raise exception 'treatment plan item not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  update public.patient_treatment_plan_items
  set status = p_status, updated_by = auth.uid()
  where id = p_item_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.update_patient_treatment_plan_item_status(uuid, text) from public;
grant execute on function public.update_patient_treatment_plan_item_status(uuid, text) to authenticated;
