import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Server-to-server exchange endpoint for Marketplace SSO Paso B: redeems a
// one-time authorization code (minted by issue_marketplace_sso_code() in
// Core, Paso A) for verified Odentia identity. Never called from a
// browser — only from Marketplace's own backend, authenticated with a
// dedicated shared secret (never the Supabase service role key, session
// secret, or any other existing credential).

// Same format issue_marketplace_sso_code() always produces: 32 bytes of
// gen_random_bytes hex-encoded is always exactly 64 lowercase hex chars.
const RAW_CODE_PATTERN = /^[0-9a-f]{64}$/;

// One identical response for every way a code can fail to redeem —
// never existed, expired, already consumed, or its membership/clinic no
// longer validates. The caller must not be able to distinguish these.
// Built fresh per call (not a shared module-level Response) since a
// Response body can only be consumed once.
function notConsumableResponse() {
  return NextResponse.json({ error: "code is not consumable" }, { status: 410 });
}

function internalErrorResponse() {
  return NextResponse.json({ error: "internal error" }, { status: 500 });
}

function hasValidSharedSecret(request: NextRequest, expectedSecret: string): boolean {
  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, providedSecret] = authHeader.split(" ");
  if (scheme !== "Bearer" || !providedSecret) {
    return false;
  }

  const providedBuffer = Buffer.from(providedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);

  // timingSafeEqual throws on mismatched lengths — the length check
  // itself leaks only length, never content, and must happen before the
  // call rather than via try/catch.
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  // Fail closed: an unconfigured secret must never be treated as "no auth
  // required".
  const expectedSecret = process.env.MARKETPLACE_SSO_SHARED_SECRET;
  if (!expectedSecret) {
    return internalErrorResponse();
  }

  if (!hasValidSharedSecret(request, expectedSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const rawCode = (body as { code?: unknown } | null)?.code;
  if (typeof rawCode !== "string" || !RAW_CODE_PATTERN.test(rawCode)) {
    return NextResponse.json({ error: "invalid code" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_marketplace_sso_code", { p_raw_code: rawCode });

  if (error) {
    // consume_marketplace_sso_code() always raises SQLSTATE 22023 for
    // every "not consumable" case (missing/expired/already-consumed code,
    // or a revalidation failure) — anything else is a genuine unexpected
    // failure (e.g. connectivity), which must surface as 500, not be
    // mistaken for a semantically invalid code.
    return error.code === "22023" ? notConsumableResponse() : internalErrorResponse();
  }

  // consume_marketplace_sso_code() is RETURNS TABLE, so a successful call
  // comes back as a one-row array — same shape convention as every other
  // RETURNS TABLE RPC in this codebase (see e.g. inviteClinicMember in
  // src/features/clinic/team-actions.ts).
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return notConsumableResponse();
  }

  return NextResponse.json({
    coreUserId: row.core_user_id,
    clinicId: row.clinic_id,
    membershipId: row.membership_id,
    role: row.role,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    // From consume_marketplace_sso_code()'s own clinics lookup (see
    // 20260915130000) — never a second query, never accepted from the
    // request body.
    clinicName: row.clinic_name,
  });
}
