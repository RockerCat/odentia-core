# PROJECT_STATUS.md

# Odentia Core

**Last Updated:** 2026-09-18

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
See "RIPS #8" below for the full detail.

**Checkpoint 2026-09-17 — A4 + patient contextual correction + A4B, all
PASS (real smoke, both migrations applied to remote).**

**VALIDATED (real evidence):**
- **A4** — `clinic_admin` confirms Especialidad → Servicio RIPS at
  `/clinica#rips`'s "Servicios RIPS por especialidad" section
  (`confirm_clinic_specialty_rips_service()`, migration `20260917100000`,
  **applied to remote**). Real smoke: Endodoncia confirmed as "Consulta
  externa → ENDODONCIA"; a NEW Endodoncia atención automatically inherited
  that configuration, Grupo/Servicio appeared in Detalles RIPS, the
  atención finalized correctly, and `/rips` readiness did NOT flag
  `RIPS_SERVICE_CONFIGURATION_MISSING` for it. Along the way, a real
  PostgREST embed bug was found and fixed in the defaults/effective-config
  readers (`rips_reference_values:rips_reference_value_id(...)` — read as
  "embed a relation literally named `rips_reference_value_id`", not a
  table:column hint — is invalid; the correct form is the bare
  `rips_reference_values(code, parent_code)`, since exactly one FK
  connects the two tables and no hint is needed at all).
- **Patient contextual correction** — a patient-scope pendiente
  (`PATIENT_SEX_MISSING`, etc.) is corrected from a modal inside `/rips`
  itself, grouped by `patient_id`, reusing `updatePatient()` and the
  existing identity catalogs — never navigating to `/pacientes`. Real
  smoke: 5 pendientes → 3 patient fields completed in one modal → 2
  pendientes, without leaving `/rips`. País de residencia's own selector
  now shows Colombia (`170`) first, then the rest alphabetically —
  presentation-only, no autoselection, no code changes.
- **A4B** — `RIPS_SERVICE_CONFIGURATION_MISSING` on an already-finalized
  encounter is corrected from `/rips`, grouped by `encounter_id`
  (`apply_confirmed_specialty_rips_service_to_encounter()`, migration
  `20260917110000`, **applied to remote**), with an append-only audit log
  (`encounter_service_rips_corrections`). Real smoke on the 2026-09-14
  Muelitas7/Alex Paciente encounter (2 servicios, CUPS `890222`/`997001`):
  `Corregir` opened ONE "Completar Servicio RIPS" modal showing patient,
  fecha, profesional (Alex Sosa), especialidad (Endodoncia), both
  services' historical Grupo/Servicio ("Sin configurar"), and the
  confirmed institutional configuration ("Consulta externa → ENDODONCIA");
  clicking "Aplicar configuración confirmada" resolved both services in
  one call. After refresh, same período (septiembre 2026): **0
  pendientes**, "Listo para generar", `Generar RIPS` enabled, metrics
  unchanged (3 atenciones, 2 pacientes, 3 consultas, 1 procedimiento).

**NOT YET VALIDATED / NEXT:**
- Generating a NEW RIPS export after A4/A4B and reviewing the resulting
  JSON — not done in this checkpoint, deliberately deferred to the next
  one (no RIPS was generated during this close-out).
- Recording/validating a MUV result remains, as always, a fully manual
  step (`rips_export_log.result_status`) — nothing here changes that.
- The A4B SQL regression test
  (`supabase/tests/apply_confirmed_specialty_rips_service_to_encounter.test.sql`)
  is still `NOT RUN` locally (no Postgres/Docker in this dev environment)
  — the migration itself applied cleanly to the remote project and the
  real manual smoke above passed, but the SQL test suite has never
  actually executed. Do not treat it as a passing regression suite.

Separately, and unrelated to RIPS:
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

**Checkpoint 2026-09-18 — Clinical/RIPS structured-workflow closeout.**
Consolidates a batch of work landed since the 09-17 A4/A4B checkpoint into
one coherent, QA-gated commit.

**Completed / validated:**
- "Servicios realizados" (`encounter_services`) is now the sole write path
  for what happened in an atención; the legacy "Procedimientos realizados"
  UI (add/edit/remove) is removed, its historical data preserved read-only.
  Modalidad auto-resolved, Causa/Motivo defaulted for new consultations,
  Finalidad required at finalize-time only (export readiness stays
  unaffected — historical encounters are never retroactively blocked).
- Patient Portal (`/portal/historia`) reads her own finalized structured
  services/diagnoses via new additive RLS (see below).
- Reportes' "Tratamientos más realizados" is structured-first with no
  double-counting against the legacy fallback.
- New-patient creation collects RIPS identity (Sexo, Tipo de usuario, País,
  Municipio/Zona) up front, reducing future `/rips` contextual corrections.
- Agenda visual polish: available vs. unavailable slot contrast, a
  completed-appointment corner badge.
- Fixed a real cross-host logout bug: logout from localhost/preview was
  silently redirecting to real production via hardcoded URLs; now
  host-aware (`isCoreProductionHostname()`), federates to Marketplace only
  on real production, else a local relative `/login`.
- Full QA: `tsc --noEmit` clean, ESLint clean on all 22 modified/new
  files, Vitest 382/382 passing across dashboard/patients/reports/rips/
  session, `git diff --check` clean, `next build` succeeded (40 routes).

**Applied migrations (confirmed synced, `supabase migration list --linked`,
local == remote):**
- `20260917100000_create_confirm_clinic_specialty_rips_service_rpc.sql`
- `20260917110000_create_apply_confirmed_specialty_rips_service_rpc.sql`
- `20260918100000_patient_select_own_encounter_services_diagnoses.sql`

**RIPS current state:** Odentia internal RIPS pipeline validated; first
official MUV/SISPRO validation remains the next external milestone.

**Próximo hito (next validation flow, not a pending implementation task):**
a real pilot run — SUPERADMIN crea una clínica real → se asigna un
Admin-Odontólogo → configura identidad/especialidad RIPS → se registra un
paciente real → cita → atención → finalizar → `/rips` → generar JSON →
subir a MUV/SISPRO — is the next end-to-end validation, distinct from and
beyond this checkpoint's own scope.

**Known issue (non-blocking):** an intermittent localhost login freeze was
observed during QA in an earlier session; not consistently reproducible;
root cause unconfirmed; no speculative fix retained. All diagnostic
instrumentation added while investigating it was fully reverted
(`src/app/login/page.tsx` carries zero diff from its pre-investigation
state).

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
- **Platform / Superadmin** — real `platform_roles`-backed identity, a real
  protected `/platform` shell, real Clínicas listing/detail (canonical
  `slug` URLs), Superadmin-direct clinic creation (`provision_clinic()`),
  and Superadmin-provisioned first-Clinic-Admin invitation + password-only
  activation with no Confirm Signup email and automatic acceptance for a
  new user. See "Platform / Superadmin" below for full detail.
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
- **Checkpoint 2026-09-16 — self-service clinic creation is being retired.**
  Odentia Core is moving to a commercial/provisioning model where only
  SUPERADMIN can create a clinic (see the read-only audit that scoped this
  change). Checkpoint 1A closed the backend authorization gap first, in
  isolation: `bootstrap_clinic()` now requires `is_platform_superadmin()`
  internally (migration `20260916090000`) — a plain `GRANT ... TO
  authenticated` was never sufficient authorization on its own, and the RPC
  turned out to exist as two live overloaded functions (the original
  20-argument signature and a 22-argument one with `location_latitude`/
  `location_longitude`, the one the real onboarding client actually calls),
  both now gated identically. **This is a deliberate intermediate state:**
  `/registro`'s wizard still renders and still calls `bootstrap_clinic()`
  for a normal user, but that call now fails with an authorization error
  for anyone who isn't a real platform superadmin — self-service clinic
  creation no longer works end to end, on purpose, ahead of a later
  checkpoint that repoints the UI entirely (landing CTAs, `/registro`
  itself) to the new prospecto/provisioning flow.
- **Checkpoint 1B (same initiative, 2026-09-16) — `/registro`'s reentry
  check no longer misclassifies a Patient.** `decideRegistroReentry()`
  (`src/features/onboarding/api.ts`) used to decide purely from
  `hasActiveMembership` (`clinic_memberships`), so an authenticated real
  Patient — who never has a `clinic_memberships` row at all — fell through
  to the same "resume at Paso 2" branch as someone mid-clinic-onboarding.
  It now also takes `hasPatientAccess` (resolved from `patient_user_links`
  via the existing `hasAnyPatientLink()` helper, never a client-supplied
  flag) and redirects a linked Patient with no clinic membership straight
  to `/portal/citas` instead. Precedence matches
  `decideAuthenticatedRedirect()` exactly: an active clinic membership
  still wins first if both are somehow present. The "neither clinic
  membership nor Patient access" case is unchanged on purpose — it still
  resumes onboarding, pending the later checkpoint that retires
  self-service entirely.
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

## Platform / Superadmin (real, Checkpoint 2 — 2026-09-16)

Part of the same self-service-retirement initiative as the onboarding
checkpoints above — see Checkpoints 1A/1B just above and CLAUDE.md's own
Superadmin section for the permanent architectural rule this establishes.

- **1A — CLOSED, applied to the remote Supabase project** as migration
  `20260916090000_require_superadmin_to_bootstrap_clinic.sql`:
  `bootstrap_clinic()` now requires `is_platform_superadmin()` internally
  (both of its two live overloads — see that migration's own comment on
  why there were two).
- **1B — CLOSED.** `/registro`'s reentry check (`decideRegistroReentry()`)
  now also recognizes real Patient access (`patient_user_links`, via
  `hasAnyPatientLink()`) and redirects to `/portal/citas` instead of
  treating a Patient as someone who should continue clinic onboarding.
- **Checkpoint 2 — IMPLEMENTED.** Odentia can now resolve a real,
  authenticated Superadmin server-side from `public.platform_roles` (the
  existing real platform-authorization table, previously unused by the
  app) via `resolveSuperadminContext()`
  (`src/features/session/resolve-superadmin-context.ts`) — the same
  resolver-per-identity-plane pattern as `resolveClinicContext()`/
  `resolvePatientContext()`. `/platform` (`src/app/platform/`) is a real,
  protected surface, gated in two independent layers: `src/lib/supabase/
  proxy.ts`'s own private-path list (`PRIVATE_PLATFORM_PATHS`) and
  `/platform/layout.tsx`'s own independent re-check, so a future child
  route under `/platform` can't be exposed by forgetting just one of the
  two. `decideAuthenticatedRedirect()` (shared by `/login` and
  `proxy.ts`) now takes a `SuperadminContext` first and sends a real
  Superadmin to `/platform` ahead of any Clinic/Patient status she might
  also happen to have. `/platform` itself is deliberately minimal — a
  single confirmation page, no dashboard, no prospectos, no clinic
  management yet. `/admin` (the old, fully mock Phase 1 Superadmin
  screen) is untouched and out of scope for this checkpoint.
- **Checkpoints 1A + 1B + 2 shipped to production** as commit `21cc997`
  (`eaaaed8..21cc997`), migration `20260916090000` applied to the remote
  Supabase project, local/remote in sync, and the first real Superadmin
  row created manually (`alexsosa.me@gmail.com`,
  `platform_roles.role = 'superadmin'`).
- **PRODUCTION INCIDENT (post-`21cc997`) — login started failing for
  everyone, constantly.** UI showed the generic "No pudimos iniciar
  sesión. Intenta de nuevo en unos minutos." for every login attempt,
  any role — misleading, since real Supabase Auth (`signInWithPassword`)
  was succeeding every time. **Root cause, confirmed:**
  `resolveSuperadminContext()`'s own query
  (`.from("platform_roles").select("role").eq("profile_id", user.id)`)
  hit `42501: permission denied for table platform_roles` — `public.
  platform_roles` has carried its `platform_roles_select_self_or_
  superadmin` RLS policy since it was created, but, unlike every other
  table `resolveClinicContext()`/`resolvePatientContext()` touch, it
  never received the base `GRANT SELECT ... TO authenticated` Postgres
  requires before RLS is even evaluated — the exact same gap class
  already fixed once before for `clinic_memberships`/`clinics`
  (`20260826153000_grant_onboarding_table_privileges.sql`) and for
  `profiles`/`professional_profiles`/`patient_user_links` after them.
  Nothing exercised `platform_roles` from a real authenticated client
  query until `resolveSuperadminContext()` (Checkpoint 2), which is why
  this surfaced only now. Since that resolver runs on every single login
  (any role, via `Promise.all` in `login/page.tsx`), the missing grant
  broke login universally, not just for the Superadmin — and
  `login/page.tsx`'s own `catch` block shows the identical generic
  message whether `signInWithPassword` itself fails or a post-auth
  resolver throws, which is why a real, successful authentication
  presented as a "wrong credentials"-shaped error. **Hotfix migration:**
  `20260916100000_grant_platform_roles_select.sql` — additive, `SELECT`
  only, `authenticated` only, no RLS/policy change, no write privilege,
  `anon` untouched. **Applied to the remote Supabase project** (`npx
  supabase db push`).
