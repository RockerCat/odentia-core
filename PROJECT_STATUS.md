# PROJECT_STATUS.md

# Odentia Core

**Last Updated:** 2026-09-15

---

# Estado actual

**MVP FEATURE COMPLETE + REAL E2E STABILIZED — FUNCTIONAL FREEZE / MANUAL QA.**

Every feature vertical in the MVP scope (see "REAL / COMPLETO PARA MVP" below) runs
on real, tenant-isolated Supabase data — Auth, Postgres, RLS, Storage — with an
honest empty state everywhere real data doesn't exist yet. The only screens still on
Phase 1 mock data are the ones explicitly out of scope for this MVP (see "OUT OF
SCOPE ACTUAL" below): Mi Suscripción, Superadmin/`/admin`, and the Patient Portal's
own Mi salud dental.

**New checkpoint (this update): Real E2E Stabilization is done.** All 7 critical
production journeys were exercised for real against `https://odentia.co` — real
Supabase Auth, real Resend emails, real production DB writes, real RLS, real
production navigation — never `/dev-qa/*` routes or mocked services as PASS
evidence. Five real P0/P1 bugs were found this way (two of which no unit or
fixture test could ever have caught) and are fixed and verified live in
production, plus one real, non-security gap (F001). See "REAL E2E STABILIZATION"
below for the full journey matrix, fixes, and verification results.

**Feature Complete ≠ Production Ready — this distinction still stands.** Real E2E
Stabilization means the CRITICAL production journeys are proven end-to-end with
real, independent accounts; it does not mean every possible flow/edge case has
been exercised (see "REMAINING MANUAL QA" below — a second Patient account for
isolation, a second Dentist, signed-document access, etc.). That's exactly what
happens next: **Functional Freeze — full manual QA, systematically by role**
(Clinic Admin → Dentist → Assistant → Patient).

Historical framing, kept for continuity: **Phase 1** (below) was the mock,
navigable-only prototype. **Phase 2** was converting it to real Supabase data, one
vertical at a time, never redesigning the approved UI. **Phase 3** was Real E2E
Stabilization — proving the critical journeys work end to end in production, not
just in code. Phase 3 is done. **Phase 4 (current)** is full manual QA by role —
see "Success Criteria" below.

**RIPS, added during Functional Freeze (explicitly requested, not scope creep):**
a full Colombian regulatory-reporting vertical (RIPS sin factura, Documento
Técnico 1 / Resolución 948 de 2026) was built and shipped between this
checkpoint and the previous one, as its own explicitly-scoped initiative — the
Functional Freeze policy below is about not *proactively* expanding MVP scope,
not about refusing a distinct, explicitly-requested feature. See "RIPS
(Colombian regulatory reporting)" under "Progress So Far" for the full detail;
it does not change anything about the Functional Freeze/Manual QA status above.

**Checkpoint 2026-09-14 — RIPS A3 smoke PASS, A4 is next.** RIPS #8's A3
("¿Qué realizaste?" consuming into `encounter_services`) went through a real
synthetic smoke (Muelitas7 / Alex Paciente) end to end — atención finalized,
`/rips` correctly found it and its services, readiness correctly blocked only
on the expected `RIPS_SERVICE_CONFIGURATION_MISSING` (this is the intended
architecture, not a bug — see "RIPS #8" below). Three UX gaps found during
that smoke were fixed and re-validated the same day: the per-service manual
professional selector (removed — inherited from the Cita automatically now),
"Servicios realizados"'s layout (responsive two-column), and CIE-10 diagnosis
discoverability ("Usados en esta clínica", tenant-scoped real suggestions).
See "RIPS #8" below for the full detail. **Next: A4 — Especialidad → Servicio
RIPS write path for `clinic_admin`** (today, `clinic_specialty_rips_services`
is select-only; nothing writes to it yet). Separately, and unrelated to RIPS:
`PatientRecordModal`'s "Resumen clínico"/KPIs/"Próxima cita" were found to be
hardcoded placeholders (predating the real `appointments`/
`patient_clinical_encounters` tables) and were connected to real data the
same day — see "Pacientes" below.

There is also an independent, unrelated piece of WIP preserved in this repo's
own git stash (`stash@{0}: "wip: invitation auth acceptance flow"`, a P1
invitation/auth fix) — not part of RIPS, not touched during any of the above,
intentionally left stashed for its own separate follow-up.

**Checkpoint 2026-09-15 — SSO Core → Marketplace: PASS end-to-end in
Production.** A real customer identity handoff from Core to Marketplace is
now live: an authenticated Core user reaches Marketplace already recognized,
with Core remaining the sole authority over identity/registration/membership/
clinic and Marketplace creating no parallel customer account. Verified with a
real manual smoke against production (Alex Sosa / clínica Muelitas7) — see
"SSO Core → Marketplace" below for the full architecture, security
properties, the two Production configuration issues found and fixed during
smoke, and the smoke result itself. Core's own Marketplace entry points
(desktop sidebar, mobile tab bar, `/agenda`'s Marketplace card) already start
this flow — no separate follow-up needed there.

**Checkpoint 2026-09-15 — Marketplace Order Attribution: Checkpoint 1
PASS.** The downstream phase this SSO checkpoint originally called out as
"next" is now done and verified in Production: an Order Marketplace creates
under a valid `odentia_customer_session` is attributed to the Core identity
that session certifies, and guest checkout (no Core identity) still works
unchanged. The implementation lives entirely in `odentia-marketplace` — Core
gained no new table, migration, or downstream responsibility. See "SSO Core
→ Marketplace" below for the full detail and both Production smoke results.

**Checkpoint 2026-09-15 — Marketplace Order Attribution: Checkpoint 2
PRODUCTION PASS.** The next downstream phase this same section previously
called out as pending — Marketplace admin visibility into Core-attributed
vs. guest orders — is also done and verified in Production. Implementation
lives entirely in `odentia-marketplace`; Core required no changes. Downstream
Order Attribution's base (persistence + admin visibility) is now complete —
see "SSO Core → Marketplace" below for both Checkpoint 1 and Checkpoint 2
detail.

**Checkpoint 2026-09-15 — Shared Cart: Checkpoint A — PRODUCTION PASS.**
Core's authenticated header now shows the REAL Marketplace cart count next
to the notification bell, not a static/fake badge. Core receives the same
`odentia_cart` cookie Marketplace already owns (domain-shared under
`.odentia.co` in Production only) and is strictly read-only with respect to
it — it never writes, mutates, or clears the cookie, and there is no new
API, fetch, or duplicated cart state. See "SSO Core → Marketplace" below for
the full detail and Production smoke results.

**Checkpoint 2026-09-15 — Shared Cart: Checkpoint B — PRODUCTION PASS.**
Only the cart icon's own link now asks Marketplace's existing customer SSO
to land on `/carrito` after a successful login, via a `return_to` query
param Core sends only on that one link — every other Core → Marketplace
entry point is unchanged and still lands on Marketplace's `/` as before.
Core does not interpret, persist, or validate `return_to` in any way; none
of Core's SSO routes, RPCs, or database were touched. See "SSO Core →
Marketplace" below for the full detail and Production smoke results.

---

# REAL E2E STABILIZATION — Functional Freeze Checkpoint (2026-09-09)

Production target: `https://odentia.co`. Every journey below drove the real
deployed app with real browser automation — never `/dev-qa/*`, never a mocked
Supabase client — with real Resend emails checked and pasted back by a human for
every confirmation/reset/invitation link (browser automation has no inbox
access). All 7 PASS.

| Journey | Result |
|---|---|
| A — Fresh Clinic Admin (signup → real email → onboarding → `/agenda`, hard refresh, new tab, empty-clinic state) | ✅ PASS |
| B — Forgot / Reset Password (real email → real password change → real re-login) | ✅ PASS |
| C — Dentist Invitation (real invite → real signup → real email preserving context → accept → deactivate/reactivate → reuse rejected) | ✅ PASS |
| D — Assistant Invitation (same real path, role=assistant, zero own professional_profile, correctly scoped permissions) | ✅ PASS |
| E — Patient Portal Invitation (real patient → real invite → real signup → real email preserving context → Portal loads) | ✅ PASS |
| F — Appointment Request → Staff Acceptance (real request, real acceptance RPC, exactly 1 appointment, double-accept rejected) | ✅ PASS |
| G — Clinical Lifecycle Smoke (real appointment → Iniciar atención → Finalizar atención → completed, encounter finalized before the Cita closes, immutability confirmed) | ✅ PASS |

## Production stabilization fixes found through Real E2E (all fixed, deployed, reverified live)

- **Blank `/agenda` on a fresh hard navigation after login** — `useRouteGuard`'s
  session/role reads raced React's own SSR-hydration-matching render, firing a
  premature redirect for an already-authenticated user. `src/components/shell/
  use-route-guard.ts` now gates the redirect decision on actual hydration.
  Regression: `use-route-guard.test.ts`.
- **Authenticated-context self-healing** — the mock session bridge was only ever
  written from `/login`'s own form submit; a user who reached a gated page
  without ever submitting that form (e.g. straight from onboarding) never got
  bridged and saw a permanently blank shell, with no amount of refreshing fixing
  it. `useRouteGuard` now re-resolves and bridges the real context itself before
  concluding "not authenticated". `src/features/session/role-bridge.ts`
  (`bridgeAuthenticatedContext`), `src/app/login/page.tsx`. Regression:
  `role-bridge.test.ts`.
- **Recovery redirect fallback** — real Reset Password emails landed on
  `/registro`'s "already onboarded" dead end instead of `/reset-password` (the
  Redirect-URL-allow-list collapse below, with the wrong fallback destination
  for the recovery flow specifically). `src/app/auth/confirm/
  resolve-safe-next.ts`/`route.ts` now take an explicit per-flow fallback.
  Regression: `resolve-safe-next.test.ts` (+2).
- **Team invitation RPC ambiguous-column failure** — `accept_clinic_invitation`
  failed unconditionally with Postgres error 42702 ("column reference clinic_id
  is ambiguous") — **100% of team invitation acceptances were broken** before
  this fix. Migration `20260909020000_fix_accept_clinic_invitation_ambiguous_clinic_id.sql`.
- **Patient access invitation RPC ambiguous-column failures** —
  `create_patient_access_invitation` failed the same way, twice over
  (`patient_id`, then `expires_at` — the second only surfaced on the very next
  real attempt after the first partial fix). Migrations `20260909030000` +
  `20260909031500`. A dedicated audit of every `RETURNS TABLE` function across
  all of `supabase/migrations/` confirmed these two functions were the only
  instances of this bug class in the whole schema.
- **F001 — Patient accessing staff routes** — an authenticated, linked Patient
  hitting a staff-only route (`/agenda` etc.) was redirected to `/registro`'s
  onboarding wizard instead of `/portal` — never a security issue (no clinic
  data was ever exposed to her), just the wrong destination.
  `src/lib/supabase/proxy.ts`'s `decideClinicRedirect` now takes an
  `isLinkedPatient` flag; every other status branch (`ok`, `unauthenticated`,
  `membership-inactive`, `clinic-suspended`, `multiple-memberships`) is
  provably unaffected. Regression: `decide-clinic-redirect.test.ts`. **CLOSED
  in production, commit `104843a`** — verified live with a real linked Patient
  (`/agenda` → `/portal` → resolves to `/portal/citas`, its own pre-existing
  behavior) and a real Clinic Admin (staff access, including a hard refresh,
  unchanged).

Also root-caused along the way, not a code fix: the Supabase **Redirect URLs**
allow-list was missing the `www.` subdomain the app actually serves from
(`https://www.odentia.co/**`) — every confirmation/recovery/invitation email's
`redirect_to` was silently collapsing to the bare Site URL until this was added
in the dashboard. Once corrected, Confirm Signup/Reset Password/Equipo/Patient
invitation emails all preserve their real destination end to end.

## Final verification

- **179/179 tests PASS**
- TypeScript clean (`tsc --noEmit`)
- ESLint clean (real application code)
- Production build clean (`npm run build`)
- 50/50 migrations in sync (`supabase migration list --linked`)
- F001 production commit: `104843a`
- Production behavior reverified live with real Clinic Admin, Dentist,
  Assistant, and Patient accounts after every fix

## Functional Freeze Policy (current phase)

Odentia Core is now in **Functional Freeze** for the duration of manual QA:

- Do not add new MVP functionality unless explicitly requested.
- Bugs/regressions found during QA are fixed surgically, with focused
  regression coverage — same discipline as every fix above.
- Avoid broad refactors or unrelated cleanup while the freeze is in effect.

## Next phase: Full Manual QA, systematically by role

1. Clinic Admin
2. Dentist
3. Assistant
4. Patient

See "REMAINING MANUAL QA" below for what Real E2E Stabilization did NOT
independently re-verify and still needs a human pass.

---

# REAL / COMPLETO PARA MVP

Real Supabase Auth + Postgres + RLS + Storage, tenant-isolated, unless noted.
Detailed per-vertical implementation notes are further below.

- **Auth** — real Supabase Auth: login/logout, forgot/reset password, onboarding
  (`/registro`, 3-step wizard), route protection (`src/lib/supabase/proxy.ts`, no
  dev bypass, and a real Patient with no staff membership is routed to `/portal`,
  never `/registro`'s onboarding wizard — see F001 under "REAL E2E
  STABILIZATION"). Staff and Patient invitations are both real (real tokens,
  real acceptance flows) — shared manually as a copyable link; **no automated
  invitation email** exists yet for either, but the confirmation email itself
  (Custom SMTP via Resend) is real and Real-E2E-verified end to end for all
  three signup contexts (`/registro`, Equipo, Patient Portal) — see "REAL E2E
  STABILIZATION" above and Autenticación below.
- **Onboarding** — real 3-step wizard creating a real Supabase Auth user, `clinics`
  row (with sede principal + map/geocoding + logo), and the founding `clinic_admin`
  membership.
- **Clínica** — Información general, sede principal (map/geocoding/logo), Equipo
  (real list + invite + activate/deactivate), Mi perfil profesional (**real
  editing**, not just display), Consultorios (`rooms`).
- **Equipo** — real invite (`invite_clinic_member`) → real accept
  (`accept_clinic_invitation`) → real activate/deactivate
  (`set_clinic_member_status`). No automated email; no member-role-editing RPC
  exists (only invite + status toggle).
- **Mi perfil profesional** — real create (`create_my_professional_profile`, Clinic
  Admin self-service) and edit (`update_my_professional_profile`, Dentist +
  clinically-active Clinic Admin), reachable from both `/clinica` and its own
  `/mi-perfil-profesional` route.
- **Pacientes** — real CRUD, real KPIs ("Sin atención +6 meses" excludes patients
  with zero finalized encounters — see Historia Clínica below), real "Acceso del
  paciente" invitation issuance (see Patient Portal below).
- **Agenda** — real weekly board, KPIs, full Cita CRUD, arrival/waiting-room flow,
  "Marcar No asistió", Iniciar/Continuar/Finalizar atención, Solicitud de Cita
  (staff side). Overlap and availability/absences are enforced in Postgres
  (constraint + trigger), not just app code. The board's own slot grid and every
  time picker (Nueva cita, Reprogramar, Aceptar solicitud) now derive their
  bookable slots from each professional's real `professional_availability`,
  never a hardcoded 08:00–18:00 default — see "Agenda — disponibilidad real"
  below.
- **Solicitud de Cita** — real, end to end, a genuinely separate entity from Cita
  (see CLAUDE.md's Appointment Lifecycle).
- **Historia Clínica (staff)** — all five tabs real, plus Notas clínicas
  importantes, Plan de Tratamiento, and PDF export.
- **Rooms / Treatments** — real, tenant-scoped catalogs backing Agenda's own
  pickers.
- **Availability / Absences** — real, per-professional; see the dedicated section
  below for the exact three-state semantics.
- **Reportes** — real (`appointments`, finalized `patient_clinical_encounters` +
  their procedures), with period and professional filters.
- **Patient Portal** — real identity (`patient_user_links` via
  `resolvePatientContext()`), Mis citas, Confirmar asistencia, Solicitud de Cita,
  Mi Historia Clínica (read-only), Mi perfil, Mi clínica. **Except** Mi salud
  dental (still mock — see OUT OF SCOPE ACTUAL).
- **Marketplace** — real external link to the independently-deployed Marketplace
  app; Odentia Core never shares its database or business logic with it.
- **RIPS** (`/rips`, Clinic Admin only) — real regulatory-identity fields on
  clinics/sedes/professionals/patients, real structured clinical data per
  atención (`encounter_diagnoses`/`encounter_services`, CIE-10/CUPS validated
  against real SISPRO catalogs), real readiness checks, and a real, runtime-
  validated RIPS sin factura JSON export with download. The odontólogo now
  captures a natural clinical concept ("¿Qué realizaste?") in "Finalizar
  atención" instead of picking CUPS directly — resolved server-side to a
  real CUPS row and, when the clinic has confirmed one, a real Servicio
  RIPS. A finalized encounter's own two RIPS gaps can be corrected narrowly
  without reopening the clinical record. See "RIPS (Colombian regulatory
  reporting)" below for the full detail.

---

# PARCIAL / P2

- **Configuración**, secondary sections only — agenda defaults (appointment
  duration/interval, time format), notification toggles, and regional preferences
  are still plain `useState`, **not persisted** (no backend, no table). Reachable
  by a real user, but explicitly out of MVP scope — never claim these save
  anything. Configuración's own **Tratamientos**, **Horario/Disponibilidad**, and
  **Ausencias** sections are real (see REAL above) — only these leftover
  preference toggles are P2.
- Onboarding's "Configure Schedule"/"Invite Assistant" as dedicated wizard steps —
  not built; both are reachable today through their own real screens instead
  (Configuración → Horario, Clínica → Equipo).

---

# OUT OF SCOPE ACTUAL

Confirmed by reading the code directly — not silently broken, deliberately not
built for this MVP:

- **Mi Suscripción** (`/suscripcion`) — fully mock UI, no data fetching at all, no
  payment provider integration. Per CLAUDE.md, Claude must not integrate one.
- **Superadmin** (`/admin`) — fully mock, no real auth wired up. `role-bridge.ts`
  never produces a `"superadmin"` mock role from a real session (`ClinicContext`'s
  `membership.role` type only ever has `clinic_admin | dentist | assistant`), so
  `/admin` is unreachable through any real login flow in production — only through
  the DEV role switcher in development.
- **`/portal/salud`** (Mi salud dental) — still Phase 1 mock (`CURRENT_PATIENT`,
  `WEEK_APPOINTMENTS`), a separate screen from Mi Historia Clínica (real). Not
  started.
- **Patient-initiated reprogramación/cancelación** — deliberately not built (the
  old mock buttons were removed, not kept as fake non-persisting ones). Per
  CLAUDE.md, these are proposals the clinic approves; that approval lifecycle has
  no backend yet.
- **Automated communications** — no transactional email, WhatsApp, SMS, or push
  notifications anywhere in the codebase. Every "invitation" (staff or patient) is
  a real, persisted, tokenized link the admin/assistant copies and shares
  manually; the UI always says "creada"/"copiar enlace", never "enviada". `wa.me`
  links throughout the app (clinic contact numbers) are manual deep-links a person
  clicks — never an automated send.

---

# REMAINING MANUAL QA (next phase — see Functional Freeze above)

Real E2E Stabilization (see above) exercised the 7 critical journeys directly
against production with real, independent accounts. The items below are what it
did **not** independently re-verify — genuine gaps for the upcoming systematic
manual QA pass, not known bugs. None of these are P0/P1 feature gaps; treat a
failure found here as a bug to fix, not evidence the feature doesn't exist.

- [ ] Clinic Admin with no `professional_profile` → self-creates one via
      `/mi-perfil-profesional` or `/clinica` in a real browser session (the
      Real E2E admin deliberately chose the pure-admin onboarding path, never
      exercising this).
- [ ] Reportes with more than one real professional in the same clinic (filter by
      professional) — only one Dentist existed in the Real E2E clinic.
- [ ] Patient/clinic isolation with a SECOND real patient account: a Patient
      linked to clinic A can never read/act on anything in clinic B; a Patient
      can never read another patient's data. (Real E2E used one patient account,
      which only proves she sees her OWN data — not that a second patient's is
      unreachable.)
- [ ] Cross-dentist permissions: a Dentist can never see/act on another Dentist's
      own-scoped Citas or Solicitudes in the same clinic (only one Dentist
      existed in the Real E2E clinic).
- [ ] Clinical documents: a real Patient session can open a signed URL for her own
      document, and only her own (no test document existed in the Real E2E run).
- [ ] Availability/absences with a second real Dentist configured differently from
      the first — confirm neither's rules leak into the other's slots.
- [ ] Full arrival flow with a real session: Paciente llegó → Sala de espera →
      Iniciar atención → Finalizar atención, confirm the Cita and the resulting
      Atención end up correct. (Real E2E's Journey G smoke-tested Iniciar →
      Finalizar directly, skipping the optional arrival sub-steps — see
      CLAUDE.md's own note that arrival is never a prerequisite.)

## Already resolved (kept for history — do not re-open)

- [x] Equipo/Patient invitation acceptance with a real second account —
      **PASS**, Real E2E Stabilization, Journeys C/D/E.
- [x] Patient Portal with a real, independent Patient login — **PASS**,
      Real E2E Stabilization, Journey E.
- [x] Solicitud de Cita: create (Patient) → accept (staff) → confirm exactly 1
      `appointments` row is created and the request is linked; double-accept
      rejected, never a duplicate Cita — **PASS**, Real E2E Stabilization,
      Journey F, confirmed via direct authenticated REST queries against the
      real DB, not just the UI.
- [x] Patient confirms attendance / full request lifecycle from a real Portal
      session — **PASS**, Real E2E Stabilization, Journey F.
- [x] `ClinicalNotesModal` showing "Sin asignar" for a real Patient session —
      **fixed during the pre-release QA Master** (was a duplicated author
      lookup that never used the Patient-aware fallback every other tab
      already had). No longer a QA item; verified by re-running
      `qa-clinical-notes-check.mjs` (still green — staff behavior unchanged)
      plus `tsc`/`eslint`.
- [x] **Node runtime:** fixed during the pre-release QA Master — `package.json`
      now pins `"engines": { "node": ">=22.12.0" }` (the highest floor among
      declared deps: `@supabase/*` need `>=22.0.0`, `puppeteer-core`/
      `@puppeteer/browsers` need `>=22.12.0`) and `.nvmrc` pins `22` for local
      `nvm use`. Validated for real under Node 22.23.2 (installed via `nvm`):
      `npm ci`, `tsc --noEmit`, `eslint`, and `npm run build` all clean. Vercel's
      own Project Settings → Node.js Version should still be confirmed to match
      (out-of-repo, can't be verified from here).
- [x] **Migrations gate:** `supabase migration list --linked` re-confirmed
      during Real E2E Stabilization — 50/50 in sync, `local` = `remote`.
- [x] **Equipo/Patient invitation signup landing on `/registro` instead of back
      on the invitation.** Was P1. **Fixed:** root cause was the Supabase
      Redirect URLs allow-list missing the `www.` subdomain the app actually
      serves from — once added, real invitation links (Journeys C/D/E)
      preserve their destination through the real confirmation email,
      verified live. See "REAL E2E STABILIZATION" above.
- [x] Forgot/reset password: confirmed `resetPasswordForEmail()`'s own email
      template DID suffer the same `redirect_to` collapse as confirm-signup,
      and is now fixed (recovery falls back to `/reset-password`, never
      `/registro`'s onboarding wizard). See "REAL E2E STABILIZATION" above
      (Journey B).
- [x] **F001 — Patient accessing a staff route redirected to `/registro`
      instead of `/portal`.** Fixed and closed in production, commit
      `104843a`. See "REAL E2E STABILIZATION" above.

---

# Progress So Far — implementation notes

Detailed per-vertical technical notes, kept for anyone extending these features —
not a changelog. Every claim below was true as of the last time that section was
touched; if code and this section ever disagree, the code wins (see CLAUDE.md).

## Autenticación (real)

- Real Supabase Auth (`signInWithPassword`) at `/login`. `resolveClinicContext()`
  (staff) and `resolvePatientContext()` (patient) are the two single sources of
  truth for "who is this real user, and what's their clinic/role/professional
  context" — used by the real route guard (`src/lib/supabase/proxy.ts`), both
  login flows, and each shell's own identity display.
- Forgot/reset password: real `resetPasswordForEmail()`/`updateUser()` flow
  (`/forgot-password`, `/reset-password`), never reveals whether a submitted email
  has an account.
- **PKCE `/?code=` fallback** (`decideRootCodeRedirect`, `src/lib/supabase/proxy.ts`)
  — a defense-in-depth safety net for a stray PKCE `code` landing bare on `/`;
  forwards it server-side to `/auth/confirm?code=<code>&next=/registro`, never
  a second PKCE exchange implementation, `next` always the hardcoded literal
  `/registro` (open-redirect-proof by construction). Covered by
  `decide-root-code-redirect.test.ts`.
- **Confirm Signup / Reset Password templates use `{{ .TokenHash }}`/
  `{{ .RedirectTo }}` explicitly** (Custom SMTP via Resend is configured).
  `emailRedirectTo` (`signUpAccount()`/`requestPasswordReset()`) sends the real
  destination directly rather than a query string the app built;
  `resolveSafeNext()` (`src/app/auth/confirm/resolve-safe-next.ts`) turns
  whatever `.RedirectTo` resolves to back into a safe relative path, with a
  per-flow fallback (`/registro` for signup, `/reset-password` for recovery —
  landing a recovery link on `/registro`'s "already onboarded" screen was a
  real bug, fixed). Covered by `resolve-safe-next.test.ts`.
  **Fixed during Real E2E Stabilization:** the actual root cause of every
  confirmation/recovery/invitation email losing its destination was the
  Supabase Redirect URLs allow-list missing the `www.` subdomain the app
  actually serves from (`https://www.odentia.co/**`) — once added in the
  dashboard, `/registro`, `/invitacion/[token]`, and `/portal/invitacion/[token]`
  all preserve their real destination through a real confirmation email,
  verified live with real accounts. See "REAL E2E STABILIZATION" above.
  **Follow-up (2026-09-11):** a signup started on `localhost` while
  pointed at the shared dev/prod Supabase project still had its
  confirmation email land the browser on production — Supabase always
  runs the token exchange on Site URL's own host (a single, global
  setting), regardless of where signup began. `resolveSafeNext()` now
  trusts one narrow exception beyond same-origin: a loopback destination
  (`http://localhost`/`http://127.0.0.1`, any port, exact hostname match,
  `http` only). This gets the browser back to the right environment but
  does NOT restore the session there (cookies never cross domains) — a
  normal password login re-establishes a real local session from that
  point. A separate hypothesis — making `emailRedirectTo` itself point at
  `/auth/confirm?next=...` so `.RedirectTo` could be used as the callback
  base directly — was investigated and rejected: it would reintroduce a
  regression already hit once in production (a Redirect-URL-rejected
  `.RedirectTo` collapsing to a bare Site URL, which breaks the entire
  link when it's the href's own prefix, not just a query value). Covered
  by new cases in `resolve-safe-next.test.ts`.
- **F001 fix** — `proxy.ts`'s clinic-path gate (`decideClinicRedirect`)
  distinguishes a genuinely new, unlinked account from an authenticated,
  linked Patient: a Patient with no staff clinic membership hitting a
  staff-only route is redirected to `/portal`, never `/registro`'s onboarding
  wizard. Covered by `decide-clinic-redirect.test.ts`. Closed in production,
  commit `104843a`.
- **Compatibility bridge**: the real resolved clinic role (never name/avatar) is
  written into the legacy mock `src/features/auth/session.ts` / `RoleContext`
  store (`src/features/session/role-bridge.ts`) so the remaining still-mock
  screens (Configuración's secondary sections, `/admin`, `/suscripcion`) keep
  working unmodified. New real features must read `resolveClinicContext()`/
  `resolvePatientContext()` directly and never derive permissions from
  `RoleContext`/`useRole()`/the DEV role switcher. Any component showing a
  user-facing NAME must use the real-overlay `useShellIdentity()`
  (`src/components/shell/use-shell-identity.ts`), never the raw mock
  `useAuthenticatedIdentity()` alone — the bridge above never carries name/avatar,
  so the mock hook alone can show a fixed/mock name for a real user (this was a
  real, fixed bug: `/agenda`'s own greeting).
- `src/dev/` (role switcher, mock dentist resolver) is still present — still used
  by every remaining mock screen — and remains a disposable, never-a-source-of-
  real-authorization shim.
- Route guard (`proxy.ts`) enforces real auth on every private route, including
  `npm run dev` — no `NODE_ENV === 'development'` bypass. `/admin` is
  deliberately excluded from this real gate (see OUT OF SCOPE ACTUAL).
- **Fixed (2026-09-12): public landing page flashed the signed-out CTAs to an
  already-authenticated visitor.** `/` (`src/app/page.tsx`) resolved
  `ClinicContext` only client-side, after mount — an already-signed-in
  visitor briefly saw "Registra tu clínica"/"Iniciar sesión" before the real
  state resolved. `LandingPage` is now `async` and calls
  `resolveClinicContext()` server-side (same one every real feature uses),
  so the header/hero/closing CTA render the correct state on the first
  paint; a failed resolution falls back to the public CTAs rather than
  blocking the page. `LandingHeader` takes the resolved `authContext`
  directly instead of a client-only `showAuthWhenSignedIn` flag.

## Onboarding (real)

- `/registro` — a real 3-step wizard (Cuenta → Clínica → Rol) that creates a real
  Supabase Auth user, a real `clinics` row (name, slug, sede principal with a real
  Leaflet/Nominatim map picker + geocoding, logo upload to a public Storage
  bucket), and the founding `clinic_admin` membership via a `SECURITY DEFINER`
  bootstrap RPC (`bootstrap_clinic`). Handles email-confirmation-pending and
  mid-onboarding-reentry states.
- **Real bugs found and fixed in production this pass (2026-09-11):**
  - **NIT (tax_id) rejected by `clinics_tax_id_format`** — `bootstrap_clinic()`
    (Paso 3) sent the NIT exactly as typed, while `updateClinicInfo()` (the
    `/clinica` settings path) already stripped non-digits. A real NIT typed
    with its customary "-DV" check-digit suffix made the RPC's own `clinics`
    INSERT fail the RIPS #3 format CHECK, surfaced only as the generic "No
    pudimos crear tu clínica." Fixed at two layers: `sanitizeTaxId()` (now
    shared, `src/features/onboarding/api.ts`) applied before the RPC call,
    plus `isValidTaxIdLength()` — a frontend check on Paso 2 (`clinic-step.tsx`)
    that blocks "Continuar" with a clear message before ever reaching the RPC
    if the sanitized value is outside the DB's own 4-12 digit bound. Covered
    by `api.test.ts`.
  - **`/registro` loop for an already-onboarded user** — landing on
    `/registro` with a real, active clinic membership showed a static
    "ya tienes una clínica" screen whose only ways forward were signing out
    (back to Paso 1, no visible clinic) or a link to the public marketing
    page — never into the app. The only real way in was to sign out and log
    back in through `/login`. Fixed: `decideRegistroReentry()` now redirects
    that case straight to `/agenda` (same destination
    `decideAuthenticatedRedirect()` already uses at `/login` for the
    identical condition); the old static screen/component was removed.
    `/registro` also gained its own "Cerrar sesión" (`decideAfterSignOut()`)
    for the case a session with NO membership simply belongs to the wrong
    account — unlike the app shell's own "Salir", a failed sign-out here
    surfaces an error and does not navigate, since there's nowhere else on
    this screen to retry from. Covered by new cases in `api.test.ts`.
  - **Success screen still pointed at the old demo flow** — "Volver al
    inicio" (→ `/`) plus "Muy pronto podrás iniciar sesión con tu cuenta
    real..." — both stale now that Auth is fully real. Now: "Ir a mi
    agenda" (→ `/agenda`, real session preserved), disclaimer text removed
    with no replacement.
- A real login for a user with NO clinic membership at all (never
  onboarded, or a genuinely different account than the one that owns a
  clinic) correctly lands on `/registro` — confirmed, during this same
  pass, to be `resolveClinicContext()` working exactly as designed, not a
  bug: it independently re-queries `clinic_memberships` and only ever
  reports `"ok"` for a real active row. A temporary debug instrumentation
  (`[resolveClinicContext:debug]`) was added to `resolve-clinic-context.ts`
  to trace a specific report of this, confirmed the account genuinely had
  no membership, and was fully removed afterward (the file is
  byte-identical to before the instrumentation).

## Clínica (real, Clinic Admin)

- `/clinica` — **Información general** (real, editable inline). **Equipo** (real:
  list, invite via `invite_clinic_member`, activate/deactivate via
  `set_clinic_member_status`). **Mi perfil profesional** (real display AND real
  editing — `create_my_professional_profile`/`update_my_professional_profile`).
  **Consultorios** — real, tenant-scoped catalog (`public.rooms`): add/rename, no
  physical delete (`active = false`).
- `/mi-perfil-profesional` — a second, narrower real route into the exact same
  Mi perfil profesional card, reachable by a plain Dentist (who has no `/clinica`
  access at all).

## Equipo — real invitations

- `invite_clinic_member(email, role)` — Clinic Admin only, `dentist`/`assistant`
  only (never a second `clinic_admin` through this flow). Real cryptographic
  token (`pgcrypto`), only its SHA-256 hash persisted, returned once to copy/share
  manually. Rejects an already-active member or a second pending invitation for
  the same email.
- `accept_clinic_invitation(token)` — the only path that creates a real
  `clinic_memberships` row; requires the accepting account's own email to match
  the invitation's. A `dentist` acceptance auto-creates a minimal
  `professional_profiles` row (clinical capacity from day one); `assistant` never
  gets one.
- `set_clinic_member_status(membership_id, active)` — Clinic Admin only, refuses
  to deactivate the clinic's last active admin.
- No email automation, no member-role-editing RPC — do not assume either exists.

## Pacientes (real, Clinic Admin/Dentist/Assistant)

- `/pacientes` — real, tenant-scoped `patients` table. Search/filter, list,
  4-KPI header (Pacientes activos / Nuevos este mes / Con cita próxima / Sin
  atención +6 meses — all four real counts now, the last one deliberately
  excluding patients with zero finalized encounters, never "0" for "never
  attended"), create/edit, and a 3-column patient quick-profile modal
  (`PatientRecordModal`).
- **Acceso del paciente** (`PatientRecordModal`'s own card, real) — Clinic
  Admin/Assistant (never Dentist) generate a real Patient Portal invitation link
  (`create_patient_access_invitation`, same token/hash pattern as Equipo's
  `invite_clinic_member`) and copy it to share manually. A pending invitation is
  silently superseded on regeneration (only `token_hash` is ever persisted, so
  the previous raw link can never be recovered or resent); an already-linked
  patient shows "Acceso al Portal activo" and can never be re-invited.
- **`PatientRecordModal`'s "Resumen clínico" (real, fixed 2026-09-14)** —
  Última atención/Odontólogo habitual/Citas completadas/Canceladas-no
  asistió/Próxima cita/Historial de citas used to be literal hardcoded
  placeholders ("Sin atenciones registradas", "0", "Sin cita programada")
  left over from before `appointments`/`patient_clinical_encounters`
  existed for this component — found during the RIPS A3 smoke (the
  contradiction: `/rips` correctly found a just-finalized atención while
  this modal still said "Sin atenciones registradas"). Now real: Última
  atención/Odontólogo habitual read `fetchPatientClinicalEncounters`
  (`finalized_at IS NOT NULL` only, same criterion `/rips` itself uses)
  + `resolveUpdatedByProfessional` on the last encounter's `attended_by`;
  the two KPI counts and Próxima cita/Historial de citas reuse the SAME
  `fetchAppointmentsForPatient` array the modal already loads (no second
  fetch) plus `lastVisitLabelFrom`/`nextAppointmentLabelFrom`, the exact
  functions Historia Clínica's own Resumen tab already uses — never a
  second, divergent implementation. Historial de citas' row/badge
  presentation and its "Historial de citas" card background (`bg-surface`)
  were matched to Agenda's own `RealAppointmentDetailModal` panel for
  visual consistency. No DB/RPC/migration changes.
- Tenant isolation and role-based permissions come from
  `resolveClinicContext()`/`clinical-permissions.ts` server-side — never the DEV
  role switcher.

## Historia Clínica (real, staff, all five tabs)

- `/pacientes/[id]/historia-clinica` — real, tenant-scoped patient identity header
  plus a real "Alertas clínicas" banner, all fed by real data.
- **Resumen** — all 8 cards real: Alergias/Medicamentos/Condiciones
  (`patient_medical_histories`), Última atención (`patient_clinical_encounters`,
  finalized only), Tratamientos activos (`patient_treatment_plan_items`), Próxima
  cita (`appointments`), Última actualización del odontograma
  (`patient_tooth_findings`), Notas clínicas importantes (`patient_clinical_notes`).
- **Antecedentes** — one row per patient (`patient_medical_histories`), editable
  by `dentist`/`clinic_admin` with an active `professional_profile` via a
  `SECURITY DEFINER` RPC.
- **Odontograma** — individual finding records (`patient_tooth_findings`, one row
  per hallazgo). Same authorization rule as Antecedentes.
- **Atenciones** — `patient_clinical_encounters`, only ever rows with
  `finalized_at is not null`. Read-only in this tab by design — rows are
  created/updated by "Guardar borrador"/"Finalizar atención" in Agenda's own
  Atención flow, never a second creation path. Linked to its originating Cita via
  a nullable, unique `appointment_id`.
- **Documentos** — `patient_clinical_documents` + a private `clinical-documents`
  Storage bucket (20MB limit; JPG/PNG/WEBP/PDF/DOC/DOCX). Upload/edit
  metadata/logical-archive gated by `canEditClinicalData()` — same rule as every
  other clinical write (`dentist`, or `clinic_admin` with an active
  `professional_profile`); read-only for `assistant` and for a plain
  `clinic_admin` with no professional profile of her own.
- **Notas clínicas importantes** (Resumen card) — `patient_clinical_notes`,
  patient-level, distinct from an encounter's own notes and from Antecedentes'
  observations. Logical archive only.
- **Plan de Tratamiento** (Resumen's "Tratamientos activos" card) —
  `patient_treatment_plans` + `patient_treatment_plan_items`. Each item snapshots
  its own `treatment_name` — a later catalog rename never rewrites plan history.
- **Descargar PDF** — real, generated client-side from the same real rows this
  screen already holds.
- Every write goes through a `SECURITY DEFINER` RPC — `clinic_id` and the acting
  professional always resolved server-side from `auth.uid()`.

## Agenda (real, Clinic Admin/Dentist/Assistant)

- `/agenda` — real, tenant-scoped weekly appointment board
  (`RealAppointmentsBoard`/`RealAgendaScreen`) + KPI cards (`RealSummaryCards`).
- **Cita CRUD** — create (`RealNewAppointmentModal`), reschedule/cancel/
  reactivate/change status, "Paciente llegó"/"Enviar a sala de espera" (real
  arrival flow, front-desk roles only), "Marcar No asistió". Real 8-value status
  vocabulary (`scheduled | confirmed | patient_arrived | waiting_room |
  in_progress | completed | no_show | cancelled`).
- **"Sin cerrar"** (`real-status.ts`) — a non-terminal Cita more than 2 hours
  (`UNRESOLVED_GRACE_MINUTES`) past its scheduled end reads as `Sin cerrar`
  everywhere its status shows — purely derived, the real DB `status` never
  changes on its own.
- **No past appointments, one rule, everywhere** — `isPastInstant`
  (`appointments-actions.ts`) is the single backend source of truth.
- **Iniciar/Continuar atención → Finalizar atención** — moves the Cita to
  `in_progress` and opens `/agenda/atencion/[appointmentId]`
  (`RealClinicalEncounterScreen`), keyed by the appointment id so a refresh
  reconstructs it from Postgres. "Guardar borrador"/"Finalizar atención" both
  upsert the SAME `patient_clinical_encounters` row keyed by `appointment_id` —
  idempotent, never a duplicate, and the Cita only ever flips to `completed`
  AFTER the encounter write succeeds.
- Overlap (`appointments_no_overlap`, a Postgres GiST EXCLUDE constraint) and
  availability/absences (`validate_appointment_availability` trigger — see
  Availability below) are enforced in the database, not just app code.
- `Solicitud de Cita` — see its own section below; on the Agenda side it's a
  **separate card** in the right-hand column (`RealAppointmentRequestsCard`),
  never a row on the board.
- **Roles/RLS for clinical writes** — any active Dentist, or a Clinic Admin with
  her own active `professional_profile`, may register/edit clinical data for ANY
  patient in her clinic — deliberately clinic-wide, never restricted to "assigned
  to this professional." `clinic_id` is the only mandatory isolation boundary.
- Known gap (tracked, not blocking): "¿Necesita próxima cita?"'s Sí/No toggle in
  `RealClinicalEncounterScreen` is UI-only, never persisted.
- **Fixed (2026-09-14): a `waiting_room` Cita can start attention regardless
  of `startsAt`, same calendar day.** `canStartClinicalEncounter`
  (`real-status.ts`) used to gate every non-`in_progress` Cita on the same
  30-minute pre-start window — a professional running ahead of schedule
  couldn't start attention on a patient already sitting in the waiting room
  (front desk already ran "Enviar a sala de espera") until that window
  opened. Now a `waiting_room` Cita is always startable the same day,
  regardless of how far before `startsAt` it still is. Regression:
  `real-status.test.ts`.
- **Agenda — disponibilidad real (2026-09-12/14, two-pass fix).**
  `src/features/dashboard/agenda-hours.ts` (new) is now the single source of
  truth turning a professional's real `professional_availability` rows into
  the actual bookable slots the board's grid and every time picker
  (`RealNewAppointmentModal`, `RealAppointmentDetailModal`,
  `RealAppointmentRequestsCard`) render — replacing
  `schedule-config.ts`'s hardcoded `CLINIC_HOURS` (08:00–18:00), which they
  all rendered unconditionally before, regardless of what a professional had
  actually configured.
  - **First pass** caught the headline symptom (a professional configured
    Sábado hasta las 22:00; Agenda still cut the grid off at 17:30) by
    computing one continuous `[earliest start, latest end]` range from the
    day's active blocks.
  - **Second pass** found that first fix itself wrong on two counts: (1) two
    blocks the same day (e.g. a lunch-split 08:00–12:00 + 14:00–18:00) must
    never collapse into one continuous range — the gap between them must
    stay unbookable, so slots are now generated **per block**, unioned, never
    from an envelope; (2) a block's own `start_time`/`end_time` was being
    rounded to a whole hour — `<input type="time">` (`horario-editor.tsx`)
    has no `step` restricting it to :00/:30, so a real 08:30–17:30 block must
    yield slots anchored exactly at 08:30 through 17:00, never an invented
    08:00 or an extended 17:30. Also fixed, same pass: the fallback
    ("zero rows → legacy-unrestricted 08:00–18:00") is now evaluated **per
    professional**, never per clinic — a professional with real
    configuration who simply left one day unconfigured now shows zero slots
    that day, never the default; and `hasAvailableFutureSlot`'s own
    hardcoded-`TIME_SLOTS` day-selectability check (which decides whether
    "hoy" is even pickable in every Fecha popover) was replaced, for every
    real Agenda picker, by `hasAvailableFutureSlotForDay` — real,
    per-professional availability, same as the grid.
  - An existing Cita's own slot is always preserved on the board even if a
    later availability change would otherwise make it fall outside the
    professional's real configured hours (`mergeOccupiedSlotMinutes`) — an
    appointment is never hidden by a schedule edited after it was booked.
  - The Patient Portal's own "Solicitar cita" (`request-appointment-scheduler.tsx`)
    deliberately keeps the OLD hardcoded-default `hasAvailableFutureSlot` —
    it has no professional/availability context yet (a request doesn't
    reserve a slot or run these rules at all, see Appointment Lifecycle in
    CLAUDE.md), so this was left untouched rather than widening scope.
  - Regression: `agenda-hours.test.ts` (new, 16 focused tests) plus
    `real-status.test.ts` unchanged/still green (slot-occupancy matching was
    never touched).
- **Fixed during the pre-release QA Master (P1):** `showStartEncounter` in
  `RealAppointmentDetailModal` used to be gated on `!showMarkArrived &&
  !showSendToWaitingRoom` — since `showMarkArrived` is true for ANY non-
  cancelled scheduled/confirmed Cita viewed by a front-desk role
  (`clinic_admin`/`assistant`), "Iniciar atención" could never appear at all
  for that role until "Paciente llegó" AND "Enviar a sala de espera" were
  BOTH clicked first, no matter how far past `startsAt` the Cita already
  was — directly contradicting this component's own comment ("nothing
  stops her from skipping the arrival flow entirely") and materially
  degrading CLAUDE.md's own Primary Use Case (a solo Clinic-Admin-Dentist
  with no separate front desk). Caught by `qa-can-start-encounter-check.mjs`.
  Fixed by inverting the dependency: `showStartEncounter` now depends only
  on role/time-window (`canAttendPatients` + `canStartClinicalEncounter`),
  and `showMarkArrived`/`showSendToWaitingRoom` are each additionally gated
  on `!showStartEncounter` instead — the arrival flow stays the primary CTA
  only while starting isn't allowed yet, never after.

## Rooms / Treatments (real)

- `public.rooms`/`public.treatments` — tenant-scoped catalogs, add/rename, no
  physical delete (`active = false`). Back Agenda's "Consultorio"/"Tratamiento"
  pickers. Managed from `/clinica` (Consultorios) and `/configuracion`
  (Tratamientos).

## Availability / Absences (real)

`public.professional_availability` / `public.professional_absences`, per
professional, enforced by the `validate_appointment_availability` trigger on
every `appointments` INSERT/UPDATE (not just an app-level pre-check). Exact
semantics — regression-prone, do not simplify:

- **Zero availability rows for a professional** → legacy-unrestricted: every day/
  time is bookable (the original, pre-availability-feature behavior, preserved
  so a professional who never configures a schedule isn't suddenly blocked).
- **At least one ACTIVE availability row** → a Cita must fall entirely within
  one of that professional's active blocks for that day of the week; anything
  outside is rejected.
- **Rows exist but every one is `active = false`** → the professional has
  deliberately configured, then fully deactivated, her own schedule — reads as
  "no availability at all" (distinct from "never configured"), and every new
  Cita is rejected.
- **Absences** are real and independent of the three states above: any active
  absence covering the Cita's date range rejects it, regardless of availability
  configuration.
- MVP absence model is **date-only/all-day** — no partial-day absences.
- Creating an absence never auto-cancels appointments that already exist inside
  its date range — it only blocks NEW/rescheduled Citas from landing there.
  Resolving a pre-existing conflict is a manual staff action, not automatic.
- **Display side now matches the write side exactly** — see "Agenda —
  disponibilidad real" under Agenda above: the board's grid and every time
  picker derive their bookable slots from these same real rows
  (`agenda-hours.ts`), never a hardcoded default, with gaps between blocks
  preserved and no rounding.

## Reportes (real)

- `/reportes` — real, `appointments` + finalized `patient_clinical_encounters` +
  `patient_clinical_encounter_procedures`. Period filter and professional filter
  (Clinic Admin sees the whole clinic; Dentist is scoped to their own activity).
  "Sin atención +6 meses" here uses the exact same semantics as Pacientes' own
  KPI (see above) — never counts a patient who was never attended at all.
  Patients are never permanently owned by a Dentist — any real Dentist's own
  activity is what's scoped, never a patient-assignment relationship that
  doesn't exist in the schema.

## Patient Portal — identidad y acceso (real)

- `resolvePatientContext()` (`auth.uid()` → `patient_user_links` →
  `patient_id`/`clinic_id`) is the single source of truth for the Portal, exactly
  mirroring `resolveClinicContext()`'s role for staff — never a URL/query/client
  prop.
- Staff-side issuance (`create_patient_access_invitation`) + patient-side
  acceptance (`accept_patient_access_invitation`, `/portal/invitacion/[token]`,
  real signup/login) together form one complete, real loop — see Pacientes'
  "Acceso del paciente" above for the issuance half.

## Patient Portal — Solicitud de Cita (real)

The Patient-initiated request lifecycle from CLAUDE.md's Appointment Lifecycle —
`Pendiente → Aceptada / Rechazada` — is real end to end, and stays a **separate
entity from `Cita`**: creating a request creates no appointment, reserves no slot,
never touches the Agenda board. Only the clinic accepting one creates a real
`appointments` row.

- **Model** — `public.appointment_requests` (`clinic_id`, `patient_id`,
  `professional_profile_id`, `preferred_starts_at`, `status`,
  `accepted_appointment_id`). Composite FKs make tenant consistency structural, a
  CHECK keeps `status = 'accepted'` and `accepted_appointment_id` from ever
  disagreeing, and a partial unique index caps the patient at one pending request
  at a time.
- **Portal (`/portal/citas`)** — `RequestAppointmentScheduler`, writing through
  `request_my_appointment()`. Says "Solicitar cita", never "Agendar cita" (a
  Patient can never schedule herself), and shows no fake availability — every
  non-past slot is offered as a stated preference, never invented occupancy data.
- **Agenda (staff)** — `RealAppointmentRequestsCard`, a pending-work-queue card.
  Its modal shows the patient's own preference read-only, next to the real Cita
  being created with the same fields as "Nueva cita"; `preferred_starts_at` is
  never overwritten.
- **Accepting is atomic** — `accept_appointment_request()` (`SECURITY DEFINER`,
  one transaction): locks the request `FOR UPDATE`, rejects anything not still
  `pending`, INSERTs the Cita at `scheduled` (CLAUDE.md's "Programada" — the
  Patient still confirms attendance afterwards), then links and flips the
  request. Any failure rolls the whole call back and leaves the request
  `pending`, no orphaned Cita. `reject_appointment_request()` never creates a
  Cita.
- **Roles** — read/write scope both come from `can_access_appointment()`, the
  same helper governing the resulting Cita. The Patient may only ever SELECT her
  own requests and INSERT through the RPC.

## Patient Portal — Mi Historia Clínica (real, read-only)

`/portal/historia` is a real, read-only view of the SAME expediente Historia
Clínica (staff) already reads and writes — not a second, parallel
implementation.

- **Reuse, not a rebuild** — a new Portal-specific outer shell (own header, no
  "Volver a Pacientes"/"Descargar PDF"), but every tab body is the exact same
  real component staff uses (`ResumenTab`, `AntecedentesTab`, `OdontogramaTab`,
  `AtencionesTab`, `DocumentosTab`, `ClinicalAlerts`), same fetchers, called
  unchanged.
- **Read-only by construction, not by hiding buttons** — every tab is passed
  `canEdit`/`canEditClinicalData`/`canUpload = false`, the same shape Assistant
  already gets; every write RPC independently requires
  `is_active_clinical_professional()`, which a Patient can never pass.
- **RLS** — one additive, permissive SELECT policy per table
  (`_select_own_via_patient_link`, via `patient_user_links`) on
  `patient_medical_histories`, `patient_tooth_findings`,
  `patient_clinical_documents`, `patient_clinical_notes`,
  `patient_treatment_plan_items`, plus a patient-scoped SELECT policy on
  `storage.objects` for the `clinical-documents` bucket (isolated to her own
  `<clinic_id>/<patient_id>/…` folder). No table gained any INSERT/UPDATE/DELETE
  grant. Existing staff policies untouched.
- **Finalized-only, enforced in Postgres, not just the UI** —
  `patient_clinical_encounters`' patient policy bakes `finalized_at is not null`
  directly into its `USING` clause — a draft/in_progress encounter can never be
  SELECTed by a Patient at the database layer.
- **Author names** — `get_my_clinical_record_authors()` (same narrow shape as
  `get_my_appointment_professionals`), since `clinic_memberships`/
  `professional_profiles`/`profiles` stay staff-only for SELECT.
  `resolve-updated-by.ts` falls back to it only when the staff-only
  `fetchTeamMembers()` comes back empty. **Fixed during the pre-release QA
  Master:** `ClinicalNotesModal` had its own duplicated, `fetchTeamMembers()`-
  only author lookup instead of going through that shared fallback — a
  note's author showed "Sin asignar" for a real Patient session even when a
  real author existed. Now calls `resolveUpdatedByProfessional()` like every
  other tab.
- **Deliberately excluded, not degraded**: no editing, no request-a-change flow,
  no e-signature, no PDF download, no new confidentiality tier invented for
  "Notas clínicas importantes" (that table has no internal/staff-only
  classification in its schema, so it stays visible exactly as staff sees it).

## Patient Portal — Mi clínica, Mi perfil (real)

- **Mi perfil** (`/portal/perfil`) — real, read-only: `patients.first_name/
  last_name/phone/email/document_id/birth_date` and the linked clinic's name, all
  from `resolvePatientContext()`.
- **Mi clínica** (`/portal/clinica`) — real nombre/teléfono (`context.clinic`) and
  real dirección (`fetchPrimaryLocation()`, the exact same fetcher Clínica staff
  uses — composed from `address`/`city`/`state`, never a demo string). Needed its
  own additive RLS policy, `clinic_locations_select_own_via_patient_link` (same
  `patient_user_links` pattern as every other Portal policy) — `clinic_locations`
  was staff-only before. WhatsApp button only renders when a real phone exists;
  never a hardcoded/demo number. Missing address/phone renders "No registrado",
  never invented data.

## Navegación y feedback global (real, cross-cutting)

- **Toast/success feedback** — `src/components/toast.tsx`
  (`ToastProvider`/`useToast()`), the one shared primitive for ephemeral
  success/error confirmations, mounted once in the root layout.
- **Navigation pending feedback** — real Sidebar/BottomTabBar/Portal-nav
  `<Link>`s show an immediate, per-item pending indicator
  (`src/components/shell/nav-link-status.tsx`); plain (non-`<Link>`)
  programmatic-navigation buttons get a local pending `useState` + disabled CTA
  instead.
- **Real identity in shell chrome** — `useShellIdentity()`
  (`src/components/shell/use-shell-identity.ts`) is the one real-overlay hook
  every user-facing name/avatar must read from (Header, `PatientsGreeting`,
  `Greeting`) — never the raw mock `useAuthenticatedIdentity()` alone, which the
  real role-bridge never feeds a real name/avatar into.

## RIPS (Colombian regulatory reporting)

Regulatory basis: **Documento Técnico 1, "Especificaciones técnicas de los
campos de datos y las reglas de validación del RIPS como soporte de la FEV en
salud", Versión 003 (15 de julio de 2026)**, Resolución 948 de 2026. Scope for
this phase: **RIPS sin Factura Electrónica de Venta** only — no FEV/XML DIAN,
no MUV submission, no CUV, no batches/periods beyond a single calendar month.
Migrations `20260910090000` through `20260911090000` were confirmed
`local` = `remote` during Real E2E Stabilization (see above). Migrations
`20260912090000` through `20260912140000` (default treatments seed,
finalized-encounter RIPS-gap correction, the clinical concept catalog, and
Especialidad → Servicio RIPS — see "RIPS #7"/"RIPS #8" below) are committed
in this codebase; their live-application status has not been independently
re-verified in this update.

- **Catalogs (real, imported from official SISPRO tables)** —
  `public.cups_catalog` (13,632 rows), `public.diagnosis_catalog` (12,634
  CIE-10 rows), `public.rips_reference_values` (16 catalogs, 1,656 rows —
  TipoDocumento, RIPSTipoUsuarioVersion2, Pais, Municipio, ZonaVersion2,
  LstSiNo, RIPSViaIngresoIPS, ModalidadAtencion, GrupoServicios, Servicios,
  RIPSFinalidadConsultaVersion2, RIPSCausaExternaVersion2, conceptoRecaudo,
  RIPSTipoDiagnosticoPrincipalVersion2, etc.). Import tooling lives in
  `scripts/rips-import/` (one script per catalog, idempotent, service-role
  only). `CUPSGrServicios` (~1.44M rows) is deliberately NOT imported — see
  its own gap note below.
- **Regulatory identity (real)** — `clinics.tax_id` (T01
  numDocumentoIdObligado), `clinic_locations.cod_prestador` (C01/P01, per
  sede — REPS habilitación code), `professional_profiles.document_type`/
  `document_number` (C15/C16, P11/P12 — who actually performed the
  consulta/procedimiento), and 8 columns on `patients` (document_type/
  number, sex_code, user_type_code, country_of_residence_code,
  municipality_of_residence_code, residence_zone_code, country_of_origin_code
  — U01-U11). All nullable/backward-compatible; `src/features/rips/
  completeness.ts` reports exactly what's missing per clinic/sede/
  professional/patient, never blocking the rest of the app. Server-side
  search-as-you-type (`src/features/rips/catalog-data.ts`,
  `code-search-autocomplete.tsx`, `reference-value-autocomplete.tsx`) is the
  only way a large catalog (Municipio, CUPS, CIE-10) ever reaches the
  browser — never the full table.
- **Structured clinical data per atención (real)** —
  `public.encounter_diagnoses` (CIE-10, `role` principal/related, optionally
  scoped to one specific `encounter_services` row when two services in the
  same atención need independently different principal diagnoses) and
  `public.encounter_services` (CUPS, `rips_service_type` — consultation/
  procedure/unknown, snapshotted from `cups_catalog` at save time, never
  re-derived later), plus `patient_clinical_encounters.incapacity_code`
  (U09, a fact of the atención, never the patient). `upsert_patient_clinical_encounter`
  (the only write path) validates every code against its real catalog inline
  and enforces type-exclusivity (e.g. `via_ingreso_code` only for a
  procedure, `causa_motivo_code` only for a consultation) via real CHECK
  constraints, not just app code. Integrated directly into the real
  Iniciar/Continuar atención screen (`RealClinicalEncounterScreen`) —
  Diagnósticos (principal + relacionados), Servicios realizados (CUPS
  search, human-labeled consultation/procedure badge, per-type fields), and
  an Incapacidad toggle — never a separate technical "RIPS form". Read-side:
  Historia Clínica's Atenciones tab (staff and Patient Portal, same shared
  component) and the clinical record PDF both show the persisted
  diagnósticos/servicios for a finalized atención, resolved to human
  descriptions against the catalog version in effect on that date.
- **Readiness + JSON export (real)** — `/rips` (Clinic Admin only, gated in
  `proxy.ts`/`AppShell`/every server action independently). Architecture,
  entirely under `src/features/rips/`:
  - `export-readiness.ts` — pure, two levels: `getEncounterRipsReadiness`
    (does this one atención have everything needed) and
    `getRipsExportReadiness` (does the whole period — clinic, sede,
    patients, atenciones). Returns structured errors (`code`, `scope`,
    human `message`, `fixHref` to a real route or `null` when no fix screen
    exists yet), never bare strings.
  - `export-generator.ts` — pure mapping (model → RIPS DTO) + serialization.
    `resolveDiagnosesForService()` is the single shared rule (used by both
    readiness and the generator) for which diagnosis applies to which
    servicio: a service-scoped principal wins over the encounter-wide one;
    related diagnoses are the deduplicated union of both, truncated to the
    JSON's own fixed slots (3 for consulta, 1 for procedimiento — DT1 v003
    defines different limits for each). `usuarios[]` groups by
    `(patientId, incapacityCode)`, not by patient alone — confirmed against
    DT1 v003's own worked example, which shows the same person split across
    two usuario entries when a user-level field differs between their
    atenciones.
  - `export-schema.ts` — runtime structural validator (hand-rolled, no Zod —
    not present in this project) run AFTER mapping and BEFORE
    serialization/download; catches a malformed DTO that `tsc` alone never
    could at runtime. Deliberately NOT a reimplementation of the MUV's
    100+ regulatory rules — structural only (required/type/nullability/
    length/format), documented as a permanent boundary.
  - `export-data.ts` — the only file that touches Supabase; loads by
    conjuntos (never N+1).
  - `export-actions.ts` — the pipeline is literally `load → readiness → map
    → runtime schema validation → serialize → download`; re-checks
    readiness immediately before generating (never trusts an earlier
    summary call), and never logs the generated transaction itself (PII).
  - `public.rips_export_log` + `log_rips_export()` (`SECURITY DEFINER`,
    inline `clinic_admin` check, `clinic_id` always resolved from the
    caller's own membership — never a client-supplied value) — a minimal,
    non-blocking audit trail (who generated which period, when, how many
    patients/consultas/procedimientos) — deliberately NOT a "batch" entity:
    no status/CUV/submitted column exists anywhere yet.
  - Filename: `RIPS_Sin_Factura_YYYY-MM.json`. No JSON preview by default,
    no manual JSON editor.
- **Full field-by-field mapping**: `docs/rips-json-mapping.md` — every JSON
  field, its Odentia source, the rule, and the exact DT1 v003 citation.
- **Tests** — RIPS-specific tests (readiness, generator golden fixture +
  determinism, runtime schema validation, content-hash determinism, period
  selector, generate-state, clinical concept resolution, frequent-diagnosis
  ranking — see "RIPS #7"/"RIPS #8"/"RIPS #9" below), part of the full
  suite (**402/408 passing project-wide as of 2026-09-14**, 6 skipped
  integration tests needing real credentials; `tsc --noEmit` and ESLint
  both clean).
- **Known gaps (real, documented, not silently hidden)**:
  - A clinic with more than one `clinic_location` cannot export — see
    CLAUDE.md's own RIPS section.
  - A missing professional document identity has no admin-facing fix route
    (it's strictly self-service via `update_my_professional_profile`) —
    `fixHref: null`, message-only.
  - `CUPSGrServicios` cross-validation (grupo/servicio/CUPS combination)
    deferred — Odentia validates each field against its own catalog but not
    the specific official combination; readiness language is deliberately
    scoped ("datos válidos contra los catálogos que Odentia tiene", never
    "pasará el MUV sin objeciones").
  - No real pilot JSON fixture was available to contrast shape against —
    everything was derived directly from DT1 v003's own text.
  - No E2E browser smoke with real login credentials (same environment
    limitation as the rest of this project's QA — see dev-qa fixtures
    instead: `/dev-qa/clinical-encounter-preview`, `/dev-qa/rips-preview`).
- **RIPS #6A — SISPRO/MUV auth audit: PASS WITH ISSUES, no integration
  built.** Both official mechanisms (Cliente-Servidor desktop app, and the
  "API-Docker" REST solution) require running Ministry-provided software
  that talks to `localhost` — the API's own manual (v4.3) documents every
  endpoint as `https://localhost:9443/...` ("puerto asignado por el
  servidor dockerizado"), including production (`DockerProd`). Odentia
  runs on Vercel + Supabase, with no persistent host to run that Docker +
  SQL Server component. Standing one up is a separate infra/cost/ops
  decision (plus PTS registration with SISPRO) — deliberately not done
  here. No SISPRO credential of any kind is requested or stored anywhere
  in this codebase.
- **RIPS #5B — pilot-validation traceability (real).** Since automatic
  submission isn't possible yet, the productive flow stays fully manual:
  generate → download → the odontóloga uploads the file herself through
  her own official process → she reports back what the MUV said. Added on
  top of RIPS #5's existing `rips_export_log`:
  - `content_hash` — SHA-256 (hex) of the EXACT UTF-8 string returned for
    download, computed in `export-hash.ts`, enforced at the DB layer
    (`^[0-9a-f]{64}$`) — lets a later manual result be tied unambiguously
    to the file that was actually uploaded, without storing the file
    itself a second time. Regenerating the same period always inserts a
    new `rips_export_log` row (never overwrites) — identical inputs
    produce an identical hash, changed inputs never do.
  - `result_status` (`generated` → `accepted`/`rejected`, never the
    reverse and never re-editable) + `muv_proceso_id`/`muv_cuv`/
    `muv_radicacion_at`/`muv_result_notes`, written ONLY through
    `record_rips_export_result()` (`SECURITY DEFINER`, `clinic_admin`-only,
    one-shot — a second call against an already-resolved export is
    rejected). `accepted` requires a CUV, `rejected` requires a summary,
    both enforced at the DB layer too (`check` constraints), not just in
    the RPC.
  - `/rips` gained a "Historial de archivos" list (status badges: Archivo
    generado / Aceptado por MUV / Rechazado por MUV — this exact
    terminology is deliberate, see CLAUDE.md-adjacent task notes: Odentia's
    own internal validation passing is never presented as a MUV outcome)
    and a small post-generation note reminding that the definitive
    validation is the Ministry's, not Odentia's.
  - `rips_export_log`'s SELECT policy was tightened from "any clinic
    member" (RIPS #5) to `clinic_admin`-only, reusing the foundation
    schema's own `has_clinic_role()` helper — unlike
    `encounter_diagnoses`/`encounter_services`, staff never need to read
    this table.
  - Full procedure for the actual pilot run (not yet executed): `docs/
    rips-pilot-validation.md`.
  - **Concurrency fix (2026-09-11):** `record_rips_export_result()` locks
    the target row with `SELECT ... FOR UPDATE` before checking
    `result_status`, closing a real check-then-act race — two concurrent
    calls against the same export could otherwise both read `generated`
    and both attempt to resolve it. The losing call now blocks until the
    winner commits, then correctly sees the already-resolved row and is
    rejected (`55000`).
  - **Remote smoke test (2026-09-11):** confirmed live that `service_role`
    and `anon` both get `permission denied` (no `GRANT`) on
    `rips_export_log` and on every other clinical table probed
    (`clinics`, `patients`, `clinic_memberships`, `profiles`) — real,
    verified defense-in-depth (not even a leaked service-role key could
    read this data directly), but it also means **no QA script in this
    dev environment can read/write real clinic data** — only a genuine
    `authenticated` session can. `RIPS Piloto #1` (a preflight to check
    whether the pilot clinic could generate a real August 2026 RIPS) was
    blocked by exactly this for the same reason — real credentials for a
    `clinic_admin` session are required to run it, not available to an
    automated script in this repo.
- **RIPS #6C — dedicated "Configuración RIPS" block in `/clinica`
  (real).** `codPrestador` used to be buried at the end of "Ubicación de
  la sede principal" inside "Información general" — functionally correct
  but hard to find for a setting that blocks RIPS generation. Now a
  separate card (`src/features/clinic/rips-config-section.tsx`, anchored
  `id="rips"`) shows a live ready/incomplete banner computed by
  `getRipsClinicConfigStatus()` — a thin wrapper reusing the exact same
  `getRipsExportReadiness()` `/rips` itself calls (patients/encounters
  always empty — this block is scoped to clinic/location structure only,
  never patient/atención concerns), so it can never say "lista" while
  `/rips` still shows a blocker. NIT stays editable only in "Información
  general" (shown here read-only, driven by the same lifted state) —
  `codPrestador` is now edited only in this new block.
  `/rips`'s own `fixHref` for `CLINIC_TAX_ID_MISSING`/`LOCATION_MISSING`/
  `LOCATION_COD_PRESTADOR_MISSING` now points at `/clinica#rips` (a
  `scroll-mt-24` CSS anchor, no JS scroll handling) instead of a bare
  `/clinica`. Readiness copy was also cleaned up to remove internal DT1
  jargon from user-facing text — `"codPrestador"`/`"numDocumentoIdObligado"`
  no longer appear in messages, and a sede literally named "Sede
  principal" no longer renders as "Sede Sede principal". Covered by
  `rips-config-status.test.ts` and new cases in `export-readiness.test.ts`.
- **RIPS UX — período selector + "Listo para generar" accuracy
  (2026-09-11).** Chrome's native `<input type="month">` rendered its
  calendar chrome in the browser's own language (English), inconsistent
  with the rest of Odentia — replaced with two `<select>`s (Mes in
  Spanish, Año from a dynamic `[año+1 … año-3]` window), both still only
  ever producing the same `"YYYY-MM"` string the existing period-change
  handler expected — no change to the pipeline itself. Separately, fixed
  a real UI inconsistency: a period with 0 blockers but 0 atenciones
  showed "Listo para generar" while the button stayed correctly disabled
  (it already required `encounterCount > 0`). `getRipsGenerateState()` is
  now the one function both the banner and the button read
  (`"blockers" | "empty-period" | "ready"`) — "empty-period" shows
  "Configuración RIPS completa" + "No hay atenciones para generar RIPS en
  este período.", never an invented blocker. Covered by
  `rips-screen-period.test.ts`/`rips-screen-generate-state.test.ts`.
- **RIPS #6D — corrección de gaps en una atención finalizada (real).**
  Historia Clínica stays immutable once an atención is finalized — except
  for exactly two RIPS gaps `getEncounterRipsReadiness` can flag
  (`incapacity_code`, and a consultation service's `service_value`), which
  can now be corrected without reopening the full clinical encounter
  screen: `/rips/atencion/[encounterId]`
  (`encounter-rips-correction-screen.tsx`) → `correctFinalizedEncounterRipsGapsAction`
  → `correct_finalized_encounter_rips_gaps` (`SECURITY DEFINER`,
  migrations `20260912100000`/`20260912110000`). Deliberately narrow: the
  RPC can only fill a currently-NULL value, structurally rejects
  overwriting an already-set one, and is gated the same way every other
  `/rips` action is (`requireClinicAdminContext`, `clinic_admin`-only —
  not `is_active_clinical_professional()`, see the RPC's own comment on
  why that would be the wrong gate here). `export-readiness.ts`'s own
  `ENCOUNTER_INCAPACITY_MISSING`/`SERVICE_VALUE_MISSING` `fixHref`s point
  here. **Loose end:** `encounter-correction-actions.ts` still has a
  TEMPORARY server-side diagnostic `console.error` (code/message/details/
  hint only, no PII) left in place pending root-cause confirmation of an
  earlier "No pudimos guardar la corrección" report — remove once
  confirmed fixed.
- **RIPS #7 — catálogo clínico natural v0 (real, Fase A1).** The clinical
  vocabulary layer under RIPS #8's own "¿Qué realizaste?" flow:
  `clinical_concepts` (8 rows), `clinical_concept_variants` (10 rows), and
  `clinical_cups_mappings` (17 rows — concept [+ variant] [+ specialty] →
  a real `cups_catalog` row, never a bare code) — migration
  `20260912120000`, global catalog, read-only from the app (deny-by-default
  RLS, same pattern as `cups_catalog`/`diagnosis_catalog`). Deliberately
  scope-limited: Extracción dental and Tratamiento de conductos have no
  confirmed mapping (their real variants depend on clinical facts not yet
  modeled — dentición/técnica/número de raíces — a later phase); Cirugía
  oral y maxilofacial, Implantología, and Estética dental have no confirmed
  Servicio RIPS default either (see RIPS #8) — none of these are silently
  invented.
- **RIPS #8 — Especialidad → Servicio RIPS + consumo real en
  `encounter_services` (real, Fase A2/A3).** Two closely-related pieces,
  shipped together:
  - **A2 — Especialidad → Servicio RIPS**, two tables never conflated (see
    CLAUDE.md's own RIPS section for the permanent rule):
    `specialty_rips_service_defaults` (global suggestion, seeded with the
    6 confirmed mappings — Odontología general→334, Endodoncia→311,
    Ortodoncia→338, Periodoncia→343, Rehabilitación oral→347,
    Odontopediatría→396 — migration `20260912130000`) and
    `clinic_specialty_rips_services` (per-clinic CONFIRMED configuration,
    same migration, currently select-only — no UI to write it yet; that's
    a later phase). A generic mapping is never accepted as valid when a
    specialty-specific one exists for that same combination.
  - **A3 — "¿Qué realizaste?"** replaces most manual CUPS entry in
    "Finalizar atención" (`RealClinicalEncounterScreen`) with a natural
    concept/variant picker, filtered to only what RIPS #7 already confirms
    (never offering Extracción/Conducto, never offering "Consulta por
    especialidad" when the resolved CUPS would exactly duplicate a
    dedicated Ortodoncia concept). Resolution is pure/testable
    (`src/features/rips/clinical-service-resolution.ts`) and mirrored
    structurally server-side inside `upsert_patient_clinical_encounter`
    (migration `20260912140000`): the submitted CUPS must match exactly
    what `clinical_cups_mappings` would resolve for that
    concept/variant/specialty (specific-over-generic, respecting
    `valid_from`/`valid_to`), and the submitted concept/variant name
    snapshot must match the catalog's own current name at insert time —
    never trusting the client alone for either. `encounter_services`
    gained 5 new nullable columns (`clinical_concept_id`,
    `clinical_concept_variant_id`, two name snapshots, `mapping_status`) —
    every historical row (`clinical_concept_id IS NULL`) stays valid
    unmodified, no backfill. Manual CUPS search remains available as a
    secondary path for anything RIPS #7 doesn't cover yet (e.g. Extracción,
    Conducto). A concept resolved to a CUPS but still missing the clinic's
    own confirmed Servicio RIPS (A2) never blocks "Finalizar atención" —
    clinical truth and RIPS export completeness are deliberately separate;
    it only shows as a new, distinct readiness blocker
    (`RIPS_SERVICE_CONFIGURATION_MISSING`, separate from
    `CLINICAL_SERVICE_MAPPING_UNRESOLVED`) when generating the export.
- **RIPS #9 — A3 smoke (real, 2026-09-14) + UX fixes found during it.**
  Synthetic smoke: clinic Muelitas7, patient Alex Paciente, atención
  14/09/2026, two `encounter_services` via "¿Qué realizaste?" — Consulta de
  ortodoncia (CUPS `890222`, tipo Consulta, `service_value` 50000) and
  Limpieza dental → Profilaxis/pulido (CUPS `997001`, tipo Procedimiento,
  `service_value` auto-`0`, RIPS sin factura rule) — plus principal
  diagnosis CIE-10 `K020` (`diagnosis_type_code` = "Confirmado nuevo", no
  relacionados), incapacidad `No`, no próxima cita, no legacy
  `patient_clinical_encounter_procedures` row. "Finalizar atención"
  correctly persisted `patient_clinical_encounters.finalized_at` and
  flipped `appointments.status` to `completed`. `/rips` then correctly
  found the atención and its services, with exactly the expected pending
  per service — "la clínica todavía no ha confirmado el Servicio RIPS para
  la especialidad de este servicio" (`RIPS_SERVICE_CONFIGURATION_MISSING`).
  **This is the intended architecture working correctly, not a bug**:
  odontólogo finalizes → RIPS consumes the real services → generation
  stays blocked on missing institutional config → that config is exactly
  A4's own scope (below).

  Three UX gaps surfaced during this smoke and were fixed/re-validated the
  same day, all in `src/features/dashboard/real-clinical-encounter-screen.tsx`
  unless noted:
  - **Profesional del servicio** — see CLAUDE.md's own new permanent rule:
    each `encounter_service` inherits `professional_profile_id` from the
    Cita automatically; the per-service manual `<select>` (which used to
    appear whenever a clinic had more than one active professional) is
    gone. The column stays on the model; the UI shows it read-only. No
    co-atención support.
  - **"Servicios realizados" layout** — responsive two-column at `md+`
    (`¿Qué realizaste?` left ≈40%, "Registrados en esta atención" right
    ≈60%, single column below `md`), plus a teal/primary visual state for
    an expanded concept in the accordion (vs. the neutral closed style).
  - **CIE-10 diagnosis discoverability** — Diagnóstico principal/
    relacionado's search-as-you-type used to show nothing until 2+
    characters were typed, with no way to discover a code without already
    knowing it. Focusing an empty field now also offers "Usados en esta
    clínica": the clinic's own real, tenant-scoped usage history from
    `encounter_diagnoses` (never a hardcoded clinical list, never
    inference) — frequency desc, most-recent-use as the tiebreaker over a
    bounded 500-row recent window, capped at 10, enriched against the
    active `diagnosis_catalog`. No history → an honest hint to search by
    code/description, never invented codes. Typed search is unchanged
    (still the full active CIE-10 catalog, 2+ chars). CUPS's own
    autocomplete is untouched. New files: `src/features/rips/
    frequent-diagnoses-data.ts` (+ `.test.ts`, 5/5 passing — pure ranking
    logic only, no Supabase mocking); extended `code-search-autocomplete.tsx`
    (new opt-in `initialSuggestions` prop, CUPS never passes it),
    `catalog-data.ts` (`findDiagnosesByCodes`), `actions.ts`
    (`fetchFrequentDiagnosesAction`).
- **Detalles RIPS — UX decision deferred to post-A4 (documented, not yet
  acted on).** A read-only investigation of every field currently exposed
  in a service's "Detalles RIPS" dropdown classified each one against its
  real source/readiness/JSON path (see the investigation's own report for
  full per-field traceability):
  - **Debería venir de configuración institucional, no del odontólogo por
    servicio** — Grupo de servicios / Servicio (`grupo_servicios_code`/
    `cod_servicio_code`): this IS `clinic_specialty_rips_services` (A2),
    already resolved automatically when available; the manual dropdown
    here just lets someone override it per service today.
  - **Económicamente derivable** — Valor pago moderador: the JSON
    generator already resolves it to `0` when not captured
    (`toMoneyNumber(valorPagoModerador ?? 0)`), distinct from "Valor
    cobrado al paciente" (`service_value`) — never to be conflated with it.
  - **Sin fuente segura todavía, no automatizar/ocultar sin una regla
    explícita** — Causa externa, Vía de ingreso, Modalidad de atención,
    Finalidad, Concepto de recaudo: none of these are required by
    `completeness.ts`/`export-readiness.ts` today, and none has a code
    path that could derive them safely — no default was invented for any
    of them.
  Once A4 ships, revisit whether "Detalles RIPS" becomes a read-only/
  advanced view or shrinks to only the fields with no institutional/
  derivable source. Not implemented in this pass.
- **Legacy `Procedimientos realizados` vs. new `Servicios realizados` —
  known, still-open duplication.** The clinical encounter screen still
  shows both: the free-text, non-CUPS legacy list
  (`patient_clinical_encounter_procedures`) and the real RIPS-backed
  `encounter_services` list ("¿Qué realizaste?"/manual CUPS). The A3 smoke
  deliberately did not add a legacy procedure row and did not attempt to
  resolve this duplication — which one stays, which is deprecated, or how
  they reconcile is still an open decision, not something today's work
  touched.
- **A4 — Especialidad → Servicio RIPS write path (next, not yet built).**
  `specialty_rips_service_defaults` (global suggestion) and
  `clinic_specialty_rips_services` (per-clinic confirmed config, currently
  select-only) both already exist (migration `20260912130000`). Confirmed
  global defaults seeded so far: Odontología general → 334, Endodoncia →
  311, Ortodoncia → 338, Periodoncia → 343, Rehabilitación oral → 347,
  Odontopediatría → 396. No safe default exists yet for Cirugía oral y
  maxilofacial, Implantología, or Estética dental — do not invent one. The
  permanent rule (CLAUDE.md, unchanged): `specialty_rips_service_defaults`
  is only ever Odentia's own suggestion, never effective configuration on
  its own — `clinic_admin` must explicitly confirm it into
  `clinic_specialty_rips_services` before it becomes real. A4's own scope
  is exactly that write/confirmation path; once a specialty is confirmed,
  `RIPS_SERVICE_CONFIGURATION_MISSING` should stop appearing for encounters
  using it.
- **Explicitly not built yet (future phase)**: MUV integration, CUV
  generation/inference, ProcesoId auto-capture, submission states beyond
  a manually-recorded result, retries/polling, FEV/DIAN, glosas, SIIFA.
  Also not built yet: **A4** — any UI for a clinic to actually write to
  `clinic_specialty_rips_services` (A2 is select-only today) — a clinic
  admin cannot yet confirm/override a Servicio RIPS from the app itself.
  This is the current next milestone (see "RIPS #9" above).

---

# Phase 1 legacy — screens still mock

Everything below is unchanged since Phase 1 and still runs entirely on mock data.
This is now a short, deliberately-scoped list, not the bulk of the app.

## `/admin` (Superadmin) — fully mock

Platform KPIs, monthly activity, Marketplace overview, recent-clinics list,
attention list — all mock. See OUT OF SCOPE ACTUAL for why this is safe (no real
auth path reaches it in production).

## Configuración — secondary sections only

Agenda defaults, notification toggles, regional preferences — see PARCIAL / P2
above. Tratamientos/Horario/Ausencias on this same screen are real.

## Mi Suscripción — fully mock

See OUT OF SCOPE ACTUAL.

## `/portal/salud` (Mi salud dental) — fully mock

See OUT OF SCOPE ACTUAL.

## Identity & Profile (mock parts)

Per-role mock profile modals/screens still exist for the DEV role switcher's own
preview (`AdminProfileModal`/`AssistantProfileModal` in `src/features/dashboard/`)
— these back development-only tooling, not any real screen a real user reaches.

## Public pages (real, but not backend-tied)

Landing page, `/planes` — real, deployed static/marketing pages; "real" here means
finished content, not Supabase-backed (no per-tenant data to begin with).

---

# Development Rules (Current Phase)

For any new work (bug fixes, QA-driven fixes, or genuinely new scope):

Claude MUST:

- Use real Supabase data or an honest empty state — never a mock as fallback,
  never invented/hardcoded clinical or tenant data.
- Derive `clinic_id`/role/permissions server-side from `resolveClinicContext()`/
  `resolvePatientContext()` — never from the DEV role switcher, `RoleContext`, a
  URL, or a form field.
- Write through a `SECURITY DEFINER` RPC for anything beyond a plain read, with
  `clinic_id` and the acting user always resolved from `auth.uid()` server-side,
  and ship the matching RLS policy + migration alongside the feature that needs
  it.
- Audit GRANTs explicitly (`grant`/`revoke` in the migration) — never assume a
  policy alone is enough.
- Preserve the already-approved visual design exactly — layout, hierarchy,
  components, spacing, labels, iconography, UX behavior.
- Never touch the `demo` branch, and never remove mocks from it.

Claude MUST NOT:

- Integrate payment providers.
- Build Marketplace APIs (Marketplace stays a fully decoupled, independent
  product — see CLAUDE.md).
- Implement background jobs or automated email/WhatsApp/SMS/push.
- Optimize performance prematurely.
- Redesign an approved screen while fixing a bug or converting data.

---

# Marketplace Status

Marketplace is NOT part of Odentia Core's own implementation — a real,
independently-deployed app, no shared database, no shared business logic, per
Marketplace Independence in CLAUDE.md. **As of 2026-09-15, every real Core
entry point to Marketplace (desktop sidebar, mobile tab bar, `/agenda`'s
Marketplace card) starts the SSO flow at
`https://marketplace.odentia.co/auth/sso/start`, never a direct link into
Marketplace's own UI** — the previous direct link to
`https://odentia-marketplace.vercel.app` is historical only (that Vercel
deployment is still where Marketplace itself runs; it's simply no longer
what Core links to directly). See "SSO Core → Marketplace" below for the
full flow.

---

# SSO Core → Marketplace — Checkpoint (2026-09-15)

**PASS end-to-end in Production.** An authenticated Core user reaches
Marketplace already recognized as a real Core identity — Core stays the sole
authority for registration/authentication/identity/membership/clinic;
Marketplace creates no parallel customer account for these users (it keeps
its own separate, historical admin `User`/session for internal store
management only, untouched by this flow).

## Architecture

1. Core-authenticated user clicks Marketplace (any of the entry points above)
   → `https://marketplace.odentia.co/auth/sso/start`.
2. Marketplace generates its own anti-CSRF `state` and redirects to Core's
   `/marketplace/entrar`.
3. Core resolves the user's real session/clinic context and calls
   `issue_marketplace_sso_code()` (`20260915090000_create_marketplace_sso_codes.sql`)
   to mint an opaque, one-time authorization code.
4. Core redirects back to Marketplace's `/auth/sso/callback` with that code
   and the original `state`.
5. Marketplace exchanges the code server-to-server against Core's
   `POST /api/sso/exchange`, authenticated with a dedicated
   `MARKETPLACE_SSO_SHARED_SECRET` (never the Supabase service role key or
   any other existing credential).
6. Core consumes the code atomically via `consume_marketplace_sso_code()`
   (`20260915100000_create_consume_marketplace_sso_code_rpc.sql`) and returns
   verified identity/clinic context.
7. Marketplace creates its own `odentia_customer_session` cookie from that —
   a session distinct from both Core's own `odentia_session` and
   Marketplace's historical admin session; neither of those is involved.

## Security properties

- The authorization code is opaque, one-time, 120-second TTL; only its hash
  is ever persisted; a replayed/reused code fails closed.
- Identity is always derived server-side from Core's own `auth.uid()` and
  real clinic membership — never accepted as input from Marketplace or the
  browser.
- V1 assumes exactly one active clinic membership per user. Multiple active
  memberships fail the flow closed; there is no clinic selector and none is
  planned for this phase.

## Production configuration (values withheld — configured, not documented here)

`SUPABASE_SERVICE_ROLE_KEY` and `MARKETPLACE_SSO_SHARED_SECRET` are set on
Core in Production; the equivalent Marketplace-side secrets and
`ODENTIA_CORE_URL` are set on Marketplace. See "Configuration issues found
during smoke" below for the one non-obvious piece of this (the canonical,
non-redirected Core domain).

## Configuration issues found during smoke (fixed, not open bugs)

1. Core's exchange initially returned `500` because `SUPABASE_SERVICE_ROLE_KEY`
   was not yet configured in Production — configured, verified fixed.
2. The exchange then returned `401` because Marketplace was calling
   `https://odentia.co/api/sso/exchange`, which Vercel redirects to
   `https://www.odentia.co/...` — a cross-origin redirect that drops the
   `Authorization` header. Fixed on the Marketplace side only, by pointing
   `ODENTIA_CORE_URL` at the canonical, non-redirected
   `https://www.odentia.co` directly. No Core code change was needed.

## Smoke — PASS (2026-09-15)

Manual, real-account verification against Production: authenticated as Alex
Sosa / clínica Muelitas7, hovering Core's Marketplace entry point confirmed
the `https://marketplace.odentia.co/auth/sso/start` destination, clicking it
completed the SSO redirects, and the user landed on
`https://marketplace.odentia.co`. A separate incognito check confirmed
Marketplace set `odentia_customer_session` and that no `odentia_session` was
needed — confirming the customer SSO session and Marketplace's own
administrative session stay genuinely separate.

**Verdict: SSO Core → Marketplace — PASS END-TO-END.**

## Downstream: Marketplace Order Attribution — Checkpoint 1 (2026-09-15)

**PASS end-to-end in Production.** This resolves what this checkpoint
previously listed as "next phase" (Order attribution / Marketplace customer
context) — that phase is done, not merely planned. The implementation lives
entirely in `odentia-marketplace` (functional commit `ca05abf`, migration
`20260915120000_add_order_core_attribution`) — Core gained no new table,
migration, or downstream responsibility of its own for this.

When Marketplace creates an Order under a valid `odentia_customer_session`,
it persists four server-derived reference fields — `coreUserId`, `clinicId`,
`membershipId`, `coreRole` — read from that certified customer session
server-side, never from browser-supplied IDs. These are downstream
references/snapshots in Marketplace only: no FK into Core, no duplication of
Core's own profiles/clinics/memberships, and Marketplace remains a consumer
of Core's identity, never an authority over it.

Marketplace still works as a public store: with no valid customer session,
an Order is created as a **guest** order, with all four fields `NULL`.
Core-attributed and guest orders are both valid, coexisting order types —
Core login is never required to buy. Attribution is written once, at Order
creation; retries/idempotency recovery reuse the winning Order and never
change user/clinic/membership/role or guest↔Core-attributed status.

### Production smoke — PASS (2026-09-15)

Both real paths were verified in Production (no real UUIDs recorded here):

- **Core-attributed**: Core-authenticated user → real Marketplace entry
  point → SSO → `odentia_customer_session` → Marketplace checkout → Order
  persisted with `coreUserId`, `clinicId`, `membershipId` all populated and
  `coreRole = clinic_admin`. **PASS.**
- **Guest**: `odentia_customer_session` removed and confirmed absent in an
  incognito window → direct Marketplace checkout → Order persisted with
  `coreUserId`/`clinicId`/`membershipId`/`coreRole` all `NULL`. **PASS.**

**Verdict: MARKETPLACE ORDER ATTRIBUTION CHECKPOINT 1 — PASS.**

## Downstream: Marketplace Order Attribution — Checkpoint 2 (2026-09-15)

**PRODUCTION PASS.** Resolves what this checkpoint previously listed as the
next downstream phase (Marketplace admin visibility). Implementation lives
entirely in `odentia-marketplace` (functional commit `77946ee`) — Core
required no code, DB, or architecture changes for this.

From an Order's admin detail, Marketplace now distinguishes `Cliente
Odentia` from `Invitado`. For a Core-attributed order, the admin view shows
minimal downstream context: `clinicId` and a `coreRole` snapshot (e.g.
`clinic_admin` shown as "Administrador de clínica"). For a guest order, it
shows `Invitado` with no clinic/role context. Marketplace does not expose
`coreUserId` or `membershipId` in this view, does not look anything up
against Core to resolve names, and does not allow editing attribution — this
is informational only and never an authorization mechanism. Core gained no
new responsibility from this change.

### Production smoke — PASS (2026-09-15)

Both admin states were verified in Production (no Order IDs or real UUIDs
recorded here):

- **Guest Admin Visibility**: "Origen del pedido" section shows the
  `Invitado` badge, correctly explained as a direct Marketplace purchase
  with no Odentia customer session — no clinic, no role, no `coreUserId`, no
  `membershipId`; rest of the admin detail unaffected. **PASS.**
- **Core-attributed Admin Visibility**: "Origen del pedido" section shows
  the `Cliente Odentia` badge, `clinicId`, and the `clinic_admin` snapshot
  shown as "Administrador de clínica" — no `coreUserId`, no `membershipId`,
  no lookup against Core, no attribution editing; rest of the admin detail
  unaffected. **PASS.**

**Verdict: MARKETPLACE ORDER ATTRIBUTION CHECKPOINT 2 — PRODUCTION PASS.**

## Order Attribution — downstream status

- Checkpoint 1 (persistence / server-side attribution): **PASS.**
- Checkpoint 2 (Marketplace admin visibility): **PRODUCTION PASS.**

This closes the downstream base of Order Attribution. It does NOT mean
clinic-name lookup, checkout prefill, commercial benefits, monthly
aggregation, billing, or subscription integration exist — none of those are
implemented; treat them as not present until documented otherwise.

Order attribution downstream base is complete; the next product/commercial
phase will be defined separately.

## Downstream: Shared Cart — Checkpoint A (2026-09-15)

**PRODUCTION PASS.** Core's authenticated header (`AuthenticatedUserMenu`)
shows the real Marketplace cart item count as a badge on the existing cart
icon, instead of no count at all. Implementation lives in
`src/components/shell/marketplace-cart-actions.ts` (a Server Action reading
the incoming request's cookie), `parse-marketplace-cart-count.ts` (the pure,
unit-tested parser), and `use-marketplace-cart-count.ts` (the client hook
bridging into `AuthenticatedUserMenu`) — Core's functional commit is
`fff396b`; Marketplace's is `436285a`.

`odentia_cart` remains entirely owned and written by Marketplace — Core
never sets, mutates, or clears it. In Production this cookie is
domain-shared under `.odentia.co` specifically so it arrives on Core's own
incoming requests; Vercel Preview deployments and local development keep
the cookie host-only (Marketplace-side decision — a `Domain` that doesn't
match the actual response host would make the browser reject the cookie
outright, which is why this isn't gated on `NODE_ENV` alone). Core's parser
treats the cookie as untrusted input from a separate app: invalid JSON,
non-object shapes, and non-numeric/non-positive quantities all degrade to a
partial or zero count rather than breaking the header; valid quantities are
summed, matching Marketplace's own `getCartCount()` semantics exactly (sum
of quantities, not number of lines). The badge is hidden entirely at count
`0`. No new API, fetch to Marketplace, database, or duplicated cart state
was introduced on either side.

### Production smoke — PASS (2026-09-15)

Real cross-domain verification (no real UUIDs/cookie values recorded here):

- Marketplace cart at `1` → Core badge `1` after refresh. **PASS.**
- Marketplace cart updated to `2` → Core badge `2` after refresh. **PASS.**
- Marketplace cart cleared to empty → badge disappeared on both Marketplace
  and Core. **PASS.**

Full checkout was not re-tested as part of this checkpoint — only the
shared-cart read path above.

**Verdict: SHARED CART CHECKPOINT A — PRODUCTION PASS.**

## Downstream: Shared Cart — Checkpoint B (2026-09-15)

**PRODUCTION PASS.** Core's cart icon now navigates to Marketplace's
existing customer SSO with a `return_to=/carrito` query param on that one
link only (`src/components/shell/authenticated-user-menu.tsx`) — after a
successful SSO round trip, the user lands on Marketplace's `/carrito`
instead of `/`. Core's functional commit is `fa61bb4`; Marketplace's is
`78243e1`.

Every other Core → Marketplace entry point (sidebar, tab bar,
`marketplace-card.tsx`) is unchanged and still uses the shared
`MARKETPLACE_URL` constant with no `return_to`, landing on `/` exactly as
before — this checkpoint touched no other navigation. Core does not
interpret, persist, or validate `return_to` in any way: it is a plain query
string on a link the browser follows to Marketplace's own `/auth/sso/start`,
nothing more. None of Core's SSO routes (`/marketplace/entrar`,
`/api/sso/exchange`), the `issue_marketplace_sso_code()`/
`consume_marketplace_sso_code()` RPCs, the anti-CSRF `state` mechanism, or
`redirect_uri` validation were touched — the destination is handled entirely
on the Marketplace side via its own short-lived, HttpOnly, single-use
cookie, revalidated by exact string match only after a fully successful SSO.

### Production smoke — PASS (2026-09-15)

- Core cart icon (empty cart) → SSO → landed on Marketplace's `/carrito`,
  correctly showing an empty-cart state. **PASS.**
- Generic Marketplace navigation from Core (not the cart icon) → SSO →
  landed on Marketplace's `/`, not `/carrito`. **PASS.**
- SSO started with a `return_to` value other than the one allowed
  destination → landed on Marketplace's `/`, neither the invalid value nor
  `/carrito`. **PASS.**

**Verdict: SHARED CART CHECKPOINT B — PRODUCTION PASS.**

**Next focus:** Marketplace header/customer identity consistency with
Core — not yet designed or implemented.

---

# Success Criteria

## Phase 1 (met)

Every major screen existed, navigation was complete, mobile/desktop experience was
polished, mock data felt realistic, the prototype was deployed and demonstrable.

## Phase 2 (met)

Every MVP-scope feature vertical runs on real, tenant-isolated Supabase data with
an honest empty state everywhere real data doesn't exist yet.

## Phase 3 — Real E2E Stabilization (met)

All 7 critical production journeys (A–G) exercised end to end against real
production infrastructure with real, independent accounts; every bug found this
way is fixed and verified live. See "REAL E2E STABILIZATION" above.

## Phase 4 — Functional Freeze / Full Manual QA (current)

Complete when every item in "REMAINING MANUAL QA" above has been exercised with
real, independent accounts (including a second account per role where isolation
matters) and any bugs found are fixed — not when new features are added. See
"Functional Freeze Policy" above for the rules in effect during this phase.

---

# Known Decisions

Already approved:

- Odentia is independent from LopaDent.
- Marketplace is optional.
- LopaDent is the only Marketplace provider.
- Subscription price reference: COP $99.900 / month.
- Subscription may be paid by the dentist or sponsored by LopaDent.
- Marketplace must remain fully decoupled from Core.

These decisions should be treated as fixed unless explicitly changed.

---

# Out of Scope (long-term)

Intentionally postponed, no timeline yet — distinct from "OUT OF SCOPE ACTUAL"
above (which lists near-term MVP-boundary items already reasoned about):

- AI
- Electronic invoicing
- Accounting
- Payroll
- Advanced inventory
- Laboratory integrations
- Multi-location practices
- Analytics
- Automation (background jobs, automated communications)

---

# Next Phase

Full manual QA by role (Clinic Admin → Dentist → Assistant → Patient — see
"Functional Freeze Policy" above) is the actual next phase — not more feature
building. Only after that:

- `/portal/salud` (Mi salud dental) real-data conversion.
- Patient-initiated reprogramación/cancelación proposal lifecycle.
- Configuración's remaining secondary sections (agenda defaults, notifications,
  regional preferences) real-data conversion.
- Mi Suscripción real-data conversion (still contingent on a payment-provider
  decision, out of Claude's own scope to integrate).

---

# Notes for Claude

When implementing any feature ask yourself:

> Does this help validate the product with real users, and does it use real data
> or an honest empty state?

If the answer is "no" to either, postpone it or fix it before shipping.

When fixing a bug found during QA, the approved design is still the source of
visual truth — match it, don't redesign it. When in doubt about whether something
is really implemented, read the code and the migrations — don't trust this
document's prose over what's actually there, and update this document the moment
you find it disagrees with reality.
