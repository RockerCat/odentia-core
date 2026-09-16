import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Fixed literal, never accepted as input — this endpoint's only possible
// destination, by design (see the coordinated-logout audit's explicit
// "no redirect parameter" security decision).
const CORE_LOGIN_URL = "https://www.odentia.co/login";

// Coordinated logout (Core <-> Marketplace) — landing point for
// Marketplace-initiated logout: Marketplace's own customer-logout-action.ts
// clears odentia_customer_session first, then redirects the browser HERE
// to end Core's own real Supabase session too. Never redirects back to
// Marketplace — whichever app the user actually clicked "Salir" in is
// responsible for its OWN cleanup before ever navigating to the other
// app's endpoint, so no Core <-> Marketplace <-> Core loop is possible.
//
// Deliberately GET, unauthenticated, and idempotent: the only possible
// effect of visiting this URL is ending the CURRENT browser's own Core
// session — never someone else's, never a privilege change, never data
// exposure. Accepted as an intentional "logout CSRF" trade-off, not an
// oversight (see the coordinated-logout audit's own security decisions) —
// a signed one-time token/state would add real complexity to prevent a
// forced logout, which is not worth doing.
export async function GET() {
  const supabase = await createClient();
  // scope: "local" — same deliberate choice as signOutSupabase() (see
  // src/features/session/sign-out.ts): revoke only this session, never
  // "global" (every device this user is signed in on). auth-js already
  // clears local cookies even when the network call itself errors, so this
  // stays best-effort/idempotent without any extra handling — a browser
  // that already has no session here simply has nothing left to clear, and
  // still lands on the same login page as a normal logout would.
  await supabase.auth.signOut({ scope: "local" });

  return NextResponse.redirect(CORE_LOGIN_URL);
}