- **Incident CLOSED — real production smoke, PASS.** With the hotfix
  live, `alexsosa.me@gmail.com` logged in on `odentia.co` and landed on
  `/platform`, which rendered correctly — the real, protected Platform
  surface, not `/registro`, not an error. **Checkpoint 2 / Superadmin
  production smoke: PASS.** The current `/platform` page is a
  deliberate placeholder (a single confirmation screen, no dashboard) —
  not a gap to fix, the actual scope boundary for this checkpoint.
- **Known follow-up, not blocking:** `login/page.tsx`'s error boundary
  still shows the same generic "No pudimos iniciar sesión" message
  whether `signInWithPassword` itself fails or a post-auth resolver
  throws (this is what made the incident above look like a credentials
  problem at first). Worth a small, focused fix later so a future
  resolver failure doesn't get misdiagnosed the same way — does not
  block the next Platform checkpoint.
- **Checkpoint 3 (2026-09-16) — Platform is real: shell, Clínicas
  listing, and Superadmin-direct clinic creation.** `/platform`'s
  placeholder confirmation screen is now a real shell
  (`src/components/platform/`: `PlatformShell`/`PlatformSidebar`/
  `PlatformHeader`) — sidebar grouped Plataforma (Inicio/Clínicas/
  Usuarios) / Negocio (Suscripciones/Marketplace) / Administración
  (Configuración), matching the structure already approved for this
  exact sidebar in `src/dev/role.ts`'s own superadmin nav config (the
  `demo` branch's `/admin` code itself is byte-identical to `main`'s —
  no separate Demo implementation exists in this repo to diff against;
  this nav structure is the closest real, already-approved source of
  truth available, reproduced conservatively rather than redesigned).
  Header shows the real Superadmin's name/email
  (`resolveSuperadminContext()`), never mock. Usuarios/Suscripciones/
  Marketplace/Configuración are real, named sections with no screen yet —
  inert, not fake.
  - **`/platform/clinicas`** — real listing (`clinics` + primary
    `clinic_locations`, joined server-side). Confirmed via every GRANT
    ever applied to both tables (not assumed, given the `platform_roles`
    incident): both already carry base `SELECT` for `authenticated` and
    RLS's own `is_platform_superadmin()` branch — no new grant or policy
    needed for reads.
  - **`/platform/clinicas/nueva` → `provision_clinic()`** (new migration
    `20260916110000_create_provision_clinic_rpc.sql`) — a SEPARATE RPC
    from onboarding's `bootstrap_clinic()`, never that one:
    `bootstrap_clinic()`'s own body (both overloads) unconditionally
    inserts a `clinic_memberships` row for the caller as `clinic_admin`,
    which would incorrectly enroll the Superadmin as a member of every
    clinic she provisions. `provision_clinic()` creates `clinics` +
    `clinic_locations` (sede principal) + the same default `treatments`
    seed `bootstrap_clinic()` seeds, gated on `is_platform_superadmin()`
    checked first, with **no membership and no professional_profile
    insert at all** — a Superadmin-provisioned clinic legitimately has
    zero members until the next checkpoint. Designed to be the same
    function a future prospecto-conversion flow calls — Ruta A and Ruta
    B (read-only audit's naming) converge here.
  - **`/platform/clinicas/[slug]`** — real detail (clinic + sede principal
    fields). Originally shipped as `/platform/clinicas/[clinicId]`; later
    renamed to a canonical, stable `slug` URL (`clinics.slug`, not null +
    unique since the foundation schema, never writable after creation), with
    a UUID-compatibility redirect for any link minted before the rename.
  - **QA:** `bootstrap_clinic`/migration `20260916090000` untouched; the
    Superadmin-vs-authorization guard logic in `/platform/layout.tsx` is
    byte-unchanged (only the render output after the existing checks
    changed); `npx tsc --noEmit`, ESLint, and `npx next build` all clean,
    all 4 new routes registered; unit tests green (56/56, incl. 4 new for
    `friendlyProvisionError`). The RPC's own authorization/no-membership/
    atomicity properties are verified **statically** (guard checked
    first, zero `clinic_memberships`/`professional_profiles` references
    in the new function body, same class of verification Checkpoint 1A
    used) — not by a live DB test, since this repo has no
    Supabase-mocking test infra for any resolver/RPC caller.
  - Migration `20260916110000` — **applied to remote**, local/remote in
    sync. Manual DB smoke (real clinic created from Platform on a real
    Superadmin session: exactly one `clinics` row, one primary
    `clinic_locations` row, the treatments seed, zero `clinic_memberships`
    rows for the Superadmin) confirmed PASS — superseded by the full
    provisioning + first-Clinic-Admin E2E in Checkpoint 4 below.
- **Member provisioning (the "Next step" noted above) — see Checkpoint 4
  below:** assigning the first Clinic Admin to a Superadmin-provisioned
  clinic is now real end to end, reusing the existing `clinic_invitations`/
  `accept_clinic_invitation` mechanism rather than a second one, exactly
  as anticipated here.

### Checkpoint 4 (2026-09-16) — Primer Administrador de Clínica: provisioning + activación, E2E PASS

Closes the "member provisioning" gap noted above. Superadmin can now take
a Platform-provisioned clinic all the way to a working Clinic Admin
session with no manual DB work and no outbound email.

- **Platform visibility (Estados A/B/C).** `/platform/clinicas/[slug]`
  resolves, from real reads, exactly one of: no admin/no valid pending
  invitation → assignment form; a pending, not-yet-expired invitation →
  its pre-provisioned identity, read-only, no second form; an active
  admin → her identity (name/email/phone), no form. Required widening
  Superadmin's own SELECT reach on `clinic_invitations` and `profiles`
  (both otherwise scoped to a clinic's own members) — additive RLS only,
  same `is_platform_superadmin()` OR-branch pattern already used on
  `clinics`/`clinic_memberships`/`professional_profiles`, no new writes,
  no `anon` change.
- **Provisioning RPC.** `provision_first_clinic_admin_invitation()` —
  Superadmin-only, `role` hardcoded `clinic_admin` server-side, rejects a
  clinic that already has an active admin or an existing pending
  `clinic_admin` invitation. Stores a pre-provisioned identity
  (`first_name`/`last_name`/`email`/`phone`, all required) on
  `clinic_invitations` alongside the same token/hash convention every
  other invitation already uses.
- **Activation without Confirm Signup.** For a genuinely new email:
  `activatePreProvisionedInvitationAction` (Server Action, renamed from
  `activatePreProvisionedClinicAdminAction` once generalized — see
  `Platform → Clínica → Equipo` below) re-resolves
  the invitation itself server-side (never trusts the browser's own
  preview), creates the Auth user via the Admin API
  (`email_confirm: true`, service-role key — server-only), the client
  then does a normal `signInWithPassword`, and — new in this
  checkpoint — automatically calls `accept_clinic_invitation()` against
  that SAME token immediately after, landing directly on the existing
  "¡Listo! Ya eres parte del equipo." success screen. One user gesture
  ("Activar mi cuenta") now both creates access and accepts that specific
  invitation; no second "Aceptar invitación" click for this path. An
  email that already has an account is unaffected: normal login,
  `/invitacion/[token]`, manual "Aceptar invitación" — unchanged. If
  Auth/sign-in succeed but the automatic accept fails, the flow never
  retries account creation or signs the user out — it falls back to the
  same authenticated "ready" state with a visible notice and the existing
  manual "Aceptar invitación" button.
- **Historical bug re-fixed:** `accept_clinic_invitation()`'s `42702`
  "column reference clinic_id is ambiguous" error (first fixed in
  `20260909020000` — see "Production stabilization fixes" above) was
  silently reintroduced by a later migration (`20260914090000`) that did
  its own `CREATE OR REPLACE` from a stale, pre-fix copy of the function
  body while adding an unrelated availability-seeding feature. Migration
  `20260916140000` restored the correct `cm.clinic_id`/`cm.profile_id`
  aliasing on top of the current (availability-seeding-inclusive) body,
  verified by diff to be the only change. **Lesson for any future
  migration that replaces an existing function:** always base the new
  body on the CURRENT deployed version, never an older cached/remembered
  copy — a `CREATE OR REPLACE` can silently resurrect a bug that was
  already fixed once.
- **Migrations for this block** (all applied to the remote Supabase
  project, local/remote confirmed in sync through
  `20260916180000_provision_clinic_team_member.sql`):
  - `20260916110000_create_provision_clinic_rpc.sql`
  - `20260916120000_create_preview_clinic_invitation_rpc.sql`
  - `20260916130000_add_user_exists_to_preview_clinic_invitation_rpc.sql`
  - `20260916140000_fix_accept_clinic_invitation_ambiguous_clinic_id.sql`
  - `20260916150000_provision_first_clinic_admin_invitation.sql`
  - `20260916160000_extend_clinic_invitation_activation.sql`
  - `20260916170000_allow_superadmin_clinic_provisioning_reads.sql`
  - `20260916180000_provision_clinic_team_member.sql` (Superadmin general
    team provisioning + the `regenerate_clinic_invitation()`/
    `set_clinic_member_status()` authorization widening — see
    `Platform → Clínica → Equipo` below for the full detail)
- **E2E REAL — PASS.** Clínica `Odentia QA Provisioning 3`, first admin
  `Alex Test 03` (`alexsosa.me+adtest03@gmail.com`). Full flow: Platform →
  crear clínica → asignar primer admin → generar/copiar link → incógnito →
  preview password-only → "Activar mi cuenta" → Auth user creado y
  confirmado sin correo → sign-in automático → aceptación automática de la
  invitación → "¡Listo! Ya eres parte del equipo." → "Ir a mi Clínica" →
  `/agenda` con el contexto correcto de `Odentia QA Provisioning 3` →
  `/clinica` muestra a Alex Test 03 como Administrador activo.
- **Validación SQL read-only, confirmada:** `profiles` (first_name =
  `Alex`, last_name = `Test 03`, email = `alexsosa.me+adtest03@gmail.com`,
  phone = `+573173672033`); `clinic_invitations` (status = `accepted`,
  role = `clinic_admin`, `accepted_membership_id` no nulo);
  `clinic_memberships` (mismo id que `accepted_membership_id`, role =
  `clinic_admin`, status = `active`); `professional_profiles` — inexistente
  para este membership, esperado por diseño (ver CLAUDE.md — Clinic Admin
  vs Professional); Auth (`auth.users.id` = `profiles.id`,
  `email_confirmed_at` y `last_sign_in_at` poblados, sin Confirm Signup
  email en ningún punto del flujo). **Conclusión: Primer Clinic Admin
  nuevo — provisioning + activation E2E: PASS.**
- **Historial de smokes / QA users** (no reutilizar para probar
  `user_exists=false`; ninguno fue limpiado/modificado):
  - `alexsosa.me+adtest01@gmail.com` — smoke previo a la activación
    server-side, quedó como Auth user sin confirmar.
  - `alexsosa.me+adtest02@gmail.com` — confirmó create-confirmed-user +
    sign-in automático, pero reveló el estado intermedio (segundo botón
    manual "Aceptar invitación" para un usuario nuevo) que motivó el
    auto-accept de este checkpoint.
  - `alexsosa.me+adtest03@gmail.com` — smoke definitivo (primer Clinic
    Admin), PASS (arriba).
  - `alexsosa.me+odo01@gmail.com` — E2E real, nuevo Odontólogo vía
    `Platform → Clínica → Equipo`, PASS (ver más abajo).
  - `alexsosa.me+adtest04@gmail.com` — E2E real, segundo Clinic Admin de
    la misma clínica, PASS (ver más abajo).
- **Pendientes reales, no bloqueantes para este happy path:**
  - `accept_clinic_invitation()`'s `expired` branch does an `UPDATE
    status = 'expired'` immediately followed by a `RAISE EXCEPTION` in
    the same transaction, so that UPDATE can be rolled back — known,
    unfixed, unrelated to the flow validated in this checkpoint.
  - Revocación de una invitación pendiente: no implementada (regenerar sí
    lo está, para Clinic Admin y, desde este mismo checkpoint, también
    para Superadmin — ver más abajo).
  - Selector multi-clínica (UI para una persona con membership en más de
    una clínica): no implementado. Nótese que esto es distinto de
    "múltiples `clinic_admin` en una misma clínica", que sí está
    implementado y validado E2E — ver `Platform → Clínica → Equipo` más
    abajo.
  - The mock-session "self-heal" bridge (see "Authenticated-context
    self-healing" above) is an observation, not a reproduced failure here:
    the real E2E smoke's own "Ir a mi Clínica" → `/agenda` loaded the
    correct user/clinic context immediately, with no blank shell.
- **`Platform → Clínica → Equipo` — REAL, E2E VALIDATED (2026-09-16).**
  Product decision confirmed and now proven end to end: the Superadmin
  can administer team membership (Administrador, Odontólogo, Asistente)
  of ANY clinic from Platform — provisioning/transversal support, not
  limited to the first Clinic Admin bootstrap above — without ever
  acquiring a `clinic_membership` of her own.
  - **Migration `20260916180000_provision_clinic_team_member.sql` —
    APPLIED to the remote Supabase project, Local/Remote confirmed
    aligned through `20260916180000`.**
    `provision_clinic_team_member(p_clinic_id, p_role, p_first_name,
    p_last_name, p_email, p_phone)` (Superadmin-only, all three roles,
    always complete pre-provisioned identity, no "first admin" guards —
    those stay exclusive to `provision_first_clinic_admin_invitation()`,
    untouched — rejects an already-active membership for that email,
    rejects with a distinct message when a membership already exists but
    is inactive, pointing at reactivation instead of a new invitation,
    rejects a conflicting pending invitation regardless of who issued it,
    and treats a membership in a DIFFERENT clinic as no conflict at all),
    plus a minimal, single-line authorization widening
    (`or is_platform_superadmin()`) on `regenerate_clinic_invitation()`
    and `set_clinic_member_status()`, each based on its own currently-
    deployed body — not an older cached copy, the exact lesson from the
    42702 regression above. `accept_clinic_invitation()` needed NO
    changes: confirmed already fully role-generic.
  - `hasPreProvisionedIdentity()` (`src/features/clinic/team-actions.ts`)
    generalized from `role === "clinic_admin"` to identity-completeness
    alone — a traditional Clinic-Admin-issued dentist/assistant
    invitation never sets first_name/last_name/phone, so this stays a
    safe structural distinction, never a heuristic. The activation Server
    Action (renamed `activatePreProvisionedInvitationAction`,
    `src/features/clinic/activate-invitation-action.ts`) dropped its own
    `role !== "clinic_admin"` check the same way — the same password-only,
    no-Confirm-Signup, auto-accept happy path from the first-admin flow
    above now applies to any genuinely new user provisioned from Platform,
    for any of the three roles.
  - `PlatformEquipoSection`/`AddTeamMemberModal`
    (`src/components/platform/platform-equipo-section.tsx`) on
    `/platform/clinicas/[slug]`, reusing `fetchTeamMembers()`/
    `fetchPendingInvitations()` (already Superadmin-readable under
    existing RLS/grants) and `setClinicMemberStatus()`/
    `regenerateClinicInvitation()` (`src/features/clinic/team-actions.ts`,
    unmodified) as-is. Only rendered once an active admin exists (Estado
    C), replacing the narrower admin-identity-only card; the bootstrap
    Estado A/B cards above are unchanged and stay the only entry point
    until then — never two competing "add the first admin" forms.
  - **UX — "Ir a mi Clínica" loading feedback.** The real navigation to
    `/agenda` after auto-accept could take long enough to look
    unresponsive. Fixed with the same local-pending-`useState` + disabled
    CTA convention already used for other plain `router.push` buttons
    (see Architecture above): immediate disable + spinner +
    "Entrando a mi Clínica…" on click, held until `/agenda` takes over.
    No change to routing, auth, session resolution, or the destination
    itself.
  - **E2E REAL — nuevo Odontólogo, PASS.** Clínica `Odentia QA
    Provisioning 3`. Superadmin → Agregar miembro → Odontólogo → identidad
    pre-provisionada → link → incógnito → password-only → "Activar mi
    cuenta" → auto-accept → success. DB confirmó: membership
    `role=dentist`/`status=active` en la clínica correcta; invitation
    `status=accepted` con `accepted_membership_id` igual al membership
    creado; identidad y teléfono correctos; `professional_profile_id` NO
    nulo, con disponibilidad default real (lunes–viernes, 08:00–17:00,
    `active=true`, misma clínica y mismo `professional_profile`) —
    confirma que la generalización no rompió el side effect existente de
    `accept_clinic_invitation()` para `dentist`.
  - **E2E REAL — segundo Clinic Admin, PASS.** Misma clínica, mismo flujo
    password-only + auto-accept, rol Administrador. DB confirmó:
    membership `role=clinic_admin`/`status=active`, invitation
    `status=accepted` con `accepted_membership_id` correcto,
    `professional_profile_id = NULL` (esperado). Valida explícitamente que
    múltiples `clinic_admin` activos en una misma clínica son válidos, que
    "primer administrador" es solo un concepto de bootstrap (no un techo
    permanente), y que un admin adicional no recibe `professional_profile`
    automáticamente — mismo comportamiento que el primero.
  - **Bug real encontrado y cerrado — cardinalidad multi-admin
    (`PGRST116`).** Tras aceptar el segundo Clinic Admin, un hard refresh
    de `/platform/clinicas/odentia-qa-provisioning-3` mostraba
    `admin-assignment state lookup failed` en consola y la UI caía
    incorrectamente a "Asignar Administrador de Clínica" pese a existir
    DOS admins activos. Root cause: `fetchActiveClinicAdminMembership()`
    (`src/features/platform/clinics-data.ts`) usaba `.maybeSingle()`, que
    exige cardinalidad máxima de uno — PostgREST devuelve `PGRST116`
    ("multiple (or no) rows returned") en cuanto existe una segunda fila
    válida. Fix: selección determinística de una fila
    (`.order(...).limit(1)` + `data?.[0]`), ya que este helper solo
    necesita responder "¿existe al menos un Clinic Admin activo?", nunca
    cuál en concreto. Se corrigió además el fail-open de la UI: antes, un
    error de lectura dejaba las variables en `null` y la UI lo
    interpretaba como "no existe admin"; ahora existe una señal explícita
    (`adminStateLookupFailed`) que renderiza un estado distinto de
    error/desconocido, nunca Estado A, ante un fallo real de lectura —
    mismo `loadFailed`-boolean convention que `/platform/clinicas/page.tsx`
    ya usa para la lista. Regresión manual confirmada PASS: hard refresh →
    sigue en Estado C con el roster completo, sin el falso Estado A, sin
    el error en consola. Ver CLAUDE.md para la regla arquitectónica
    permanente que esto dejó documentada.
  - **Lifecycle Superadmin — Desactivar/Reactivar, PASS.** Con `Alex
    Odontest` (el nuevo Odontólogo), el Superadmin ejecutó desde Platform
    Activo → Desactivar → Inactivo → Reactivar → Activo, con la UI
    reflejando correctamente cada estado (badge + acción disponible) en
    cada paso. Los dos Clinic Admin permanecieron activos durante toda la
    prueba. Valida en runtime el widening de `set_clinic_member_status()`
    para un Superadmin sin membership propia en la clínica.
  - **QA ejecutado:** `tsc --noEmit` y ESLint limpios en cada archivo
    tocado a lo largo de este bloque; `team-actions.test.ts` (19 tests,
    incl. los 3 nuevos de `hasPreProvisionedIdentity` cubriendo
    invitaciones Platform de dentist/assistant) y
    `resolve-login-return-to.test.ts`, `clinics-data.test.ts`,
    `api.test.ts` en verde; migración `20260916180000` revisada
    estructuralmente antes de aplicarse (cuerpos de función balanceados,
    guard de Superadmin primero, sin escritura prematura de
    membership/professional_profile, sin persistencia de raw token, sin
    grants nuevos a `anon`, los dos `CREATE OR REPLACE` diferenciados
    contra sus cuerpos vigentes para confirmar que solo cambió la línea de
    autorización). No se agregó test nuevo para el fix de cardinalidad:
    `fetchActiveClinicAdminMembership()` es un wrapper de I/O sin lógica
    pura extraíble, y este proyecto no tiene infraestructura de mocking de
    Supabase para esta clase de función — validado en su lugar mediante
    regresión manual real (arriba).
  - **Conclusión general: `Platform → Equipo`: PASS funcional para este
    checkpoint.**
- **Checkpoint 5 (2026-09-16) — Prospecto Comercial: captura pública +
  Platform → Prospectos.** Primer tramo real del funnel comercial público
  (ver CLAUDE.md's own "Prospecto Comercial" section para la arquitectura
  permanente). Dos migraciones nuevas, secuenciales tras
  `20260916180000`:
  - `20260916190000_create_commercial_prospects.sql` — tabla
    `public.commercial_prospects` (RLS enabled, cero policies de
    escritura para anon/authenticated; una policy SELECT escalada a
    `is_platform_superadmin()`) + `submit_commercial_prospect()`
    (`SECURITY DEFINER`, anon-callable — el segundo RPC anon-callable del
    schema, tras `preview_clinic_invitation()` — fuerza `status='new'`,
    valida cada campo server-side independientemente del cliente).
    **APLICADA al Supabase remoto** (`npx supabase db push`, confirmado
    por Alex) — smoke real PASS: prospecto QA creado manualmente desde
    `/demo` (Alex Sosa / Temporal Clinic / Tunja) y confirmado en
    `public.commercial_prospects`.
  - `20260916200000_create_update_commercial_prospect_status_rpc.sql` —
    `update_commercial_prospect_status(p_prospect_id, p_new_status)`
    (`SECURITY DEFINER`, Superadmin-only, `for update` row lock, valida
    la transición contra el estado REAL en DB, nunca confía en un
    `currentStatus` del cliente; solo escribe `status`/`updated_at`, sin
    RPC de edición de identidad/contacto). **APLICADA al Supabase
    remoto** — confirmado por el smoke real de progresión de estado
    (`new → contacted → demo_scheduled → demo_completed → won`), ver
    Checkpoint 8.
  - `/demo` (`src/features/commercial-prospects/prospect-form.tsx`) — 6
    campos (Nombre, Apellido, Nombre de la clínica, Correo, Teléfono/
    WhatsApp, Ciudad), estados idle/submitting/success/error, honeypot
    pasivo (sin infraestructura anti-spam previa en el repo), sin
    Supabase Auth, sin redirect a `/registro`/`/login`/`/agenda`.
  - `/platform/prospects` (listado: búsqueda + filtro por estado,
    client-side sobre datos ya fetched, sin paginación nueva — volumen
    esperado bajo) y `/platform/prospects/[prospectId]` (detalle:
    información + `mailto:`/`wa.me` + acción de estado única según
    `getNextCommercialProspectAction()`, nunca un dropdown genérico).
    Nav "Prospectos" agregada al sidebar de Platform, junto a Clínicas.
  - **QA ejecutado:** `tsc --noEmit` y ESLint limpios en todos los
    archivos tocados; suite completa (`npx vitest run`) en verde, 495
    tests incl. los 22 nuevos (`actions.test.ts` — validación de
    formulario; `state-machine.test.ts` — 13 casos PASS/FAIL de
    transición, espejo exacto de las reglas del RPC). Regresión estática
    de `/demo`/landing confirmada (rutas de Logo/Marketplace/`Iniciar
    sesión`/`Quiero Odentia...` intactas, `/registro` sigue existiendo).
    No se agregó test pgTAP: solo 2 de ~20 migraciones con RPC en este
    repo tienen uno, no es convención universal.
  - **PENDIENTE (vigente):** política formal de privacidad/tratamiento de
    datos para `/demo` (no existe aún en el repo); hardening anti-spam
    real (rate limiting/CAPTCHA) si el volumen lo justifica más adelante.
    `Prospecto ganado → Convertir en clínica` — implementado en
    Checkpoint 6, ya no pendiente.
  - **Fix — fila de `/platform/prospects` no navegaba al detalle.** Solo
    el nombre dentro de la primera celda tenía `<Link>`; el resto de la
    fila (la mayoría del área clickeable visible) no navegaba. Corregido
    haciendo toda la `<tr>` navegable (`router.push`, `role="link"`,
    `tabIndex`, mismo hover ya existente) — sin tocar queries/búsqueda/
    filtros/state machine.
- **Checkpoint 6 (2026-09-16) — Prospecto Ganado → Crear clínica
  (conversión operacional, reutilizando `provision_clinic()`).** Smoke
  manual real confirmó el pipeline completo hasta `won` (prospecto QA
  Alex Sosa / Temporal Clinic / Tunja). Este checkpoint agrega la acción
  posterior, separada del estado comercial (ver CLAUDE.md's own
  "Prospecto Comercial" section para la regla permanente: `won` nunca
  crea una clínica automáticamente).
  - **Migración nueva** (secuencial tras `20260916200000`, que YA está
    aplicada según el smoke actual):
    `20260916210000_convert_commercial_prospect_to_clinic.sql` — agrega
    `commercial_prospects.converted_clinic_id` (FK nullable a
    `clinics.id`) + `converted_at` (par, nunca independiente) y
    `convert_commercial_prospect_to_clinic()` (`SECURITY DEFINER`,
    Superadmin-only, `for update` row lock sobre el prospecto, valida
    `status = 'won'` y `converted_clinic_id is null` contra la fila REAL
    antes de escribir — garantía de idempotencia a nivel DB contra doble
    click/doble pestaña/requests concurrentes). **NO reimplementa
    provisioning**: llama directamente a `provision_clinic()`
    (`20260916110000`, sin modificar) — esa migración ya había sido
    diseñada explícitamente para esto ("Ruta A desde un prospecto, Ruta B
    directa, ambas convergen aquí"). **APLICADA al Supabase remoto.**
  - `PlatformClinicForm` (`src/features/platform/clinic-form.tsx`) ganó
    dos props opcionales (`initialClinic`/`initialLocation`, default
    `EMPTY_CLINIC`/`EMPTY_CLINIC_LOCATION`) para poder prellenar
    `clinic_name`/`city` desde el prospecto sin duplicar el formulario —
    `/platform/clinicas/nueva` sigue arrancando en blanco, sin cambios.
    `ProspectConversionSection` (`src/components/platform/`) es el nuevo
    panel en `/platform/prospects/[prospectId]`, visible solo cuando
    `status === 'won'`: CTA "Crear clínica" → revela el mismo formulario
    real (prefilled, editable, con contexto read-only del contacto
    comercial — nunca convertido en Clinic Admin/Auth user/membership/
    invitation aquí) → al confirmar, reemplaza la sección por "Clínica
    creada" + link "Ver clínica" → `/platform/clinicas/[slug]`. Falla
    cerrado (nunca vuelve a ofrecer "Crear clínica") si el prospecto ya
    está convertido pero la lectura secundaria del nombre/slug de la
    clínica falla.
  - `isEligibleForClinicConversion(status, convertedClinicId)`
    (`src/features/commercial-prospects/state-machine.ts`) — espejo TS
    puro de las mismas dos condiciones que la RPC valida server-side;
    nunca la autoridad real, solo lo que la UI ofrece.
  - **QA ejecutado:** `tsc --noEmit` y ESLint limpios; suite completa en
    verde, 498 tests (3 nuevos de `isEligibleForClinicConversion`, PASS/
    FAIL espejando la RPC). Migración revisada estructuralmente (no
    duplica lógica de `provision_clinic()`, guard de Superadmin primero,
    row lock antes de cualquier escritura, sin grant nuevo a `anon`).
    **Migración aplicada al remoto y smoke real E2E: PASS** — prospecto
    QA (Alex Sosa / Temporal Clinic / Tunja) llevado hasta `won` y
    convertido en clínica real; `commercial_prospects.converted_clinic_id`
    quedó poblado y "Ver clínica" abrió el detalle correcto en
    `/platform/clinicas/[slug]`. El provisioning del primer Clinic Admin
    para esa clínica sigue siendo el flujo Platform → Equipo ya existente
    y cerrado — no es un paso pendiente de este checkpoint.
- **Checkpoint 7 (2026-09-16) — Platform clinic logo wiring (real,
  bloqueado por una brecha de autorización encontrada durante el smoke
  del Checkpoint 6).** Auditoría focalizada confirmó que `PlatformClinicForm`
  (usado por Platform → Clínicas → Crear clínica Y por Prospecto Ganado →
  Crear clínica) tenía un picker de logo completamente real
  (seleccionar/preview/quitar/validación) pero el `File` nunca salía del
  estado local — UI-ONLY, ningún upload ocurría en ningún camino.
  - **Root cause real, no solo wiring faltante:** aun conectando el
    upload, un Superadmin habría sido rechazado por RLS/Storage. Tanto
    `clinics_update_admin` como las tres policies `clinic_logos_*` de
    Storage (todas detrás de un único helper, `owns_clinic_logo_path()`)
    exigían `has_clinic_role(..., ['clinic_admin'])` — y `provision_clinic()`
    deliberadamente NUNCA crea membership para el Superadmin que provisiona
    (regla permanente, ver CLAUDE.md). Esto afectaba a AMBOS caminos por
    igual, no solo a Prospectos.
  - **Migración nueva** (secuencial tras `20260916210000`, que YA está
    aplicada según el smoke actual):
    `20260916220000_allow_superadmin_manage_clinic_logo.sql` —
    `alter policy clinics_update_admin` (mismo patrón `or
    is_platform_superadmin()` ya usado en `20260916170000`) +
    `create or replace function owns_clinic_logo_path()` con el mismo
    `or is_platform_superadmin()` (un solo punto de cambio cubre las tres
    policies de Storage que ya lo comparten, incluida `clinic_logos_select_admin`).
    Sin membership artificial, sin ampliar acceso más allá del bucket
    `clinic-logos`, sin tocar la autorización existente de Clinic Admin.
    **APLICADA al Supabase remoto.**
  - `PlatformClinicForm.onSubmit` ahora recibe un tercer argumento
    (`logoFile: File | null`) — el componente sigue sin subir nada él
    mismo (no hay `clinic_id` real en submit time). Los dos callers reales
    (`/platform/clinicas/nueva/page.tsx`, `ProspectConversionSection`)
    llaman `uploadClinicLogo(clinicId, logoFile)`
    (`src/features/clinic/logo.ts`, sin modificar) SOLO después de que su
    propia RPC de provisioning/conversión ya devolvió un `clinicId` real —
    mismo orden que ya usa el onboarding wizard. Un fallo del upload en
    ese punto es explícitamente no-fatal: nunca reintenta provisioning/
    conversión (la clínica/vínculo ya existen), solo muestra un toast de
    advertencia y continúa (redirect al detalle de la clínica / estado
    "Clínica creada").
  - **QA ejecutado:** `tsc --noEmit` y ESLint limpios en los archivos
    tocados; suite completa en verde, 498 tests (sin regresión — no se
    agregaron tests nuevos: la lógica modificada es wiring async
    secuencial sin rama pura extraíble, mismo criterio ya aplicado antes
    para `fetchActiveClinicAdminMembership()`). Migración revisada
    estructuralmente (ALTER POLICY conserva nombre/comando/roles, CREATE
    OR REPLACE mantiene firma/tipo de retorno, validación de path/uuid
    intacta). **Migración aplicada al remoto y smoke real E2E: PASS** —
    Temporal Clinic creada con logo seleccionado durante la conversión de
    prospecto, `clinics.logo_url` poblado, objeto real presente en el
    bucket `clinic-logos`, y el logo visible tanto en `/platform/clinicas`
    (miniatura) como en `/platform/clinicas/[slug]` (header, tratamiento
    ampliado — ver Checkpoint 8).
- **Checkpoint 8 (2026-09-16) — Bloque público/comercial de Odentia:
  CERRADO E IMPLEMENTADO.** Consolida los Checkpoints 5, 6 y 7 anteriores:
  el funnel comercial público completo (Landing → `/demo` → Prospecto →
  seguimiento Superadmin desde Platform → `won` → conversión opcional a
  clínica) está real, con sus cuatro migraciones (`20260916190000`,
  `20260916200000`, `20260916210000`, `20260916220000`) **aplicadas al
  Supabase remoto** y validadas con smoke manual real end-to-end — no es
  trabajo pendiente ni parcial:
  - progresión completa de un prospecto real (Alex Sosa / Temporal Clinic
    / Tunja) por los seis estados de `commercial_prospect_status`
    (`new → contacted → demo_scheduled → demo_completed → won`, con
    `lost` disponible desde cualquier estado no terminal) — PASS;
  - conversión `won → clínica` vía `convert_commercial_prospect_to_clinic()`
    (reutiliza `provision_clinic()` sin duplicar lógica; idempotente por
    row lock; nunca crea Auth user/membership/professional_profile/
    invitation; el contacto del prospecto queda solo como contexto
    read-only, nunca se asume que sea el futuro Clinic Admin) — PASS;
  - creación directa de clínica por Superadmin (`/platform/clinicas/nueva`,
    sin pasar por un prospecto) sigue disponible, sin cambios de
    comportamiento — PASS;
  - upload/persistencia real de logo en AMBOS caminos (`uploadClinicLogo()`,
    sin duplicar infraestructura de Storage), incluyendo la corrección de
    autorización que le permite a un Superadmin gestionar el logo de una
    clínica sin membership (`clinics_update_admin`/`owns_clinic_logo_path()`
    ampliados con `or is_platform_superadmin()`, nunca una membership
    artificial) — PASS;
  - visualización del logo real en `/platform/clinicas` (miniatura,
    fallback `BuildingIcon` para clínicas sin logo) y en
    `/platform/clinicas/[slug]` (tratamiento ampliado, mismo lenguaje
    visual que la identidad de clínica de Agenda —
    `ClinicIdentityCard`/`ClinicLogo`, `src/features/dashboard/
    clinic-identity-card.tsx` — nunca una miniatura pequeña ahí) — PASS.
  - **Asignación/provisioning del Administrador de Clínica** (primer
    Clinic Admin, vía Platform → Equipo) ya existía y quedó cerrada en un
    checkpoint previo (ver "Platform / Superadmin" arriba) — no es un
    siguiente paso de este bloque.
  - **Alineación comercial pública Core ↔ Marketplace (decisión de
    producto, implementación de Marketplace vive en su propio repo,
    `odentia-marketplace`, no documentada aquí en detalle):** el CTA
    público principal de todo el ecosistema es `Quiero Odentia para mi
    clínica`, apuntando siempre a Core's `/demo` — nunca un formulario de
    autorregistro de clínica dentro de Marketplace. El header público de
    Marketplace quedó alineado: `Quiero Odentia para mi Clínica` (→
    `/demo` de Core) y `Ya soy Usuario Odentia` (conserva, sin cambios de
    comportamiento, el mismo link a `/login` de Core que ya usaba con
    otro copy) — reemplazando los CTAs previos `Soy cliente Odentia`/
    `Registra tu clínica`. Marketplace nunca implementó ni implementa su
    propio login/registro de clientes; Core sigue siendo la única
    autoridad de identidad.
  - **Ajuste visual final del Hero de Core (`src/app/page.tsx`):** el CTA
    "Quiero Odentia para mi clínica" del Hero (debajo del logo de
    LopaDent) pasó a outline blanco con borde/texto teal (`border-primary`/
    `text-primary`/`bg-background`, hover `bg-primary/10`) para reducir su
    protagonismo visual frente al mismo CTA sólido del navbar, que se
    mantiene sin cambios. `Iniciar sesión` no se tocó.
  - **QA de cierre:** `tsc --noEmit` y ESLint limpios en cada archivo
    tocado a lo largo de los Checkpoints 5–8; suite completa (`npx vitest
    run`) en verde (498 tests, sin regresiones) al cierre del Checkpoint 7;
    sin suite adicional para el ajuste visual del Hero (cambio de una sola
    clase, ya validado manualmente).
  - **Deuda técnica vigente (no resuelta, no inventada como nueva):**
    política formal de privacidad/tratamiento de datos para `/demo`;
    hardening anti-spam real (rate limiting/CAPTCHA) más allá del
    honeypot pasivo actual.
  - **Siguiente paso comercial:** ninguno definido todavía más allá de
    operar el pipeline ya construido (Platform → Prospectos) y, cuando
    exista demanda real, decidir si el bloque comercial necesita más
    funcionalidad. El siguiente frente de trabajo activo en este repo es
    clínico, no comercial: **RIPS A4 — Especialidad → Servicio RIPS write
    path para `clinic_admin`** (ver "RIPS #8" y "Estado actual" arriba,
    sin cambios por este checkpoint).

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
- A clinic's very first `clinic_admin` is issued by the Superadmin instead,
  via a separate, narrower RPC (`provision_first_clinic_admin_invitation()`)
  — see "Platform / Superadmin" → Checkpoint 4 above. Both write into the
  same `clinic_invitations` table/lifecycle and both are accepted by the
  same `accept_clinic_invitation(token)` — never two invitation systems.

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
- **Availability initialization — `bootstrap_clinic()` 22-arg overload seed
  gap CLOSED (2026-09-21, migration applied to remote).** Read-only audit
  confirmed the zero-row semantics above are already coherent and correctly
  implemented identically in all three consumers (DB trigger,
  `checkConfiguredAvailability()` in `appointments-actions.ts`,
  `resolveSlotMinutesForProfessionalDay()` in `agenda-hours.ts`) — no
  change was made to any of them. The one real gap found:
  `seed_default_professional_availability()` (Lun–Vie 08:00–17:00,
  Sáb/Dom none — `20260914090000`) was correctly called by
  `accept_clinic_invitation()` (dentist), `create_my_professional_profile()`,
  and `bootstrap_clinic()`'s original 20-argument overload, but NOT by
  `bootstrap_clinic()`'s 22-argument overload (the one with
  `location_latitude`/`location_longitude` — see `20260916090000`'s own
  comment on why two live overloads exist at all). Fixed by
  `20260921090000_fix_bootstrap_clinic_22arg_seed_availability.sql`: one
  added `perform` call inside the existing `if is_dentist then` branch,
  otherwise byte-identical to the live 22-arg body (confirmed by direct
  diff before applying) — no backfill, no change to any existing
  `professional_profiles` row. **Framing matters:** since Checkpoint 1A
  (`20260916090000`, 2026-09-16), BOTH `bootstrap_clinic()` overloads
  require `is_platform_superadmin()`, and the real onboarding client
  (`/registro`, the only caller, always resolves to the 22-arg overload)
  is used by an ordinary signup, not a superadmin — so this call already
  fails at the authorization check today, before ever reaching the
  `professional_profiles` insert. This fix closes a latent/defense-in-depth
  inconsistency in a function CLAUDE.md still documents as "retained only
  until self-service is formally retired" — it did NOT unblock or change
  behavior for any real signup in production. Applied and confirmed in
  sync (`supabase migration list`: local = remote =
  `20260921090000`). SQL regression test
  (`supabase/tests/bootstrap_clinic_22arg_seed_availability.test.sql`,
  same conventions as `seed_default_professional_availability.test.sql`)
  is **NOT RUN locally** — no Postgres/Docker in this dev environment —
  same caveat as every other SQL test in this file. Any professional whose
  profile predates this fix (e.g. the pilot clinic "Radiología Oral
  Digital - Dra Ana Medina" / profesional Angie Marcela Alvarado Gil,
  observed with zero `professional_availability` rows and "Horario aún no
  configurado") stays a historical profile under the legacy-unrestricted
  fallback above, deliberately **not backfilled** — resolving it, if ever
  wanted, is a manual "configure her Horario in Configuración" action, not
  a code change.

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
- **Role/session bridge stale-cache fix (real, post-pilot).** The mock
  `odentia:session` bridge is a single global `localStorage` key, never scoped
  per real Supabase user; a real pilot found that a brand-new user activating
  her own invitation in a browser that already had a DIFFERENT real user's
  bridged role cached silently inherited that stale role. `DemoSession` now
  carries `authUserId` (`src/features/auth/session.ts`) — the real
  `profiles.id`/`auth.uid()` the bridge was written for, never itself an
  authorization signal. `use-route-guard.ts`'s self-heal (`shouldRunSelfHeal`)
  compares the cached `authUserId` against the real, currently-signed-in
  `auth.getSession().user.id` and re-bridges whenever they differ (or the cache
  is empty/legacy) — real authorization still comes from Supabase/RLS alone.
  `/invitacion/[token]` (both the brand-new-account and already-has-an-account
  acceptance paths) now explicitly reconstructs the bridge via
  `resolveClinicContext()`/`resolvePatientContext()` +
  `bridgeAuthenticatedContext()` right after acceptance — the same resolution
  `/login` itself uses — instead of depending on the self-heal effect's first
  run.
- **Mi perfil (Admin/Assistant) now real.** `AdminProfileModal`/
  `AssistantProfileModal` (`src/features/dashboard/`) used to render the
  hardcoded mocks `CURRENT_USER`/`CURRENT_ASSISTANT` — a real pilot user saw
  "María Gómez"/"Laura Torres" instead of her own name. Both now read
  `useCurrentUserContext()` (the same resolved `resolveClinicContext()` data
  `useShellIdentity()` already trusts) for nombre/correo/teléfono/rol/clínica,
  and are read-only: the previous "Editar perfil" only ever wrote to an
  in-memory, never-persisted override and never called a real backend, so it
  was removed rather than kept as a fake "Guardar cambios" that silently lost
  the edit on refresh. `profiles.phone` was added to `resolveClinicContext()`/
  `resolvePatientContext()`/`resolveSuperadminContext()`'s existing profile
  read for this. No new profile-edit persistence exists yet.

**Pending finding, next checkpoint:** Real pilot found finalized encounters
can reach RIPS without a principal diagnosis; diagnosis prevention/recovery is
the next clinical checkpoint.

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
  resolved for NEW atenciones (Master "consolidar Servicios realizados
  como única fuente de verdad").** `encounter_services` ("¿Qué
  realizaste?"/manual CUPS) is now the only write-path for "qué se
  realizó" — the clinical encounter screen no longer offers `+ Agregar
  procedimiento`; `addProcedure`/`updateProcedure`/`removeProcedure` are
  gone. Forward-only, never destructive:
  - A resumed draft that already had legacy `patient_clinical_encounter_procedures`
    rows (created before this change) keeps showing them, read-only, in a
    "Procedimientos realizados (histórico)" block that only ever renders
    when that specific encounter already has legacy rows — never for a
    genuinely new atención, and the rows themselves are re-sent unchanged
    on every save rather than silently dropped.
  - Historia Clínica (`AtencionesTab`)/PDF already hid each block
    per-encounter based on real data presence (`treatment`/`services`
    conditionally rendered) — no code change was needed there; they
    already behave correctly for both a legacy-only historical encounter
    and a structured-only new one.
  - The Patient Portal (`/portal/historia`) can now read her own finalized
    `encounter_diagnoses`/`encounter_services` — new additive RLS
    (`encounter_diagnoses_select_own_via_patient_link`/
    `encounter_services_select_own_via_patient_link`,
    `20260918100000_patient_select_own_encounter_services_diagnoses.sql`),
    same shape as `patient_clinical_encounters_select_own_finalized_via_patient_link`.
    SELECT-only, `finalized_at is not null` baked into the policy itself,
    joined through `patient_clinical_encounters` (neither table has its
    own `patient_id` column). **Migration applied to the shared/linked
    project** (`supabase db push --linked`, confirmed in sync via
    `supabase migration list --linked` — local and remote timestamps match
    through `20260918100000`) — the Portal now reads her own finalized
    Diagnósticos/Servicios for real. The SQL regression test
    (`supabase/tests/patient_select_own_encounter_services_diagnoses.test.sql`,
    7 cases covering own-visible/draft-invisible/cross-patient/cross-clinic
    isolation/write-rejection) is **NOT TESTED locally — environment
    unavailable** (no local Postgres/Docker) — never treat it as a passing
    regression suite; the real evidence for this policy is the applied
    migration plus manual Portal smoke, not this file.
  - Reportes' "Tratamientos más realizados" (`computeTreatmentRanking`)
    now prefers `encounter_services` per encounter (label:
    `clinical_concept_name_snapshot` [+ variante] when present, else
    `cups_code` — never a new CUPS-description lookup, never an invented
    name) and only falls back to legacy `patient_clinical_encounter_procedures`
    for an encounter that has zero structured services — never both for
    the same encounter, so a transition-window atención can never be
    double-counted.
  - RIPS generator/readiness: unchanged, still exclusively `encounter_services`
    — this was already true and stays true.
  - `patient_clinical_encounter_procedures`/`patient_clinical_encounters.treatment`
    tables/columns: untouched, no DROP, no backfill, no historical data
    rewritten — still the read path for every atención finalized before
    this change.
  - Known, deliberately out-of-scope residual gap: a clinic-configured
    treatment (`public.treatments`) with no confirmed clinical-concept/CUPS
    mapping has no representation in `encounter_services` today (CUPS is
    a NOT NULL column) — "Agregar servicio manual (CUPS)" is today's only
    escape valve, and it always requires a real code. Not resolved here;
    flagged for a future product decision, not a blocker for this
    consolidation given CUPS' own broad real-world coverage.
- **A4 — Especialidad → Servicio RIPS write path (implemented and
  smoke-PASSED, 2026-09-17, migration applied to remote).**
  `clinic_specialty_rips_services` (previously select-only) now has its
  one sanctioned write path:
  `confirm_clinic_specialty_rips_service()` (`SECURITY DEFINER`, migration
  `20260917100000`) — re-derives the caller's own `clinic_admin` clinic_id
  (never a client parameter, same resolution `invite_clinic_member()`
  uses), re-validates the selected Servicio against the active
  `rips_reference_values` (`catalog_key='Servicios'`) catalog, derives+
  re-verifies Grupo from that Servicio's own `parent_code` (never a
  separate client-supplied Grupo — an inconsistent pair cannot persist),
  and supersedes any existing active row for that `(clinic, specialty)`
  atomically before inserting the new one. `/clinica#rips` gained a new
  "Servicios RIPS por especialidad" section
  (`rips-specialty-services-section.tsx`, right below the existing
  `RipsConfigSection`) listing only specialties actually practiced by this
  clinic's own active professionals (`fetchClinicRelevantSpecialties`,
  `professional_profiles.primary_specialty_id`, never the global
  catalog) — each row shows Confirmado / Pendiente de confirmar (with
  Odentia's own suggestion shown for context only, never autosaved) / Sin
  sugerencia segura, with an explicit "Confirmar configuración" action
  (`confirmClinicSpecialtyRipsServiceAction` → the RPC above) required
  either way. Confirmed global defaults unchanged: Odontología general →
  334, Endodoncia → 311, Ortodoncia → 338, Periodoncia → 343, Rehabilitación
  oral → 347, Odontopediatría → 396 — no default exists (or was added) for
  Cirugía oral y maxilofacial, Implantología, or Estética dental. The
  permanent rule (CLAUDE.md, unchanged) still holds exactly:
  `specialty_rips_service_defaults` is only ever Odentia's own suggestion,
  never effective configuration on its own.
  **Historical encounters are NOT auto-fixed by A4** — Grupo/Servicio are
  snapshotted into `encounter_services` only at encounter-finalize time
  (`clinical-service-resolution.ts`, untouched), and `/rips` reads that
  snapshot directly, never re-resolving `clinic_specialty_rips_services`
  live. Confirming a specialty here only changes what a NEW encounter
  resolves going forward — closing that historical gap is exactly A4B,
  below, real and shipped in this same checkpoint, not a future one.
- **Patient contextual correction (implemented and smoke-PASSED,
  2026-09-17).** A patient-scope readiness pendiente
  (`PATIENT_SEX_MISSING`/`PATIENT_USER_TYPE_MISSING`/
  `PATIENT_COUNTRY_RESIDENCE_MISSING`/etc.) is corrected from a modal
  inside `/rips` itself (`CompletePatientRipsDataModal`,
  `patient-rips-gaps.ts` groups every pendiente for the same patient into
  ONE modal, ONE save), reusing the existing `updatePatient()` write path
  and the same identity catalogs `/pacientes` already uses — never
  navigating away from `/rips`. Real smoke: 5 pendientes → completed
  sexo/tipo de usuario/país de residencia in one modal → 2 pendientes,
  same período, same screen. País de residencia's own `<select>` now
  lists Colombia (code `170`, unchanged) first, then every other country
  alphabetically by label (`sortCountriesColombiaFirst`,
  presentation-only — no autoselection, `Selecciona` stays the initial
  state, no catalog/code changes).
- **A4B — corrección histórica de Servicio RIPS (implemented and
  smoke-PASSED, 2026-09-17, migration applied to remote).**
  `RIPS_SERVICE_CONFIGURATION_MISSING` on an already-finalized encounter
  is now correctable from `/rips` itself, grouped by `encounter_id`
  (`encounter-service-rips-gaps.ts` — one modal per atención, never per
  service, since every service in one encounter shares the same
  professional/specialty under the current no-co-atención model). Write
  path: `apply_confirmed_specialty_rips_service_to_encounter()`
  (`SECURITY DEFINER`, migration `20260917110000`) — `clinic_admin`-only,
  `clinic_id` re-derived from the encounter's own row (never a client
  parameter), requires `finalized_at is not null`, reads the effective
  configuration EXCLUSIVELY from `clinic_specialty_rips_services`
  (re-validated live against the official catalog — never
  `specialty_rips_service_defaults`), and can only fill
  `encounter_services.grupo_servicios_code`/`cod_servicio_code`, never any
  other column. Three real eligibility shapes: Grupo+Servicio both null →
  both filled; Grupo already frozen and matching the derived one → Grupo
  preserved, only Servicio filled; Grupo already frozen and DIFFERENT from
  the derived one → the whole encounter's correction fails closed (never
  a partial per-service fix, never an inconsistent pair). Every corrected
  service gets an append-only row in `encounter_service_rips_corrections`
  (previous/new codes, actor, timestamp) — no client-reachable write path
  on that table at all, `ON DELETE RESTRICT` on its `encounter_service_id`/
  `clinic_id` FKs (an audit trail must outlive the row it explains).
  Real smoke on the 2026-09-14 Muelitas7/Alex Paciente encounter (CUPS
  `890222`/`997001`): `Corregir` opened ONE "Completar Servicio RIPS"
  modal (paciente, fecha, profesional Alex Sosa, especialidad Endodoncia,
  both services' historical Grupo/Servicio "Sin configurar", confirmed
  config "Consulta externa → ENDODONCIA"); "Aplicar configuración
  confirmada" resolved both services in one call. After refresh, same
  período (septiembre 2026): **0 pendientes**, "Listo para generar",
  `Generar RIPS` enabled, metrics unchanged (3 atenciones, 2 pacientes, 3
  consultas, 1 procedimiento). **Not yet done**: generating a NEW RIPS
  export after this fix and reviewing its JSON — deliberately deferred to
  the next checkpoint, no RIPS was generated during this close-out. The
  SQL regression test
  (`apply_confirmed_specialty_rips_service_to_encounter.test.sql`) is
  still `NOT RUN` locally (no Postgres/Docker in this dev environment) —
  the migration applied cleanly to the remote project and the real manual
  smoke above passed, but that SQL suite itself has never executed.
