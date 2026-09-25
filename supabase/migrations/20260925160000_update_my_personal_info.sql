-- Odentia Core — "Editar información personal" (Mi perfil profesional):
-- a user corrects her OWN name and phone.
--
-- profiles (first_name, last_name, phone) is already the single source for
-- a person's name/phone everywhere (headers, Equipo, /portal/clinica,
-- Agenda). profiles_update_self RLS exists, but `authenticated` has no
-- UPDATE grant on profiles at all — rather than widening that grant, this
-- is one narrow SECURITY DEFINER write path whose target is ALWAYS
-- auth.uid() (no profile-id parameter to spoof). Email is deliberately NOT
-- editable here: it is the Supabase Auth login identity.
--
-- Additive: one function, no table/RLS/data changes.

create function public.update_my_personal_info(p_first_name text, p_last_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_first_name text := btrim(coalesce(p_first_name, ''));
  v_last_name text := btrim(coalesce(p_last_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v_profile_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if v_first_name = '' or v_last_name = '' then
    raise exception 'first and last name are required' using errcode = '22023';
  end if;

  if char_length(v_first_name) > 80 or char_length(v_last_name) > 80 then
    raise exception 'name too long' using errcode = '22023';
  end if;

  if v_phone is not null and (char_length(v_phone) > 30 or v_phone !~ '^\+?[0-9 ()-]{7,30}$') then
    raise exception 'invalid phone' using errcode = '22023';
  end if;

  update public.profiles
  set first_name = v_first_name,
      last_name = v_last_name,
      phone = v_phone
  where id = v_profile_id;
end;
$$;

revoke execute on function public.update_my_personal_info(text, text, text) from public;
grant execute on function public.update_my_personal_info(text, text, text) to authenticated;
