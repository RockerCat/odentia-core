import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveSafeNext } from "./resolve-safe-next";

// Official Supabase + Next.js App Router pattern for completing an email
// confirmation server-side (Route Handlers, unlike Server Components, are
// allowed to write cookies — see src/lib/supabase/server.ts's setAll,
// which no-ops silently outside that context). This is what actually
// establishes the SSR session via cookies; the wizard's client-side
// getSession() then just reads what's already there.
//
// Handles both link shapes Supabase Auth can produce for a signup
// confirmation, depending on the project's email template:
// - token_hash + type: the current default template's own link — verified
//   directly via verifyOtp(), no extra hop through Supabase's hosted
//   /verify endpoint.
// - code: what a plain, unmodified `{{ .ConfirmationURL }}` produces once
//   it redirects here after GoTrue's own hosted /verify step, for a
//   signUp() that used the PKCE flow (forced by @supabase/ssr's browser
//   client — see src/lib/supabase/client.ts).
// Neither requires customizing the Auth Email Template in the dashboard.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  // resolveSafeNext accepts both an already-relative path AND a
  // same-origin absolute URL — the Confirm Signup/Reset Password templates
  // embed `.RedirectTo` (GoTrue's own echo of signUpAccount()'s/
  // requestPasswordReset()'s own emailRedirectTo) directly as `next=`, see
  // those functions' own comments. Never follows an attacker- or
  // email-client-supplied absolute URL to a different origin. The
  // fallback (when nothing usable survives) differs by flow: a recovery
  // link with no recoverable destination belongs on /reset-password, never
  // /registro — landing an already-onboarded admin on /registro's own
  // "already onboarded" screen is a dead end with no password form on it.
  const next = resolveSafeNext(searchParams.get("next"), origin, type === "recovery" ? "/reset-password" : "/registro");

  const supabase = await createClient();

  const { error } = tokenHash && type
    ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error("missing token_hash/type or code") };

  if (!error) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Covers an invalid code, an expired link, and a link that was already
  // consumed (e.g. an email client's link-safety prefetch beating the
  // user's own click) — all surface the same way to Supabase Auth, and all
  // get the same safe, generic outcome here. Never forward `error.message`
  // to the client.
  return NextResponse.redirect(`${origin}/registro?auth_error=confirmation_failed`);
}
