// Error-logging helper for /clinica's real Supabase queries (see
// src/app/clinica/page.tsx, src/features/clinic/data.ts) — only ever
// called on an actual query failure, never on success. Exists because
// `console.error("...", error)` alone can render as `{}` once the value
// crosses certain boundaries (Next's server→browser console forwarding
// for a Server Component, JSON.stringify, etc.): a PostgrestError's
// code/message/details/hint or a plain Error's message/stack aren't
// guaranteed to survive that as enumerable own properties. Explicitly
// pulling them into a plain object literal here does survive it,
// regardless of the mechanism.
//
// Never includes anything from the Supabase client itself — no JWT,
// cookies, or access/refresh tokens are ever part of a query error's
// shape, so there's nothing to redact beyond not passing the client/
// session objects in here.
export type SerializedQueryError = {
  operation: string;
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
};

export function serializeQueryError(operation: string, error: unknown): SerializedQueryError {
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    return {
      operation,
      code: typeof e.code === "string" ? e.code : null,
      message: typeof e.message === "string" ? e.message : String(error),
      details: typeof e.details === "string" ? e.details : null,
      hint: typeof e.hint === "string" ? e.hint : null,
    };
  }
  return { operation, code: null, message: String(error), details: null, hint: null };
}

export function logStepFailed(operation: string, error: unknown): void {
  console.error(`[/clinica] ${operation} failed`, serializeQueryError(operation, error));
}
