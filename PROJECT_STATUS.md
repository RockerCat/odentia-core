# PROJECT_STATUS.md

# Odentia Core

**Last Updated:** 2026-09-10

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
  (constraint + trigger), not just app code.
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
  validated RIPS sin factura JSON export with download. See "RIPS (Colombian
  regulatory reporting)" below for the full detail.

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

## Onboarding (real)

- `/registro` — a real 3-step wizard (Cuenta → Clínica → Rol) that creates a real
  Supabase Auth user, a real `clinics` row (name, slug, sede principal with a real
  Leaflet/Nominatim map picker + geocoding, logo upload to a public Storage
  bucket), and the founding `clinic_admin` membership via a `SECURITY DEFINER`
  bootstrap RPC (`bootstrap_clinic`). Handles "already onboarded" and
  email-confirmation-pending states.

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
All migrations `20260910090000` through `20260910180000` are applied and in
sync (`supabase migration list --linked`).

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
- **Tests** — 76 RIPS-specific tests (readiness, generator golden fixture +
  determinism, runtime schema validation), part of the full suite (272/278
  passing project-wide, 6 skipped integration tests needing real
  credentials).
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
- **Explicitly not built yet (future phase)**: MUV integration, CUV
  generation/inference, ProcesoId auto-capture, submission states beyond
  a manually-recorded result, retries/polling, FEV/DIAN, glosas, SIIFA.

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

Marketplace is NOT part of Odentia Core's own implementation. Clinic-facing links
point to the real, independently-deployed Marketplace app
(`https://odentia-marketplace.vercel.app`) — no shared database, no shared
business logic, per Marketplace Independence in CLAUDE.md.

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