- **Finalization-time prevention: missing principal diagnosis / missing
  Causa-Motivo (2026-09-21, code only, no migration).**
  `getEncounterFinalizeBlockers()` (`encounter-finalize-readiness.ts`) is
  the real gate `handleFinalizeClick` already goes through before
  "Finalizar atención" ever opens its confirm dialog — it now also blocks
  when a classified (consulta/procedimiento) service has no resolvable
  principal diagnosis, or when a consulta's principal diagnosis is missing
  `tipoDiagnosticoPrincipal`, or when a consulta has no Causa/Motivo.
  Principal-diagnosis resolution reuses `resolveDiagnosesForService()`
  (`export-generator.ts`) directly — the exact same function `/rips`
  itself uses to build the JSON — so "ready to finalize" and "the
  generator can actually resolve a principal" can never disagree. Forward-
  only: never re-evaluates an already-finalized encounter: a historical
  encounter missing a principal stays exactly as pending in `/rips` as
  before this change. No diagnosis is ever invented/defaulted anywhere in
  this rule.
  - **"Consulta sin hallazgo patológico" audited, real regulatory
    conclusions (not a code change by itself):** `codDiagnosticoPrincipal`
    stays mandatory even for a normal exam with no pathology found; `Z012
    — Examen odontológico` is a valid representation for that case; with
    Finalidad "Valoración integral para la promoción y mantenimiento" the
    diagnosis must fall in Z00–Z99. Never invent a disease to complete
    RIPS. This does not resolve every possible use of Z012 — only the
    audited "exam, no pathology" case.
