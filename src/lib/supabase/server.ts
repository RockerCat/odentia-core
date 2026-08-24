import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase client for Server Components, Server Actions and Route
// Handlers. Creates a new client per call rather than a module-level
// singleton — required for Fluid compute / per-request isolation, and
// necessary anyway since it reads the request-scoped cookie store.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, which can't write cookies —
            // safe to ignore as long as the proxy (see src/proxy.ts) is
            // refreshing the session on every request.
          }
        },
      },
    },
  );
}
