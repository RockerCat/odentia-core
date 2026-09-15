import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase client for trusted server-to-server runtime code
// only (e.g. src/app/api/sso/exchange/route.ts) — same precedent as
// scripts/rips-import/lib.mjs's own createAdminClient(), ported for the
// Next.js app runtime. NEVER import this from a Client Component or any
// module that could bundle into browser code: SUPABASE_SERVICE_ROLE_KEY
// has no NEXT_PUBLIC_ prefix specifically so Next never inlines it
// client-side, and this file must stay the only place that reads it in
// app code. No cookies, no session persistence/refresh — this client acts
// as the service role itself, never as a particular signed-in user.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("createAdminClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