- **CIE-10 selector — dental-first discoverability (2026-09-21, code
  only).** Empty-focus prioritizes: Frecuentes (if any) → pinned "Z012 —
  Examen odontológico" (resolved from the real catalog,
  `fetchExamenOdontologicoAction`, never fabricated) → Odontología
  (official WHO CIE-10 K00–K14 block, server-paginated) → "Buscar también
  en todos los diagnósticos" (explicit action) → full catalog. Typed
  search prioritizes Z012 + K00–K14 under "Resultados de odontología",
  with the same explicit-expansion action before the general/full catalog
  search ever runs. Server-side search, debounce, stale-request
  protection (per-section request-id refs), dedupe across sections
  (`dedupeBrowseSections`), reset on query change — all preserved/
  extended, not reimplemented. **`Z012 + K00–K14` is a UX priority
  ordering, not a dental whitelist** — the full catalog stays one click
  away, and this deliberately does not represent all CIE-10 codes
  legitimately used in dentistry (see the dental-scope follow-up below).
  Manual smoke by Alex: Z012 shown first on empty focus (PASS); typing
  "examen" surfaces Z012 directly (PASS); K07 dental-first (PASS);
  general-catalog expansion reachable and separate (PASS).
- **Finalidad → Causa/Motivo: removed the universal "38" default
  (2026-09-21, code only).** A new consultation's `causaMotivoCode` no
  longer defaults to "38 — Enfermedad general" — it starts empty and is
  now required before finalizing (see the finalization-prevention bullet
  above). The one confirmed regulatory relationship
  (`finalidad-causa.ts`, `resolveCausaOnFinalidadChange`): selecting
  Finalidad "Valoración integral para la promoción y mantenimiento" sets
  Causa/Motivo to "40 — Promoción y mantenimiento de la salud —
  intervenciones individuales"; the relationship depends on Finalidad
  only, never on the diagnosis (Z012 or otherwise). Moving away from that
  Finalidad clears a still-"40" Causa without inferring "38" or any other
  value; every other Finalidad infers nothing. `tipoDiagnosticoPrincipal`
  is never auto-inferred by this. Manual smoke by Alex: Finalidad
  promoción/mantenimiento → Causa 40 appears (PASS); changing Finalidad →
  40 disappears (PASS); returning to that Finalidad → 40 reappears
  (PASS); tipo de diagnóstico left untouched (PASS). **Known limitation,
  not resolved now:** the current state cannot distinguish a "40" the
  professional picked manually (independent of Finalidad) from one this
  logic derived — leaving that Finalidad can clear a manually-chosen "40"
  too.
