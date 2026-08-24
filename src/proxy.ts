import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 renamed the "middleware.ts" convention to "proxy.ts" (same
// mechanism, new file name/export — see
// https://nextjs.org/docs/messages/middleware-to-proxy). Scope is limited
// to refreshing the Supabase session on every request; it does not gate
// routes or redirect — see src/lib/supabase/proxy.ts.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
