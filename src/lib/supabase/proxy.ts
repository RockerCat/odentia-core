import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Called from src/proxy.ts (Next.js 16's request-interception convention,
// née "middleware" — see https://nextjs.org/docs/messages/middleware-to-proxy).
//
// This ONLY refreshes the Supabase auth session/cookies on every request.
// It deliberately does not redirect or gate anything: the app's real
// session/role gate is still the mock one in src/components/shell/
// use-route-guard.ts. Wiring real auth redirects here is a later task.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // With Fluid compute, don't put this client in a global variable —
  // always create a new one per request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims(): skipping or
  // reordering this call is what causes users to get randomly logged out
  // with SSR.
  await supabase.auth.getClaims();

  // IMPORTANT: return this exact response object (or copy its cookies onto
  // any replacement) — constructing a fresh NextResponse without doing so
  // drops the refreshed session cookies.
  return supabaseResponse;
}