- **Pendiente — `tipoDiagnosticoPrincipal` for Z012:
  REGULATORY INTERPRETATION PENDING.** The audit found no defensible
  official mapping for Z012 to one specific `tipoDiagnosticoPrincipal`
  value (01 — Impresión Diagnóstica / 02 — Confirmado Nuevo / 03 —
  Confirmado Repetido). No default, no inference — selection stays
  manual. Not investigated further in this checkpoint; the regulatory
  case for this specific field is not closed.
- **RESOLVED (2026-09-21) — readiness + runtime schema enforce DT1's
  fixed-size Finalidad/Causa.** Confirmed with the actual DT1 v003 PDF
  text (fetched from minsalud.gov.co, cross-checked against the real
  sispro.gov.co "vigente" link to rule out an unlabeled v001 copy):
  `finalidadTecnologiaSalud` (C08 consulta / P10 procedimiento) and
  `causaMotivoAtencion` (C09, consulta only — DT1 defines no equivalent
  field for procedimientos) are both declared with a bare fixed Tamaño
  `"2"` (never `"0-2"`, never a comma-list including 0) — DT1 v003 §1.5's
  own rule for a fixed-size field means neither admits `null`. Fixed at
  two layers:
  - **`export-readiness.ts`**: two new checks, `SERVICE_FINALIDAD_MISSING`
    (consulta and procedimiento) and `CONSULTATION_CAUSA_MOTIVO_MISSING`
    (consulta only), same per-service pattern as the existing
    `SERVICE_VALUE_MISSING`/`CONSULTATION_DIAGNOSIS_TYPE_MISSING` checks —
    identifies the gap and names the service, never prescribes a value
    (never "usa 40"/"usa 38"). `fixHref: null` — no correction screen
    exists for this specific gap yet (see below).
  - **`export-schema.ts`**: `finalidadTecnologiaSalud`/`causaMotivoAtencion`
    switched from `nullableString` to the existing `requiredString`
    helper (`exactLength: 2` unchanged) for both Consulta and
    Procedimiento — no new helper, no catalog-value validation added
    (still structural-only, unchanged scope).
  - **New encounters**: already protected, unchanged — `getEncounterFinalizeBlockers`
    (dashboard/encounter-finalize-readiness.ts, previous checkpoint)
    already requires both before "Finalizar atención," so a NEW
    encounter can never reach either readiness check.
  - **Historical finalized encounters** with a null Finalidad (or, for a
    consulta, a null Causa): now genuinely blocked — `/rips` readiness
    reports "no listo" with an actionable per-service message, RIPS
    generation is refused
    (`export-actions.ts`'s existing `if (!readiness.ready)` gate, already
    checked before the generator ever runs — no change needed there),
    and the runtime schema would independently reject a null value here
    too as defense-in-depth if one somehow reached it. **No backfill, no
    UPDATE, no RPC, no historical-correction UI built in this
    checkpoint** — a historical encounter caught by this stays blocked
    until a future, explicitly-scoped correction mechanism exists (same
    "stay in `/rips`, group by natural key, fail closed" shape as RIPS
    #6D/#A4B, not yet built for this specific gap). MUV/SISPRO official
    validation remains unattempted regardless (see RIPS #6A).
  - Generator (`export-generator.ts`) and its own DTO types
    (`export-types.ts`) are **unchanged** — both readiness and schema
    already suffice for fail-closed behavior, confirmed by `tsc --noEmit`
    staying clean with no type changes; the generator still simply passes
    `service.finalidadCode`/`causaMotivoCode` through, it just never runs
    for a blocked encounter anymore.
- **RESOLVED (2026-09-21) — focused, clinically-authorized correction for
  the historical Finalidad/Causa gap the bullet above blocks on.**
  Read-only design audit first (same date), then implemented: a new
  `correct_encounter_service_rips_field(p_service_id, p_field, p_value)`
  RPC (migration `20260921100000`, applied to remote, `supabase migration
  list` confirmed local = remote) is the one sanctioned write path —
  `NULL -> explicit value` only for `encounter_services.finalidad_code`
  (Consulta or Procedimiento) or `causa_motivo_code` (Consulta only,
  rejected structurally for a Procedimiento), never a replace/overwrite,
  even when the requested value matches what's already there. Mirrors
  `correct_finalized_encounter_rips_gaps` (#6D)'s "fill missing, never
  overwrite" mutation shape and `apply_confirmed_specialty_rips_service_to_encounter`
  (A4B)'s append-only-audit-table convention (new sibling table
  `encounter_service_rips_field_corrections` — `field`/`previous_value`/
  `new_value`/`corrected_by`/`corrected_at`, zero client grants, RPC is
  sole writer) — but **deliberately diverges from both on authorization**:
  gated by `is_active_clinical_professional(clinic_id)` (an active
  dentist, or a clinic_admin who is ALSO clinically active — never a
  purely administrative clinic_admin, never an assistant, never platform
  Superadmin by virtue of being Superadmin), not the relaxed
  clinic_admin-only gate #6D/A4B use for their own genuinely
  administrative fields. Reasoning: Finalidad/Causa's normal
  pre-finalization write path already requires this same gate
  (`upsert_patient_clinical_encounter`), and CLAUDE.md itself calls
  Finalidad "a real clinical decision" — see the design audit's own
  `CLINICAL AUTHORIZATION DECISION REQUIRED` verdict for the full
  reasoning. Never requires the encounter's original attending
  professional — clinical write authority in this schema is clinic-scoped
  (any active clinical professional of the clinic may correct any
  patient's data), not professional-scoped, same rule
  `is_active_clinical_professional()` already enforces everywhere else.
  No DT1 Finalidad↔Causa cross-validation engine was built — the RPC
  validates field name, service-type eligibility, catalog membership
  (`RIPSFinalidadConsultaVersion2`/`RIPSCausaExternaVersion2`,
  `status = 'active'`, same convention as every other reference-catalog
  check in this schema) and missing-only semantics; that engine doesn't
  exist anywhere in this codebase and building it stayed explicitly out
  of scope.
  - **UX**: `/rips`'s own pendientes list now routes
    `SERVICE_FINALIDAD_MISSING`/`CONSULTATION_CAUSA_MOTIVO_MISSING`
    "Corregir" to a new focused modal (`CompleteEncounterRipsFieldModal`),
    grouped by `encounter_id` for context (`encounter-rips-field-gaps.ts`)
    but mutating one service/field/explicit-value at a time — never a
    batch, never "aplicar a todos." Only a field still missing is ever
    shown as editable (`encounter-rips-field-gap-data.ts` re-derives
    current values fresh from the DB at modal-open time, never trusting
    the readiness snapshot for that). Options come from the same
    `getActiveReferenceValues("RIPSFinalidadConsultaVersion2"/
    "RIPSCausaExternaVersion2")` the real clinical encounter screen
    already uses — fetched once in `/rips/page.tsx`, never hardcoded,
    never re-fetched per modal open. Each save independently refreshes
    readiness in place (the pendiente disappears without leaving `/rips`
    or reloading); the modal itself stays open until the admin closes it,
    since one encounter can have several independent gaps.
  - **Clinic Admin without clinical capacity**: can still open the modal
    and see the full context/blockers (never hidden) — the mutation
    controls are replaced by an honest inline message ("Esta corrección
    requiere un profesional clínico activo de la clínica") instead of a
    button that would only fail. `canCorrect` is resolved server-side,
    fresh on every open, via the SAME `canEditClinicalData()` helper
    (`src/features/patients/clinical-permissions.ts`) that already mirrors
    `is_active_clinical_professional()` elsewhere in this codebase —
    reused, not reinvented, and never a role name/localStorage guess.
  - **Non-admin dentist: RESOLVED (2026-09-21) — see its own bullet below.**
    Was a functional limitation when this correction shipped (no surface
    existed for her to reach the already-correct RPC outside `/rips`) —
    closed by reusing Historia Clínica's own Atenciones tab instead of
    widening `/rips`, no DB/RPC change needed.
  - **Audit trail**: recorded (`encounter_service_rips_field_corrections`)
    but has **no query UI yet** — same deliberate deferral A4B's own audit
    table already made ("add a scoped SELECT policy in a later, separate
    migration if/when a real 'historial de correcciones' screen is
    actually built"). History/PDF/`/portal/historia` read the corrected
    `encounter_services` value directly, same as any other field — no
    change needed there, and no correction-history surfacing was added to
    any of them in this checkpoint.
  - SQL regression test (`supabase/tests/correct_encounter_service_rips_field.test.sql`)
    covers success (dentist + clinically-active clinic_admin, both
    fields, audit-row shape), authorization (purely administrative
    clinic_admin, assistant, cross-clinic dentist — all rejected), and
    safety (not-finalized, already-set with same/different value,
    unsupported field, nonexistent/superseded catalog code,
    causa-on-procedure) — **NOT RUN locally**, no Postgres/Docker in this
    dev environment, same caveat as every other SQL test in this file.
    Migration applied and confirmed in sync regardless.
- **RESOLVED (2026-09-21) — non-admin dentist historical Finalidad/Causa
  correction surface: Historia Clínica → Atenciones.** No migration, no
  new RPC, no new route, no `/rips` change. `/pacientes/[id]/historia-clinica`
  already allowed `clinic-admin`/`dentist`/`assistant` and already loads
  every finalized encounter's full service list
  (`encounterClinicalData`, `EncounterServiceRecord.finalidadCode`/
  `causaMotivoCode` already present) — the gap was purely UI/routing, not
  backend, confirmed by a read-only design audit first (same date).
  - **Gap detection**: `hasRipsFieldGap()`/`shouldShowRipsFieldGapIndicator()`
    (new, `src/features/patients/encounter-service-rips-field-gap.ts`) —
    pure functions over already-loaded data, zero new query, zero
    monthly-readiness call. Same DT1 rule as `export-readiness.ts`'s own
    `SERVICE_FINALIDAD_MISSING`/`CONSULTATION_CAUSA_MOTIVO_MISSING` (kept
    as its own small neutral module rather than importing that file,
    which operates on a differently-shaped readiness-error input).
  - **Visibility**: an "Información RIPS incompleta" / "Completar"
    indicator renders per finalized encounter ONLY when `canEditClinicalData`
    is true (an active dentist, or a clinic_admin who is also clinically
    active — the same `canEditClinicalData()`/`is_active_clinical_professional()`
    mirror this screen already resolves server-side for every other
    clinical-write decision) AND at least one service has a gap. Option
    B, not C: an Assistant or a purely administrative Clinic Admin never
    sees it at all, not even disabled — deliberately different from
    `/rips`'s own "never hide the blocker" choice, since Historia is
    shared with a role that has no stake in RIPS compliance.
  - **Modal reuse**: `CompleteEncounterRipsFieldModal` (unchanged
    component) opens with the encounter's id — zero duplication. Its own
    `fetchEncounterRipsFieldGapContextAction` gate widened from
    `clinic_admin`-only to `clinic_admin` OR `dentist` (never `assistant`
    — no real consumer needs it) — a minimum-privilege READ relaxation
    only; `correctEncounterServiceRipsFieldAction` (the mutation) already
    gated on `canEditClinicalData()`, needed no change; the RPC's own
    `is_active_clinical_professional()` gate is unchanged and remains the
    real security boundary either way. The modal still re-fetches fresh
    context from the DB every time it opens (unchanged) — client-side gap
    detection only ever decides whether to show the CTA, never what's
    actually still missing at save time, so a field corrected in another
    session can never be edited again from stale client state; the RPC's
    own "already set" guard is still the last line of defense regardless.
  - **Local refresh**: `applyRipsFieldCorrection()` (same new module) —
    an immutable, targeted update to `AtencionesTab`'s own local copy of
    `encounterClinicalData` (seeded once from the server prop, same
    ownership convention its parent screen already uses for
    medicalHistory/toothFindings/etc.) after each successful field save.
    No full page reload, no readiness refresh, no full History refetch —
    the indicator disappears in place once every gap on that encounter is
    resolved; a sibling still-missing field or a different service's own
    gap is untouched.
  - Reused unchanged: `getActiveReferenceValues("RIPSFinalidadConsultaVersion2"/
    "RIPSCausaExternaVersion2")` (fetched once in `historia-clinica/page.tsx`,
    same pattern as `/rips/page.tsx`), `CompleteEncounterRipsFieldModal`,
    `correctEncounterServiceRipsFieldAction`, the RPC, its audit table.
  - **`/rips` confirmed unchanged**: `allowedRoles={["clinic-admin"]}`
    untouched; no dentist added to RIPS navigation, monthly readiness,
    export, or MUV history.
  - The Patient Portal's own `/portal/historia` reuses the SAME
    `AtencionesTab` (see this file's Patient Portal section) — passes
    `canEditClinicalData={false}` explicitly, same convention as every
    other write-capable prop that screen already forces off for a
    Patient — so this indicator can never appear there.
- **RESOLVED (2026-09-21) — historical finalized encounter missing
  principal diagnosis correction.** Same shape as the Finalidad/Causa
  correction directly above, extended to
  `ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING` (export-readiness.ts,
  unchanged): a new `add_missing_finalized_encounter_principal_diagnosis(
  p_encounter_id, p_cie10_code, p_diagnosis_type_code)` RPC (migration
  `20260921110000`, applied to remote, `supabase migration list`
  confirmed local = remote) is the one sanctioned write path — **add-only**
  (fills an encounter that currently has NO principal diagnosis at all,
  in any scope; rejects a second attempt outright, never an overwrite/
  replace), **finalized-only**, gated by
  `is_active_clinical_professional(clinic_id)` (same tier as the
  Finalidad/Causa RPC, same reasoning: a principal diagnosis is
  unambiguously real clinical content, never the relaxed
  clinic_admin-only gate #6D/A4B use for their own administrative
  fields), never requires the encounter's original attending
  professional, never references `is_platform_superadmin()`. CIE-10
  validated against `diagnosis_catalog` and `diagnosis_type_code` (when
  provided) against `RIPSTipoDiagnosticoPrincipalVersion2` — the exact
  same two checks `upsert_patient_clinical_encounter` already performs
  for the same fields, never a stricter/looser rule. `diagnosis_type_code`
  is never inferred or defaulted — **not even for Z012**, per this
  session's own regulatory finding (no defensible official mapping
  exists) — it stays nullable at the RPC/table level, required only in
  the UI when the encounter has a consultation-classified service
  (mirroring `CONSULTATION_DIAGNOSIS_TYPE_MISSING`'s own condition).
  New append-only audit table `encounter_principal_diagnosis_corrections`
  (`clinic_id`, `encounter_id`, `encounter_diagnosis_id` FK to the row it
  created, `cie10_code`, `diagnosis_type_code`, `corrected_by`,
  `corrected_at`) — zero client grants, RPC is sole writer, no query UI
  yet (same deliberate deferral as every other correction audit table).
  - **Selector reuse**: the CIE-10 dental-first search/browse config
    (Frecuentes → Examen odontológico → Odontología → Todos, explicit
    typed-search expansion) was extracted from
    `real-clinical-encounter-screen.tsx` into a new shared module
    (`src/features/rips/diagnosis-search-config.ts`) so this correction
    surface reuses the EXACT same behavior instead of a second, drifting
    copy — the real clinical encounter screen itself now imports from
    this shared module too, no behavior change there.
  - **UX**: same "Información RIPS incompleta" / "Completar" indicator
    Historia Clínica's Atenciones tab already shows for Finalidad/Causa
    now also covers a missing principal diagnosis — one shared indicator,
    two independent gap kinds; missing principal is checked and resolved
    FIRST when both apply to the same encounter (the more fundamental
    gap), Finalidad/Causa surfaces on a subsequent "Completar" click if
    still needed. New focused modal
    (`CompleteEncounterPrincipalDiagnosisModal`) — single-shot (unlike the
    multi-field Finalidad/Causa modal, it auto-closes on success, since
    there's nothing else to complete for this one gap), re-fetches fresh
    context from the DB on every open (same "never trust stale client
    state" property), never shows an already-populated principal as
    editable.
  - **`/rips` reuse, no widening**: the same RPC/modal is reachable from
    `/rips`'s own pendientes list for a `clinic_admin` who is ALSO
    clinically active — `allowedRoles={["clinic-admin"]}` on
    `/rips/page.tsx` is unchanged; no dentist was added to `/rips`, its
    navigation, monthly readiness, export, or MUV history. A dentist
    non-admin uses Historia Clínica only, same as the Finalidad/Causa
    precedent.
  - **Read-gate reuse**: `fetchEncounterPrincipalDiagnosisGapContextAction`
    uses the same minimum-privilege `clinic_admin` OR `dentist` read gate
    (never `assistant`) as `fetchEncounterRipsFieldGapContextAction` —
    write capability (`canCorrect`) still comes exclusively from
    `canEditClinicalData()`.
  - SQL regression test
    (`supabase/tests/add_missing_finalized_encounter_principal_diagnosis.test.sql`)
    covers success (active dentist, encounter-wide insert, audit-row
    shape), authorization (purely administrative clinic_admin, assistant,
    cross-clinic dentist — all rejected), safety (not-finalized,
    already-has-principal, invalid CIE-10, invalid diagnosis type, a
    pre-existing related diagnosis left untouched) — **NOT RUN locally**,
    no Postgres/Docker in this dev environment, same caveat as every
    other SQL test in this file. Migration applied and confirmed in sync
    regardless.
  - No backfill: a historical encounter this RPC hasn't been used on yet
    stays exactly as blocked as before.
- **RESOLVED (2026-09-21) — dental CIE-10 scope, versioned/auditable.**
  The hardcoded `{Z012} ∪ K00–K14` range (`isInDentalPriorityScope()`,
  removed) is now a real, versioned table:
  `public.diagnosis_dental_scope` (migration `20260921120000`, applied to
  remote, `supabase migration list` confirmed local = remote) —
  `classification_system`, `code`, `source`, `version_label`, `status`,
  timestamps. No FK into `diagnosis_catalog.id` (that table's real key is
  `(classification_system, code, version_label)` — the same code
  legitimately repeats across catalog versions, same reasoning
  `rips_reference_values` already uses for its own `catalog_key`/`code`
  pair). Global reference data, same `*_select_authenticated` RLS as
  `diagnosis_catalog`/`cups_catalog` — no INSERT/UPDATE/DELETE grant to
  `authenticated`/`anon` at all, deny-by-default.
  - **Conservative initial seed, nothing more than what was already
    prioritized**: `Z012` + every currently ACTIVE CIE10 code in
    `[K00, K15)`, derived directly FROM `diagnosis_catalog` at migration
    time (never a hand-typed code list). Deliberately NOT the broader
    ~28/~135-code territorial (Bogotá SDS) list from prior audits — no
    sufficiently concrete, citable provenance exists in this repo for
    each individual inclusion; widen later via a new, separately-
    provenanced migration, never by silently editing this seed. Every
    seeded row's own `source` text says explicitly "Odentia dental search
    scope — UX navigation priority only, never an official/exhaustive
    Ministerio de Salud list, never a RIPS validation rule, never a
    clinical recommendation."
  - **`export-readiness.ts`/`export-schema.ts`/RIPS validation:
    completely untouched** — `codDiagnosticoPrincipal` still validates
    against `diagnosis_catalog` directly, exactly as before; this table
    is never referenced by any RIPS write/validation path. **Full catalog
    always available**: a code not in `diagnosis_dental_scope` remains
    fully selectable via "Todos los diagnósticos" or general search — no
    write/validation path was narrowed by this change, only the
    dental-first navigation UX.
  - **`searchDiagnoses()`** (`catalog-data.ts`): `dentalOnly` now fetches
    the current active scope codes (`fetchDentalScopeCodes`, one plain
    read, no RPC) and filters with `.in('code', scopeCodes)`, replacing
    the hardcoded `.gte('K00').lt('K15')`/`.or(...)` range logic. The
    `includeExamenOdontologico` parameter was removed entirely — Z012 is
    now simply a natural member of the seeded scope, so typed dental
    search surfaces it with no separate flag; the empty-focus "Examen
    odontológico" PINNED section (`EXAMEN_ODONTOLOGICO_CODE`,
    `fetchExamenOdontologicoAction`) is unchanged, still a distinct
    ordering/UX decision about one code, deduplicated client-side
    against the "Odontología" browse exactly as before.
  - **Z012 `tipoDiagnosticoPrincipal`**: unchanged, per the closed
    regulatory decision (`KEEP MANUAL — no regulatory default`) — not
    re-investigated or modified in this checkpoint.
  - `isInDentalPriorityScope()` and its dedicated test file
    (`catalog-data.test.ts`) were removed — the boundary is now 100% data,
    nothing left to shadow-characterize in pure JS. New SQL regression
    test (`supabase/tests/diagnosis_dental_scope.test.sql`) re-exercises
    the exact seed SELECT/INSERT shape against isolated QA fixture data
    (a fake `classification_system` so it never depends on or collides
    with real catalog content) — Z012 included, active K00–K14 included,
    out-of-range/inactive/unrelated/merely-adjacent codes excluded, seed
    re-run is idempotent — **NOT RUN locally**, no Postgres/Docker in
    this dev environment, same caveat as every other SQL test in this
    file. Migration applied and confirmed in sync regardless.
- **RESOLVED (2026-09-21) — export-schema nullable-field audit beyond
  Finalidad/Causa, against the real DT1 v003 text.** A focused re-audit of
  every remaining `nullableString(...)` call in `export-schema.ts`
  (Usuario/Consulta/Procedimiento), classified `CORRECTLY NULLABLE` /
  `TOO PERMISSIVE` / `AMBIGUOUS` against DT1 v003's §1.5 Tamaño rule (a
  bare fixed size never admits null; an explicit "0," prefix does).
  - **`TOO PERMISSIVE`, fixed — `modalidadGrupoServicioTecSal`** (Consulta
    `C05`/Procedimiento `P07`): DT1 Tamaño is a bare "2", not variable —
    this corrects an incorrect claim made in an earlier checkpoint (and
    still in `CLAUDE.md` until this same checkpoint, see below) that it
    was variable-size. Safe to enforce because every service-creation
    site (`real-clinical-encounter-screen.tsx`) already hardcodes `"01"`
    with no manual selector — there is no live path that could produce a
    null here for a NEW encounter. `export-schema.ts` now
    `requiredString(..., {exactLength:2})`; `export-readiness.ts` gained
    a new `SERVICE_MODALIDAD_MISSING` blocker (mirrors the existing
    Finalidad check) so a historical encounter missing it is readiness-
    blocked before generation, never silently rejected only at schema
    time.
  - **`TOO PERMISSIVE`, fixed — Usuario `codPaisOrigen`** (`U11`): DT1
    Tamaño is a bare "3", not conditional — tightened to
    `requiredString({exactLength:3})`. `export-readiness.ts` gained
    `PATIENT_COUNTRY_ORIGIN_MISSING`; `ExportReadinessPatient` and
    `toExportReadinessPatients()` (`export-data.ts`) now carry
    `countryOfOriginCode` (the raw read already existed, it just wasn't
    threaded into the readiness-facing shape). Note: `completeness.ts`
    (a separate, non-blocking "identity completeness" helper, not
    modified here) still carries the same incorrect assumption in its own
    comments — a second place this should eventually be corrected, out of
    this checkpoint's scope.
  - **`TOO PERMISSIVE`, fixed — Usuario `codMunicipioResidencia`/
    `codZonaTerritorialResidencia`** (`U09`/`U10`): DT1 makes both
    required only when `codPaisResidencia = "170"` (Colombia) — were
    unconditionally nullable before. `export-schema.ts` now branches on
    `codPaisResidencia`: `requiredString` for Colombia, `nullableString`
    otherwise (this pair was already readiness-blocked for the Colombia
    case via existing `PATIENT_*_MISSING` checks — no new readiness code
    needed).
  - **`AMBIGUOUS`, left unchanged — `conceptoRecaudo`** (Consulta `C18`/
    Procedimiento `P17`): a real, cited conflicting claim already exists
    in this file's own DT1 §1.8 cross-validation notes; not resolved here
    per the checkpoint's explicit instruction to leave `AMBIGUOUS` fields
    untouched.
  - **`CORRECTLY NULLABLE`, unchanged — `codDiagnosticoRelacionado*`**:
    DT1 Tamaño carries an explicit "0," option — genuinely optional,
    confirmed, no change.
  - **`TOO PERMISSIVE` at the time, since RESOLVED for two of the three
    fields (2026-09-21) — `grupoServiciosCode`/`codServicioCode`/
    `viaIngresoServicioSalud` (manual-CUPS gap)**: see the dedicated
    "Manual CUPS Grupo/Servicio RIPS gap" entry below for the closure —
    `viaIngresoServicioSalud` alone remains a genuine, deliberately
    unresolved pending item (no safe derivation exists anywhere in this
    codebase for it, concept-based or manual).
  - QA: `npx tsc --noEmit` clean; `npx vitest run src/features/rips
    src/features/dashboard src/features/patients` — 415/415 passed
    (fixtures updated: `readyPatient()` gained `countryOfOriginCode`,
    `baseService()`'s default `modalidadCode` changed from `null` to
    `"01"` since `null` now fails the new blocker); `eslint` on all four
    changed files clean; `git diff --check` clean. No migration — nothing
    in this checkpoint touched the database, only JS validation/readiness
    logic.
- **RESOLVED (2026-09-21, partial) — Manual CUPS Grupo/Servicio RIPS gap
  closed; Vía Ingreso remains a real, documented pending item.** Root
  cause (confirmed by direct code inspection, not re-derived from DT1):
  `addService()` (manual CUPS, `real-clinical-encounter-screen.tsx`)
  never called any Grupo/Servicio resolution at all — it left
  `grupoServiciosCode`/`codServicioCode` as empty strings unconditionally,
  unlike `addConceptService()`, which already resolved them via
  `resolveClinicSpecialtyRipsService()` (`clinical-service-resolution.ts`,
  pure, keyed ONLY by the attending professional's specialty — never by
  CUPS code, never by `clinical_cups_mappings`, never
  `specialty_rips_service_defaults`).
  - **Fix**: `addService()` now calls that exact same pure function on
    creation — Manual CUPS and the concept picker share one resolution
    path end to end, never two divergent ones. When the clinic hasn't
    confirmed a Servicio RIPS for that specialty yet, both paths
    correctly leave the fields empty (never a global-default fallback,
    never invented) — same intentional "administrative gap never blocks
    clinical truth" precedent `resolveClinicSpecialtyRipsService()`'s own
    comment already documents.
  - **Readiness widened**: `export-readiness.ts`'s
    `RIPS_SERVICE_CONFIGURATION_MISSING` no longer requires
    `clinicalConceptId` truthy — it now fires for ANY service (concept-
    based or manual) still missing `codServicioCode`, since both paths
    now fail for the exact same reason (clinic hasn't confirmed the
    specialty's Servicio RIPS). A historical manual-CUPS row missing these
    fields is now readiness-blocked before export, same as a historical
    concept-based one always was.
  - **A4B correction widened to match**: `apply_confirmed_specialty_rips_service_to_encounter()`
    (migration `20260921130000`, applied to remote, `supabase migration
    list` confirmed local = remote) dropped its own
    `clinical_concept_id is not null` eligibility condition — a
    historical manual-CUPS row on an already-finalized encounter can now
    be corrected the exact same way a concept-based one always could,
    once the clinic later confirms the specialty. Every other rule
    (fail-closed atomicity, Case A/B/C resolution, audit trail,
    `clinic_admin`-only authorization) is unchanged verbatim.
    `encounter-rips-service-gap-data.ts` (the "Completar Servicio RIPS"
    modal's own read) had the identical `.not("clinical_concept_id", "is",
    null)` filter, widened the same way.
  - **`export-schema.ts` tightened**: `grupoServicios`/`codServicio`
    (Consulta C06/C07, Procedimiento P08/P09) — `nullable → required` on
    both. Safe now that both write paths share one resolution and
    readiness covers both paths equally; a genuinely-missing value fails
    closed at readiness, never reaches this schema check for a NEW
    encounter.
  - **`viaIngresoServicioSalud` (P06) stays nullable — genuine pending
    item, not fixed here.** Investigated per this checkpoint's own
    Section 3: no rule anywhere in this codebase — concept-based or
    manual — derives this value automatically; even `addConceptService()`
    leaves it blank by default (`viaIngresoCode: ""`), only ever set
    through the manual "Detalles RIPS" `<select>`. Unlike Modalidad
    (safely defaultable to "01" because Odentia only supports intramural
    care — a structural fact, not a per-visit decision), "¿por qué vía
    ingresó el paciente?" is a genuine per-visit clinical/administrative
    decision with no safe universal default. Per this checkpoint's own
    instruction, this was NOT invented — `export-schema.ts`/
    `export-readiness.ts`/finalize readiness are all unchanged for this
    one field. **The one concrete blocker left before "ready for first
    official MUV/SISPRO validation"**: decide, with the regulatory/
    clinical stakeholder, either (a) a real, defensible default for
    Odentia's own care model, or (b) a UI requirement to pick it before
    finalizing — then implement readiness + schema together, same
    two-layer pattern as every other field closed so far.
  - QA: `npx tsc --noEmit` clean; `npx vitest run src/features/rips
    src/features/dashboard src/features/patients` — 416/416 passed
    (`export-readiness.test.ts` fixtures updated: `baseService()`'s
    default `grupoServiciosCode`/`codServicioCode` changed from `null` to
    non-null values since `null` now unconditionally fails
    `RIPS_SERVICE_CONFIGURATION_MISSING`; the old "never flags a legacy
    manual-CUPS service" test inverted to assert the opposite, matching
    the new behavior); `eslint` clean on all changed files; `git diff
    --check` clean. SQL regression test
    (`supabase/tests/apply_confirmed_specialty_rips_service_to_encounter.test.sql`)
    updated so its own manual-CUPS fixture service is now asserted
    CORRECTED (previously asserted untouched) — **NOT RUN locally**, no
    Postgres/Docker in this dev environment, same caveat as every other
    SQL test in this file. Migration applied and confirmed in sync
    regardless.
- **Explicitly not built yet (future phase)**: MUV integration, CUV
  generation/inference, ProcesoId auto-capture, submission states beyond
  a manually-recorded result, retries/polling, FEV/DIAN, glosas, SIIFA.
  Also pending: `viaIngresoServicioSalud` (above) — the one remaining
  material item before "first official MUV/SISPRO validation" becomes
  the sole remaining regulatory-pilot milestone.

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
