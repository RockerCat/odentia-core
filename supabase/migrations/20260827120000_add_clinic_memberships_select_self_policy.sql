-- Odentia Core — let a member always see their own clinic_memberships row
--
-- clinic_memberships_select_member_or_superadmin (see foundation RLS
-- migration) gates visibility entirely through is_clinic_member(), which
-- requires status = 'active' on that very row. That makes a suspended or
-- inactive membership invisible even to its own owner — indistinguishable
-- from having no membership at all.
--
-- The real-auth route guard (see src/lib/supabase/proxy.ts) needs to tell
-- those two cases apart: "never onboarded" routes to /registro, while a
-- suspended/inactive membership must show its own explicit, safe screen
-- instead. This adds exactly that: a self-select policy with no status
-- predicate, additive to the existing one — it only ever exposes rows
-- where profile_id = auth.uid(), never another member's row, so it can't
-- widen access to anyone else's data.
create policy clinic_memberships_select_self
  on public.clinic_memberships for select
  to authenticated
  using (profile_id = auth.uid());
