-- Odentia Core — Patient Portal "Editar información personal": the patient
-- updates her OWN contact phone.
--
-- What the Portal (and the clinic's Pacientes/Agenda/Historia Clínica) show
-- as the patient's phone is patients.phone — the clinic's patient record —
-- not profiles.phone, so update_my_personal_info() (profiles) can't serve
-- this. Product decision (2026-09-25): the patient may change ONLY her
-- phone; name, document, birth date and email stay read-only (clinical/RIPS
-- identity managed by the clinic, and the Auth login).
--
-- patients stays staff-only for UPDATE (patients_update_admin_or_assistant
-- untouched, no grant widening): this is one narrow SECURITY DEFINER write
-- path. The row is resolved from auth.uid() through patient_user_links —
-- never a parameter — and, exactly like resolvePatientContext(), only when
-- the user has exactly ONE linked patient record (never silently picks).
--
-- Additive: one function, no table/RLS/data changes.

create function public.update_my_patient_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_patient_id uuid;
  v_links int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select count(*), min(l.patient_id::text)::uuid into v_links, v_patient_id
  from public.patient_user_links l
  where l.profile_id = auth.uid();

  if v_links <> 1 then
    raise exception 'no single linked patient record' using errcode = '42501';
  end if;

  if v_phone is not null and (char_length(v_phone) > 30 or v_phone !~ '^\+?[0-9 ()-]{7,30}$') then
    raise exception 'invalid phone' using errcode = '22023';
  end if;

  update public.patients
  set phone = v_phone
  where id = v_patient_id;
end;
$$;

revoke execute on function public.update_my_patient_phone(text) from public;
grant execute on function public.update_my_patient_phone(text) to authenticated;
