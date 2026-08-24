import { createBrowserClient } from "@supabase/ssr";

// Single shared Supabase client factory for Client Components. Only the
// publishable (anon) key — never a privileged key belongs in browser code.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
