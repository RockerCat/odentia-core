# CLAUDE.md

# Odentia Core

This file defines how Claude should work on this repository.

It intentionally avoids project vision, business decisions and current development status.
Those documents live in:

- PROJECT_IDENTITY.md
- PROJECT_STATUS.md
- README.md

Always read those files before implementing any feature.

---

# Development Philosophy

Odentia is built following an MVP-first philosophy.

The objective is to validate ideas with real users as quickly as possible.

Always prioritize:

- simplicity
- readability
- maintainability
- development speed

Avoid premature optimization.

Avoid overengineering.

Avoid unnecessary abstractions.

If a simple solution solves the current problem, prefer it.

---

# Project Principles

Always preserve these principles.

## SaaS First

Odentia is a SaaS platform.

Marketplace is a complementary module.

Never design the platform around Marketplace.

---

## Platform Independence

Odentia must continue operating even if Marketplace is unavailable.

Never introduce mandatory dependencies on Marketplace.

---

## Marketplace Independence

Marketplace is an independent product.

Assume it may:

- run on another server
- use another database
- use another technology stack
- be maintained by another team

Communication must happen through public APIs only.

Never access Marketplace databases directly.

Never share business logic.

Core is the single authority for identity, registration, membership, and
clinic. Marketplace consumes that identity through SSO and never creates a
parallel customer account of its own.

---

## Single User Experience

Although technically separated, users must perceive a single product.

Maintain a consistent:

- visual language
- navigation
- components
- branding
- UX

---

# Architecture

Unless explicitly instructed otherwise:

- Feature-first architecture.
- Server Components by default.
- Client Components only when necessary.
- Strict TypeScript.
- Clean folder organization.
- Avoid unnecessary global state.

Auth is fully real (Supabase Auth), not a partial conversion: login/logout,
forgot/reset password, onboarding (`/registro`), and both staff and Patient
invitations (real tokens, real acceptance flows) all run against real
Supabase Auth + Postgres. Lives in `src/features/session/` —
`resolveClinicContext()` (staff) and `resolvePatientContext()` (Patient)
are the two single sources of truth for "who is this real user, and
what's their clinic/role/professional-profile (or patient/clinic)
context." Every real feature derives permissions from one of these,
server-side, never from the legacy mock session below. There is no
automated email/WhatsApp/SMS/push anywhere in this codebase — every
invitation is a real, tokenized link an admin/assistant copies and shares
manually (see Communications below); never claim or build toward an
"enviado" state that isn't true.

`proxy.ts` also recovers a stray PKCE `code` landing on `/` — a
defense-in-depth safety net for when a confirm-signup email's
`redirect_to` doesn't propagate — by forwarding it server-side to
`/auth/confirm` with a hardcoded, never-externally-supplied
`next=/registro`; never a second PKCE exchange implementation. Confirm
Signup/Reset Password/Equipo-invitation/Patient-invitation emails are all
Real-E2E-verified in production to preserve their own real destination
through email confirmation — see PROJECT_STATUS.md's "REAL E2E
STABILIZATION" checkpoint.

`proxy.ts`'s clinic-path gate also distinguishes a genuinely new,
unlinked account from an authenticated, linked Patient: a Patient with no
staff clinic membership hitting a staff-only route (direct URL, hard
refresh, bookmark) is redirected to `/portal`, never `/registro`'s
onboarding wizard — `/registro` stays reserved for someone who is
actually neither staff nor a linked Patient.

`/registro`'s own reentry check (`decideRegistroReentry()`,
`src/features/onboarding/api.ts`) sends an authenticated user who already
has an active clinic membership straight to `/agenda` — the same
destination `decideAuthenticatedRedirect()` uses for the identical
condition at `/login` — never a dead-end screen with no way back into the
product short of signing out and logging back in. `/registro` also
exposes its own "Cerrar sesión" (`decideAfterSignOut()`, same file) for
the mid-onboarding case: a real, active session that simply belongs to
the wrong account.

`resolveSafeNext()` (`src/app/auth/confirm/resolve-safe-next.ts`) trusts
exactly one different-origin redirect target beyond the confirm request's
own origin: `http://localhost`/`http://127.0.0.1` (any port, exact
hostname match, `http` only — never a substring/subdomain trick). This
exists because a Confirm Signup email's link always executes on Supabase's
Site URL (one global setting) regardless of where signup started, so a
signup begun on localhost against the shared dev/prod project still has
its token exchange happen on production. The exception only gets the
browser back to the right origin — it does NOT restore the session there
(cookies never cross domains); a normal password login re-establishes a
real local session from that point. Never widen this beyond loopback.

The real resolved clinic role (never name/avatar) is also bridged into
the legacy mock `src/features/auth/session.ts` / `RoleContext` store
(`src/features/session/role-bridge.ts`), so the small set of screens
still on Phase 1 mock data (Configuración's secondary preference
sections, `/admin`, `/suscripcion` — see PROJECT_STATUS.md's "OUT OF
SCOPE ACTUAL"/"PARCIAL" for the current, short list) keep working
unmodified. Do not scatter session logic into feature folders. `src/dev/`
(role switcher, mock dentist resolver) is a separate, disposable dev-only
shim, still used by those remaining mock screens — never a source of
authorization for a real feature, and not yet safe to delete. Any
component that shows a real user's NAME/avatar must read
`useShellIdentity()` (`src/components/shell/use-shell-identity.ts`), the
real-overlay hook Header/`PatientsGreeting`/`Greeting` all use — never the
raw mock `useAuthenticatedIdentity()` alone, since the bridge above never
carries name/avatar into the mock session (a real bug once: `/agenda`'s
own greeting showed a fixed mock name for every real user until this was
fixed).

There are two shells: `AppShell` (clinic roles — Superadmin, Clinic Admin,
Dentist, Assistant) and `PortalShell` (Patient only, its own simpler nav —
see Roles below). Both share one role-gating hook,
`src/components/shell/use-route-guard.ts`; add new gated routes through it
rather than duplicating auth-redirect logic per shell.

`/portal/historia` (`PatientMedicalRecordScreen`) is a real, read-only
view of the exact same expediente `/pacientes/[id]/historia-clinica`
reads/writes — a new Portal-specific outer shell (own header, no "Volver a
Pacientes"/"Descargar PDF"), but every tab body is the SAME real component
staff uses (`ResumenTab`/`AntecedentesTab`/`OdontogramaTab`/
`AtencionesTab`/`DocumentosTab`/`ClinicalAlerts` from
`src/features/patients/`), always called with `canEdit`/
`canEditClinicalData`/`canUpload = false` — the same shape Assistant
already gets today, never a second read-only code path. This is the
model for reusing a staff clinical component from the Portal: reuse the
leaf presentational/data pieces, never the staff-only outer shell, and
never widen a write affordance — every clinical write RPC already
requires `is_active_clinical_professional()`, which a Patient can never
pass regardless of what a prop shows.

The real Agenda lives under `src/features/dashboard/real-*`
(`RealAgendaScreen`/`RealAppointmentsBoard`/`RealAppointmentDetailModal`/
`RealNewAppointmentModal`/`RealSummaryCards`) — separate, distinctly-named
components from the still-mock ones they were ported from; never share one
between a converted real consumer and a still-mock one. "Iniciar/Continuar
atención" moves a Cita to `in_progress` and opens
`/agenda/atencion/[appointmentId]` (`RealClinicalEncounterScreen`), a real
routed port of the approved clinical-encounter design, keyed by the
appointment id so a refresh reconstructs it from Postgres rather than
client state. "Finalizar atención" always persists the encounter
(`public.patient_clinical_encounters`, linked 1:1 to its Cita via a unique
`appointment_id`) before marking the Cita `completed`, never the reverse.

**"Servicios realizados" (`encounter_services`) is the single write path
for what happened in an atención.** It replaced the legacy free-text
"Procedimientos realizados" (`patient_clinical_encounter_procedures`),
which is now read-only history: `RealClinicalEncounterScreen` seeds
`procedures` once from `existingProcedures` and renders it, when non-empty,
as a read-only "Procedimientos realizados (histórico)" section — no
add/edit/remove UI remains for it, and no new atención ever writes to it.
Every service row gets Modalidad auto-resolved to `"01"` at creation (no
manual selector); Finalidad and, for a consultation, Causa/Motivo are both
required with no universal default — a real clinical decision, never
inferred from `ripsServiceType` alone. The ONE confirmed regulatory
relationship (`finalidad-causa.ts`, `resolveCausaOnFinalidadChange`):
selecting Finalidad "Valoración integral para la promoción y
mantenimiento" sets Causa/Motivo to `"40"`; moving away from that
Finalidad clears a still-`"40"` Causa without inferring `"38"` or any
other value; every other Finalidad infers nothing, and the relationship
depends on Finalidad only, never on the diagnosis (Z012 or otherwise).
Known, not-yet-resolved limitation: this cannot distinguish a `"40"` the
professional picked manually from one this logic derived, so leaving that
Finalidad can clear a manually-chosen `"40"` too. All of this lives
directly in the "Servicios realizados" card flow, not tucked in the
"Detalles RIPS" accordion. **Modalidad** stays regulatorily optional for
RIPS export readiness (DT1 v003 declares it a variable-size field) —
`export-readiness.ts` never blocks on it. **Finalidad and, for a
consultation, Causa/Motivo are NOT regulatorily optional**: DT1 v003
declares both with a bare fixed Tamaño `"2"` (§1.5's own rule for a
fixed-size field), which admits no `null` — `export-readiness.ts` enforces
this with `SERVICE_FINALIDAD_MISSING`/`CONSULTATION_CAUSA_MOTIVO_MISSING`,
and `export-schema.ts`'s runtime validation rejects a `null` value on
either as defense-in-depth. `getEncounterFinalizeBlockers` additionally
enforces, as Odentia-only, forward-only rules at "Finalizar atención"
time (so a NEW encounter can never even reach the readiness checks
above): Finalidad and (for a consultation) Causa/Motivo on every
classified service, plus a resolvable principal diagnosis (reusing
`resolveDiagnosesForService` from `export-generator.ts` — the same
resolution `/rips` itself uses to build the JSON) with
`tipoDiagnosticoPrincipal` set when that service is a consultation. Never
re-evaluates an already-finalized encounter — a historical encounter
finalized before these readiness checks existed, still missing Finalidad
or (for a consultation) Causa/Motivo, blocks `/rips` generation with an
actionable error, same as any other readiness gap. **A finalized
encounter's missing Finalidad/Causa can only ever be completed through
`correct_encounter_service_rips_field()`** (`SECURITY DEFINER`, `/rips`'s
own "Corregir" → `CompleteEncounterRipsFieldModal`) — `NULL -> explicit
value` only, never a replace/overwrite, gated by
`is_active_clinical_professional(clinic_id)` (never the relaxed
clinic_admin-only gate `correct_finalized_encounter_rips_gaps`/
`apply_confirmed_specialty_rips_service_to_encounter` use for their own
genuinely administrative fields — Finalidad/Causa are a real clinical
decision, same authority tier as the normal pre-finalization write path),
never the encounter's original attending professional specifically
(clinical write authority in this schema is clinic-scoped, not
professional-scoped), and never platform Superadmin by virtue of being
Superadmin. No backfill, no DT1 Finalidad↔Causa cross-validation engine
(that doesn't exist anywhere in this codebase — the one confirmed pairing,
promoción/mantenimiento → Causa 40, stays a client-side UX nudge only,
never enforced server-side). See RIPS section below for the
CUPS-resolution mechanics, unchanged by this consolidation. Reportes' treatment ranking
(`computeTreatmentRanking`, `src/features/reports/report-selectors.ts`)
mirrors this: structured `encounter_services` wins per-encounter, legacy
`patient_clinical_encounter_procedures` only counts for an encounter with
zero structured services, never double-counted. The Patient Portal's
`/portal/historia` reads structured services/diagnoses through the same
additive `..._select_own_via_patient_link` RLS pattern as the rest of the
expediente (finalized-only, joined through `patient_clinical_encounters`/
`patient_user_links`).

Real logout (`useShellLogout`'s `signOut()` and `/auth/logout`) is
host-aware via `isCoreProductionHostname()`
(`src/features/session/decide-logout-destination.ts`, exact-match against
`["odentia.co", "www.odentia.co"]`, never a substring/suffix check): only
on real production Core does logout federate to Marketplace's own
`/auth/logout`/home; any other host (localhost, a preview deploy) lands on
a local relative `/login` instead, never a hardcoded production URL — a
non-production visitor being silently stranded on real production was a
real regression this fixed.

The front-desk arrival flow ("Paciente llegó"/"Enviar a sala de espera")
must never be a hard PREREQUISITE for "Iniciar/Continuar atención" — it's
optional operational tracking, not a gate. `showStartEncounter` in
`RealAppointmentDetailModal` must depend only on role/time-window
(`canAttendPatients` + `canStartClinicalEncounter`); `showMarkArrived`/
`showSendToWaitingRoom` are the ones that defer to it (each gated on `!
showStartEncounter`), never the other way around — a fixed regression
(found by `qa-can-start-encounter-check.mjs`) had this backwards, which
meant a `clinic_admin`/`assistant` could never see "Iniciar atención" at
all until clicking through both arrival steps first, no matter how far
past `startsAt` the Cita already was. That silently broke CLAUDE.md's own
Primary Use Case (a solo Clinic-Admin-Dentist with no front desk) — don't
reintroduce this dependency direction.

`Solicitud de Cita` (see Appointment Lifecycle below) is a SEPARATE entity
from `Cita` and must stay one: `public.appointment_requests`, never a status
value on `appointments`. Its surfaces are the Patient Portal's
`RequestAppointmentScheduler` (`/portal/citas`, writing through
`request_my_appointment()`) and the Agenda's own `RealAppointmentRequestsCard`
— a card in the right-hand column, never a row on the board. Accepting is
`accept_appointment_request()`, one SECURITY DEFINER transaction that creates
the Cita (`scheduled`) and links it, or fails entirely and leaves the request
`pending`; `reject_appointment_request()` never creates a Cita. Read and write
scope on both sides comes from `can_access_appointment()` — the same helper
that governs the resulting Cita — so a request can never be visible or
actionable to someone who couldn't see the Cita it would become.

Reportes (`/reportes`), Pacientes, Historia Clínica (staff), Agenda,
Rooms/Treatments catalogs, Availability/Absences, and Equipo (invite/
accept/activate/deactivate — never a member-role-editing RPC, that
doesn't exist) are all real, not partial — see PROJECT_STATUS.md's "REAL
/ COMPLETO PARA MVP" for the current, authoritative list. Configuración
is a split screen: its Tratamientos/Horario/Ausencias sections are real;
its agenda-defaults/notification/regional-preference sections are still
local `useState` with no backend at all — never claim those persist
anything.

`src/components/toast.tsx` (`ToastProvider`/`useToast()`) is the one shared
primitive for ephemeral success/error confirmations — mounted once in the
root layout, available everywhere. Reuse it for any new mutation's
success/error feedback; never build a second toast/snackbar.

Real internal `<Link>`s (Sidebar, BottomTabBar, Portal nav) get a small
per-item pending indicator via `src/components/shell/nav-link-status.tsx`'s
`NavLinkContent`, built on Next's own `useLinkStatus()` — reuse it for any
new nav `<Link>` rather than a custom router-event tracker. A plain
`router.push`/`.back()` button (not a `<Link>`) instead gets a local
pending `useState` + disabled CTA, same convention as every existing one
(e.g. `patient-clinical-record-screen.tsx`'s "Descargar PDF").

---

# Multi-Tenant

Every dental practice is an isolated tenant.

Never assume data can be shared between tenants.

---

# Domain Model

This is a permanent architectural decision. It is the source of truth for the
system's domain and must be respected by every future implementation.

Odentia is a SaaS for **dental practices (Clinics)**, not for individual dentists.

## Core Entity

The **Clinic** is the system's primary entity.

Architecture, permissions, and the data model must be built around the Clinic.

Subscription, configuration, patients, schedule, orders, reports, and team all
belong to the Clinic.

Users belong to a Clinic and get their permissions through a role.

---

## Roles

### Superadmin

Represents the Odentia team.

Manages the entire platform:

- Clinics
- Plans
- Subscriptions
- Marketplace
- Global operations

**Platform/Superadmin authorization always comes from `public.platform_roles`
(role = `superadmin`), never from `clinic_memberships`, never from Supabase
`user_metadata`, and never from the mock role switcher.** A Superadmin is
never an artificial member of some clinic and never a `patient_user_links`
row — platform administration is its own, separate authorization plane.
`resolveSuperadminContext()` (`src/features/session/
resolve-superadmin-context.ts`) is the single source of truth for "is this
real Supabase user a real platform Superadmin," the same
resolver-per-identity-plane pattern `resolveClinicContext()`/
`resolvePatientContext()` already establish for Clinic/Patient. The real,
protected surface is `/platform` (`src/app/platform/`), gated in two
independent layers — `src/lib/supabase/proxy.ts`'s own private-path list,
and `/platform`'s own layout re-resolving the same real context — so a
future child route added under `/platform` is never exposed solely
because one of those two forgets it. Assigning `platform_roles` is a
deliberate, exceptional administrative operation with no self-service,
no invitation flow, and no first-user-becomes-superadmin bootstrap; a row
is inserted only by direct, out-of-band administrative action.

**Only a Superadmin can create a clinic, and a prospecto is never a
precondition for it.** Odentia's clinic-creation model is commercial/
provisioned, not self-service: a clinic may be created directly by a
Superadmin (Platform → Clínicas → Nueva clínica) with no prior prospecto
at all, or later via a prospecto's own conversion — both routes are
equally valid and neither is more "official" than the other. Both must
converge on the SAME administrative provisioning mechanism
(`provision_clinic()`, `src/features/platform/api.ts`) rather than each
implementing its own clinic/sede-principal insert logic — never a second,
diverging path to the same result. `provision_clinic()` is itself a
separate function from onboarding's own `bootstrap_clinic()` (self-
service, retained only until that path is formally retired) — never
reuse `bootstrap_clinic()` for admin-driven provisioning, since it
unconditionally makes its caller a `clinic_admin` member of the clinic it
creates, which is correct for a founder bootstrapping her own clinic but
would incorrectly enroll the Superadmin as a member of every clinic she
provisions. A clinic provisioned this way may legitimately exist with
zero members (no Clinic Admin, no team) until a separate, later
provisioning step assigns them — this is expected, not a broken state.

Because that clinic has zero members, `clinics_update_admin` (RLS) and
the `clinic-logos` Storage policies (all three gated through
`owns_clinic_logo_path()`) both carry an `or is_platform_superadmin()`
branch alongside their existing `has_clinic_role(..., ['clinic_admin'])`
check — the same widening pattern as every other Superadmin-transversal
capability in this file, never a new membership. This is what lets a
Superadmin set/change a clinic's logo (`uploadClinicLogo()`,
`src/features/clinic/logo.ts`, unmodified) for a clinic she just
provisioned, or any other clinic, from Platform, without ever becoming
its `clinic_admin`. Creation and logo upload are always two sequential
steps — provision first, then upload once a real `clinic_id` exists
(same order the onboarding wizard already uses) — and a logo upload
failure after a successful provisioning/conversion is always non-fatal:
it must never trigger re-provisioning or a second conversion attempt,
only a visible warning.

Provisioning a clinic's FIRST Clinic Admin is a separate, Superadmin-only
step from creating the clinic itself: `provision_first_clinic_admin_invitation()`
(`is_platform_superadmin()`-gated) issues a `clinic_invitations` row whose
`role` is hardcoded `clinic_admin` server-side — never a parameter — and
that carries a pre-provisioned identity (`first_name`/`last_name`/`email`/
`phone`, all required) so activation never asks this person to type her
own name. This RPC only ever bootstraps the FIRST admin of an
already-provisioned clinic (rejected if the clinic already has an active
`clinic_admin` membership, or an existing pending `clinic_admin`
invitation) — it is not, itself, a general team-invitation mechanism.

The Superadmin's real authority is broader than that one bootstrap
moment: she controls provisioning AND transversal support for any clinic
— creating it, assigning its first Clinic Admin, and later adding further
team members (Clinic Admin, Odontólogo, or Asistente) to any clinic from
Platform — without ever needing a `clinic_membership` of her own in it.
This is additive to, never a replacement for, the Clinic Admin's own
existing Equipo flow (`invite_clinic_member()`/`accept_clinic_invitation()`/
`set_clinic_member_status()`): a Clinic Admin keeps administering her own
clinic's team exactly as today, unchanged, and a Superadmin acting on that
same clinic from Platform is a second, transversal entry point into the
same underlying invitation/membership mechanism — never a second,
diverging one. That ongoing capability is `provision_clinic_team_member()`
— Superadmin-gated, `clinic_id` an explicit parameter, accepting any of
the three real roles (`clinic_admin`/`dentist`/`assistant`) with no
"first admin" guards of its own (those stay exclusive to
`provision_first_clinic_admin_invitation()` above). **Multiple
`clinic_admin` memberships per clinic are allowed by product decision**
(no schema constraint ever prevented this) — after the first admin
exists, a Superadmin may provision additional ones the same way. Every
Platform-issued invitation, regardless of role, always carries complete
pre-provisioned identity (`first_name`/`last_name`/`phone`) — this is
what `hasPreProvisionedIdentity()` (`src/features/clinic/team-actions.ts`)
actually checks for (identity completeness, never `role === "clinic_admin"`
specifically): a traditional Clinic-Admin-issued dentist/assistant
invitation (`invite_clinic_member()`) never sets these, so the check
stays a safe, structural distinction, never a heuristic. Reactivating an
existing but inactive/suspended membership, or regenerating a still-
pending invitation's link, reuse the exact same
`set_clinic_member_status()`/`regenerate_clinic_invitation()` RPCs the
Clinic Admin's own Equipo screen already uses — both now authorize either
an active `clinic_admin` of that specific clinic OR a platform
Superadmin, resolved from the TARGET row's own `clinic_id`, never a
caller-supplied one. `provision_clinic_team_member()` itself never
creates a duplicate invitation or membership: an existing active
membership for that email in that clinic is rejected outright, an
existing inactive one is rejected with a distinct message pointing at
reactivation instead, and an existing unexpired pending invitation for
that email/clinic is rejected regardless of who issued it. Same token/
hash convention as every other invitation (see Communications) — a raw
token shown exactly once, only its hash persisted, shared manually by
the Superadmin, never emailed automatically.
`/platform/clinicas/[slug]`
resolves exactly one of three states for this bootstrap moment from real
reads (never a guess): no active admin and no valid pending invitation →
assignment form; a still-pending, not-yet-expired invitation → its
read-only pre-provisioned identity, no second form; an active admin →
the general Equipo section (member roster + pending invitations +
"Agregar miembro" for any of the three roles) replaces that narrower
bootstrap card entirely — never both shown at once, so there is never a
second, competing entry point for creating the first admin. Superadmin
needs `is_platform_superadmin()` read access to
`clinic_invitations` and `profiles` for this (both otherwise scoped to a
clinic's own members) — this is a deliberate, minimal RLS widening for
Superadmin SELECT only, same pattern already used on
`clinics`/`clinic_memberships`/`professional_profiles`, never a write
widening.

Activating that pre-provisioned invitation differs by whether its email
already has a real Odentia account, but both paths still end at the SAME
`accept_clinic_invitation()` as every other invitation — the only
operation that ever creates a `clinic_memberships` row:

- A genuinely new email skips Confirm Signup entirely: she only ever
  types a password (her identity is read-only, sourced from the
  invitation); the Auth account is created and confirmed server-side via
  the Auth Admin API (`email_confirm: true`, service-role key — server-only,
  never in a Client Component or reachable from the browser bundle), a
  normal `signInWithPassword` then establishes her session, and
  `accept_clinic_invitation()` runs immediately after against that SAME
  token, in that same interaction — one gesture ("Activar mi cuenta")
  both creates her access and accepts that specific invitation, never a
  second manual "Aceptar invitación" step for this path. This Confirm
  Signup bypass exists ONLY for a pre-provisioned Platform invitation —
  clinic_admin, dentist, or assistant alike (the secret token itself is
  the proof of legitimate access) — never disable Confirm Email globally,
  and never skip it for the normal public `/registro`/Equipo signup
  (`invite_clinic_member()`), both unchanged. If Auth/sign-in succeed but
  the automatic accept fails, never retry account creation, never sign
  the person out, never fabricate a membership — she's already
  authenticated, so she recovers through the same manual "Aceptar
  invitación" existing-invitation flow below.
- An email that already has an Odentia account never auto-activates or
  auto-accepts anything — she's sent to a normal login
  (`/login?next=/invitacion/[token]`) and accepts manually via the same
  button every other invitation uses. Logging in never by itself implies
  accepting a new membership. Never reset her password, overwrite her
  existing identity, or otherwise take over that account. The invitation's
  pre-provisioned `phone` only ever fills `profiles.phone` when it is
  currently NULL — an existing user's own phone is never overwritten.

Whichever RPC issued the invitation (`invite_clinic_member()`,
`provision_first_clinic_admin_invitation()`, or
`provision_clinic_team_member()`), `accept_clinic_invitation()`'s own
role-conditional effects apply identically, unchanged: `dentist` always
gets a `professional_profile` plus the default Monday–Friday 08:00–17:00
availability seed; `clinic_admin` and `assistant` never get one
automatically.

**A `clinic_admin` membership is never a per-clinic singleton** —
structurally (no schema constraint enforces at most one) or by
convention (a Superadmin may provision additional admins beyond the
bootstrap first one via `provision_clinic_team_member()`). Any lookup
whose purpose is "does this clinic have an active Clinic Admin" must
tolerate multiple matching rows and must never use a primitive that
requires at-most-one (e.g. `.maybeSingle()`) unless a real DB constraint
actually guarantees that cardinality — a real regression once came from
exactly this assumption. Separately, and just as permanently: a failure
to read that state is never the same fact as "no admin exists." Any
bootstrap-state resolution (Estado A/B/C on `/platform/clinicas/[slug]`,
or any future equivalent) must fail closed on a genuine lookup error — a
distinct, visible "we don't know" state — never silently fall through to
an assignment/creation form just because the read that would have said
otherwise failed.

`/admin` is the OLD, separate, fully mock UI
(`src/features/admin/mock-data.ts`), with no `resolveClinicContext()` call
and no route protection beyond the mock role switcher —
`ClinicContext.membership.role` only ever resolves to `clinic_admin |
dentist | assistant` for a real session, so `role-bridge.ts` can never
produce a real `"superadmin"` mock role. `/admin` is therefore
unreachable through any real login in production, only through the DEV
role switcher in development — it is unrelated to `platform_roles`/
`resolveSuperadminContext()` above, not yet migrated or removed, and not
itself a model to copy for any future real authorization.

### Clinic Admin

The clinic's owner or administrator.

Can manage:

- Subscription and billing
- Clinic configuration
- Team (dentists and assistants)
- Full schedule
- Patients
- Medical records
- Orders
- Global reports

Also has all the clinical permissions of a Dentist.

**The Clinic Admin never needs a second role to see patients.**

Exception: authoring/editing a patient's clinical record entries (e.g.
Antecedentes in Historia Clínica) requires clinical capacity — a Clinic
Admin needs her own active professional profile, exactly like a Dentist
(see `canEditClinicalData()`). Once she has one, she may author/edit
clinical documentation for any patient in the clinic, same as any active
Dentist — see Dentist's own note below on why this is never restricted to
"her own patients." The Assistant and the Patient can always read it,
never write it.

There is no separate "Admin Odontólogo" role in the schema — a Clinic
Admin who also practices is still, structurally, a plain `clinic_admin`
membership that additionally owns an active `professional_profiles` row.
`create_my_professional_profile()` (real, `SECURITY DEFINER`, self-service,
`clinic_admin`-only) is how she gets one; `update_my_professional_profile()`
edits it afterwards. Never invent a distinct role/flag for this — it's
purely "does this `clinic_admin` also have an active professional
profile," derived the same way `canEditClinicalData()` already does.
Provisioning/accepting the clinic's very first `clinic_admin` (see
Superadmin above) never creates a `professional_profile` either — if that
admin also treats patients, she configures her own profile afterwards
through this same self-service path, same as any other Clinic Admin.

### Dentist

Manages only their own clinical operation.

Can manage:

- Their own schedule
- Their own patients
- Medical records
- Treatments
- Orders
- Reports scoped to their own operation
- Personal settings

Does not manage users, subscriptions, or clinic-wide configuration.

"Their own patients" above is about schedule/queue, not a clinical-write
restriction: writing clinical documentation (Antecedentes, Atenciones,
Odontograma, etc.) is scoped to the Clinic, never to "assigned to this
Dentist" — any active Dentist may author/edit clinical records for any
patient in the clinic, same as a clinically-active Clinic Admin (see her
own Exception note above). The only mandatory isolation boundary for
clinical data is `clinic_id`.

### Assistant

Supports the clinic's operation.

Can:

- Manage appointments
- Manage patients
- View medical records, subject to permissions
- Place orders
- View operational reports

Does not manage users, subscriptions, or administrative configuration.

Initially, assistants can work with every dentist in the clinic. The model
must stay ready to support assigning assistants to specific dentists later,
without requiring a major refactor.

### Patient

The person receiving care — not a clinic team member.

Can, for their own data only:

- Request an appointment (a `Solicitud de Cita`, below) — never schedule one
  directly; the clinic accepting the request is what creates the `Cita`
- View their own appointments, and confirm their own attendance on one; request
  a reschedule or cancellation (never edit the appointment directly — changes
  are proposals the clinic approves)
- View their own medical/dental record
- View their own clinic's info

Never sees other patients' data, clinic administration, or any clinic-team
screen. Has its own portal experience, not a role variant of the clinic
dashboard (see Architecture above).

**Current implementation note:** every bullet above is real except
"request a reschedule or cancellation" — that proposal-approval lifecycle
has no backend yet (the old mock buttons for it were removed outright,
never kept as fake non-persisting ones); requesting an appointment,
confirming attendance, and viewing citas/historia/clínica/perfil are all
real. Mi salud dental (a separate screen from "medical/dental record"
above, which is Mi Historia Clínica) is still Phase 1 mock.

---

## Data Model

All data belongs to the Clinic.

Some records are also associated with a specific Dentist, for example:

- Appointments
- Medical records
- Treatments
- Production
- Individual reports
- Schedules

Patients belong to the Clinic, not to the Dentist. The same patient can be
seen by different dentists within the same clinic.

---

## Appointment Lifecycle

This is a permanent architectural decision, same standing as the rest of
this Domain Model section — every appointment-related feature (Agenda, the
Patient portal, any future clinic-side approval screen) must respect it.

There are two distinct lifecycles. They are NOT the same state machine and
must never be conflated:

### Solicitud de Cita (appointment request)

A Patient-initiated request, before the clinic has scheduled anything:

`Pendiente → Aceptada / Rechazada`

Accepting a request turns it into a scheduled `Cita` (below), starting at
`Programada`. Rejecting it ends the request — no `Cita` is created.

Real as of this writing: `public.appointment_requests` (status `pending |
accepted | rejected`, plus `accepted_appointment_id` linking the Cita an
acceptance produced). A request holds a *preference*
(`preferred_starts_at`, `professional_profile_id`) — it never reserves a
slot, never runs the overlap/availability rules, and never appears on the
Agenda board. Those rules run only at acceptance, against the real
`appointments` INSERT, exactly as they do for any staff-created Cita. The
clinic may change date/hora/profesional/consultorio/duración/tratamiento
before accepting; `preferred_starts_at` is never overwritten, so what the
patient asked for stays distinguishable from what was scheduled. At most one
`pending` request per patient at a time (a partial unique index, not app
logic).

### Cita (appointment)

Once scheduled, a `Cita` moves through:

`Programada → Confirmada → Paciente llegó → En sala de espera → En curso → Completada`

Rules:

- `Confirmada` means the Patient confirmed their own attendance — this only
  ever applies to an already-scheduled `Cita`, before it happens, and is
  unrelated to `Solicitud de Cita`'s own `Pendiente`/`Aceptada`/`Rechazada`.
- The Patient failing to confirm attendance never auto-cancels the `Cita`.
- `Completada` only happens when the clinical encounter actually finished —
  never inferred from the appointment's date/time having passed.
- A past `Cita` left unresolved is an anomaly (`Sin cerrar`), not an
  automatic `Completada`/`No asistió`/`Cancelada`. One derivation covers
  both ways a non-terminal `Cita` can end up here — `isUnresolved`/
  `getDisplayStatus` in `src/features/dashboard/real-status.ts`, the single
  place the 2-hour grace period (`UNRESOLVED_GRACE_MINUTES`) and this
  derivation live: any `Cita` whose `status` isn't already `Completada`/
  `No asistió`/`Cancelada`, still open more than the grace period past its
  `startsAt + durationMinutes` (its `endsAt`), reads as `Sin cerrar` —
  purely display-only, the DB `status` never changes because of it.
  - `in_progress` past its grace period: still running, never auto-closed.
    "Continuar atención" stays available exactly as from `En curso`.
  - `scheduled`/`confirmed` (or `patient_arrived`/`waiting_room`) past its
    grace period: attention never started at all. From here the clinic
    must explicitly resolve what happened — either start/log the
    encounter now ("Iniciar atención", same action as always) or confirm
    the Patient genuinely never came ("Marcar No asistió", see
    `markNoShow` in `appointments-actions.ts`) — never inferred
    automatically.
- Final states: `Completada`, `No asistió`, `Cancelada`.
  - `Cancelada` always happens before the encounter takes place.
  - `No asistió` means the Patient genuinely did not show up.

**Current implementation note:** the real Agenda's `AppointmentStatus`
(`src/features/dashboard/appointments-data.ts`: `scheduled | confirmed |
patient_arrived | waiting_room | in_progress | completed | no_show |
cancelled`) already matches this lifecycle — use it, and
`patient_clinical_encounters.appointment_id`, for any new real
appointment/encounter work. A `Cita` created by accepting a `Solicitud`
starts at `scheduled` (the Patient still confirms her own attendance
afterwards), unlike the clinic's own "Nueva cita", which the front desk
arranged directly and which therefore starts `confirmed`. The one screen still
on Phase 1 mock data that reads appointments at all (the Portal's own Mi
salud dental — Mis citas and Mi Historia Clínica are both real now) keeps
its own separate, flattened 6-value
`AppointmentStatus` (`confirmed | pending | in-progress | completed |
cancelled | no-show`, hyphenated) — depending on context, `pending`/
`confirmed` overload meanings from both lifecycles above there. Don't deepen
that conflation in new mock-side work; prefer an additive field scoped to
where it's actually needed (e.g. the Patient portal's own
`attendanceConfirmed`, separate from `status`) until that screen's own real
conversion lands.

---

## Availability & Absences

Permanent architectural decision, same standing as the rest of this
Domain Model section. Real (`public.professional_availability`/
`public.professional_absences`), enforced by a Postgres trigger on every
`appointments` write, not just an app-level pre-check. Exact semantics —
regression-prone, do not simplify or re-derive differently elsewhere:

- **Zero availability rows** for a professional → legacy-unrestricted:
  every day/time is bookable. This is deliberate backward compatibility
  (a professional who never configures a schedule isn't suddenly locked
  out), not an oversight to "fix."
- **At least one row with `active = true`** → a Cita must fall entirely
  within one of that professional's active blocks for that day of the
  week; anything outside is rejected.
- **Rows exist but every one is `active = false`** → distinct from "zero
  rows": the professional deliberately configured, then fully
  deactivated, her own schedule. Reads as "no availability at all," never
  falls back to unrestricted.
- **Absences** are independent of the three states above: any active
  absence covering the Cita's date range rejects it regardless of
  availability configuration.
- The MVP absence model is **date-only/all-day** — no partial-day
  absences, don't add one without an explicit ask.
- Creating an absence never auto-cancels appointments that already exist
  inside its date range — it only blocks new/rescheduled Citas from
  landing there. A pre-existing conflict is resolved manually by staff,
  never automatically.

Agenda's own slot grid and time pickers (`src/features/dashboard/
agenda-hours.ts`) must derive their bookable slots from these exact same
real blocks, never a hardcoded default — regression-prone, same standing
as the rules above:

- Slots are generated **per block**, anchored at that block's own
  `start_time` — never a continuous range spanning every block for the
  day (a gap between two blocks, e.g. a lunch split, must stay
  unbookable) and never rounded to a whole hour.
- The "zero rows → unrestricted" fallback is evaluated **per
  professional**, never per clinic: a professional with some
  configuration who simply has no active block for one specific day
  shows zero slots that day, never the unrestricted default — that
  default is reserved for a professional who never configured anything
  at all.

---

## Primary Use Case

The system must natively support the most common scenario: an independent
dentist working alone, with no assistants.

In this case there is a single user with the Clinic Admin role, who manages
the clinic and sees patients using the same account.

Creating a second user, or assigning a second role to act as a dentist, must
never be required.

---

## Implementation Rule

From this point forward, every new feature must be designed to respect this
domain model.

If a future implementation conflicts with this architecture: stop, explain
the conflict, and propose an adaptation before writing any code.

---

# RIPS (Colombian Regulatory Reporting)

Odentia can generate a RIPS sin factura JSON export (Documento Técnico 1,
Resolución 948 de 2026) from `/rips` — Clinic Admin only. The one
permanent rule, never to be relaxed: **RIPS is built exclusively from
services actually performed** — `encounter_diagnoses`/`encounter_services`,
snapshotted onto the encounter at "Finalizar atención" — never from a
Treatment Plan, a planned/recommended procedure, or the odontogram alone.
"Plan de Tratamiento ≠ servicio realizado" is the reason this lives in its
own tables, entirely separate from `patient_clinical_encounter_procedures`
(the clinic's own free-text procedure list, never CUPS-coded, never a
RIPS source).

RIPS identity (`clinics.tax_id`, `clinic_locations.cod_prestador`,
`professional_profiles.document_type/number`, and the RIPS identity
columns on `patients`) reuses the same real tables every other feature
already reads/writes — never a parallel "RIPS profile." CIE-10/CUPS codes
and every other RIPS reference value are always validated server-side
against the official SISPRO catalogs (`cups_catalog`/`diagnosis_catalog`/
`rips_reference_values`) at write time — never inferred from free text,
never accepted merely because the UI offered it, and never validated by
loading a full catalog into the client (search is always server-side).

New-patient creation (`NewPatientModal`/`createPatient()`) collects RIPS
identity up front — Sexo, Tipo de usuario, País de residencia, and (when
Colombia) Municipio/Zona — rather than deferring every one of them to the
contextual `/rips` correction modal. `getMissingNewPatientFields()`
(`src/features/patients/new-patient-completeness.ts`) is the single source
of truth for which fields are required and when Municipio/Zona apply
(Colombia-conditional); the modal's per-field invalid styling and its
footer blocker message both derive from it alone, never a second parallel
check. This does not replace the `/rips` correction modal — it only
reduces how often a NEW patient ever needs it; an existing patient created
before this, or missing a field regardless, is still corrected the same
way as before, in-place from `/rips`.

A clinic with more than one `clinic_location` cannot generate an export
yet — nothing in the schema links a specific atención to a specific sede
(`appointments.room` is free text, not a location FK). This is a known,
deliberate architectural gap (the export blocks rather than guessing the
sede), not an oversight — do not silently pick the primary location if
this is ever revisited.

Clinic/sede-level RIPS configuration (NIT, `codPrestador`) has one
dedicated UI home: "Configuración RIPS" (`src/features/clinic/
rips-config-section.tsx`, anchored at `/clinica#rips`) — NIT is edited in
"Información general" and shown there read-only; `codPrestador` is edited
directly in this block, never anywhere else. `/rips`'s own readiness
"Corregir" links for clinic/location blockers point at this anchor, never
a bare `/clinica`. Reuse `getRipsExportReadiness()` (via
`getRipsClinicConfigStatus()`) for any future "is clinic/sede config
complete" check — never a second set of rules that could disagree with
`/rips` itself about what "ready" means.

**Concepto clínico natural → CUPS.** The odontólogo never picks CUPS as
her primary vocabulary — she picks a natural concept ("Limpieza dental",
"Consulta de control", etc.). `clinical_concepts`/
`clinical_concept_variants`/`clinical_cups_mappings` (global catalog,
read-only from the app) resolve concept [+ variant] [+ the professional's
own specialty] → a real CUPS row: a mapping specific to that specialty
always wins over a generic one, never the reverse, and a mapping outside
its own `valid_from`/`valid_to` is never applicable. `encounter_services`
snapshots the chosen concept/variant's human name at save time (never
re-resolved later, so a later catalog rename never rewrites history) —
CUPS is always a derived consequence, never the decision itself. Extracción
dental and Tratamiento de conductos have no confirmed V0 mapping yet —
never invent one; those two stay manual-CUPS-search only until a future
phase confirms them.

**Profesional del servicio realizado.** Every `encounter_services` row
inherits `professional_profile_id` automatically from the Cita/atención's
own responsible professional (`appointment.professional_profile_id`) —
the odontólogo never picks a professional per service in the normal
"¿Qué realizaste?"/manual-CUPS flow, even in a clinic with several active
professionals. The column stays on the model (still needed for RIPS/
trazabilidad), but the UI only ever shows it read-only. Odentia does not
support co-atención (more than one professional per atención) yet — that
would be a distinct, separately-scoped flow, never silently inferred from
this single-professional model.

**Especialidad → Servicio RIPS.** Two tables, never one — a global
suggestion must never be mistaken for a clinic's own confirmed
configuration:

- `specialty_rips_service_defaults` — Odentia's own GLOBAL suggestion
  (`specialty_id` → a `rips_reference_values` row, `catalog_key =
  'Servicios'`). Read-only from every clinic; never an effective RIPS
  value.
- `clinic_specialty_rips_services` — ONE clinic's own CONFIRMED
  configuration. The only table allowed to populate
  `encounter_services.cod_servicio_code`/`grupo_servicios_code`. No row
  for a given specialty means "this clinic hasn't confirmed it yet" —
  never "use the default instead."

**RIPS #A4 — writing `clinic_specialty_rips_services`.** The only write
path is `confirm_clinic_specialty_rips_service()` (`SECURITY DEFINER`,
`/clinica#rips`'s own "Servicios RIPS por especialidad" section) — the
table itself stays RLS-closed to `authenticated` for INSERT/UPDATE/DELETE,
same deny-by-default convention as `clinic_invitations`/
`professional_profiles`. `clinic_id` is never a parameter of that
function (nothing for a caller to spoof): it's re-derived from the
caller's own active `clinic_admin` membership, exactly like
`invite_clinic_member()`. Grupo is never a separate input either — it's
derived from the selected Servicio's own `rips_reference_values.parent_code`
and re-verified against the official `GrupoServicios` catalog, so an
inconsistent Grupo/Servicio pair can never persist. Confirming a new
Servicio for an already-configured specialty supersedes the previous row
(`status = 'superseded'`) rather than overwriting it — never a second
simultaneous "active" row per `(clinic_id, specialty_id)`. Grupo/Servicio
are SNAPSHOTTED into `encounter_services` only at encounter-finalize time
(`clinical-service-resolution.ts`, unchanged by A4) — confirming this
configuration therefore only ever affects NEW encounters going forward,
never an already-finalized one. Configuring a specialty later never
rewrites any already-finalized encounter's own frozen snapshot — that
historical gap is what RIPS #A4B (below) exists to close, explicitly and
per-encounter, never automatically.

**RIPS #A4B — corrección histórica de Servicio RIPS en una atención
finalizada.** `RIPS_SERVICE_CONFIGURATION_MISSING` on an already-finalized
encounter is resolved from `/rips` itself (grouped by `encounter_id` — one
modal per atención, never per service, since every service in one
encounter shares the same professional/specialty under the current
no-co-atención model), via
`apply_confirmed_specialty_rips_service_to_encounter()` (`SECURITY
DEFINER`, migration `20260917110000`). Same permanent rules as RIPS #A4,
restated because a future change must never violate them here either:
effective configuration comes EXCLUSIVELY from
`clinic_specialty_rips_services`, re-validated live against the official
catalog — `specialty_rips_service_defaults` is never read as a fallback.
The RPC can only fill `encounter_services.grupo_servicios_code`/
`cod_servicio_code` — no other column, no clinical content, ever. It only
completes a currently-NULL `cod_servicio_code`; if `grupo_servicios_code`
is already frozen (e.g. from a manual "Detalles RIPS" edit) and disagrees
with the Grupo the confirmed configuration would derive, the WHOLE
encounter's correction fails closed rather than silently overwriting a
historical value or leaving an inconsistent Grupo/Servicio pair — never a
partial per-service correction. Every corrected service gets its own
append-only row in `encounter_service_rips_corrections` (actor, timestamp,
previous/new codes) — that table has no client-reachable write path at
all (no INSERT policy/grant; the RPC is the only writer) and its parent
FKs (`encounter_service_id`, `clinic_id`) are `ON DELETE RESTRICT`, never
CASCADE — an audit trail must outlive the row it explains, not disappear
with it.

**RIPS #6D — corrección de gaps en una atención finalizada.** A finalized
encounter's historia clínica stays immutable except for exactly two RIPS
gaps (`incapacity_code`, a consultation's `service_value`) —
`correct_finalized_encounter_rips_gaps` (the only write path,
`/rips/atencion/[encounterId]`) can only fill a currently-NULL value,
never overwrite an already-set one. `clinic_admin`-only, same gate as
every other `/rips` action — deliberately not
`is_active_clinical_professional()`.

**Corrección de datos RIPS del paciente, contextual en `/rips`.** A
patient-scope readiness gap (`PATIENT_SEX_MISSING`,
`PATIENT_COUNTRY_RESIDENCE_MISSING`, etc.) is corrected from a modal
inside `/rips` itself — grouped by `patient_id` (one modal completes every
missing field for that patient in one save), reusing the existing
`updatePatient()` write path and the same identity catalogs
`/pacientes` already uses. Never navigates to `/pacientes`; readiness is
re-resolved in place (`getRipsPeriodSummaryAction`) without leaving the
screen. Any future RIPS-blocking gap with a real, safe correction path
should follow this same "stay in `/rips`, group by the natural key, fail
closed on ambiguity" shape rather than sending the admin away to fix it
elsewhere.

Automatic SISPRO/MUV submission is not implemented and not currently
buildable without new infrastructure: both official mechanisms (the
Cliente-Servidor desktop app and the API-Docker REST solution) require
running Ministry-provided software reachable only via `localhost` — see
PROJECT_STATUS.md's "RIPS #6A" for the full audit before attempting this
again. The productive flow stays fully manual: generate → download → the
odontóloga uploads the file herself → she reports the MUV result back
into Odentia (`rips_export_log.result_status`), never inferred from
Odentia's own internal validation passing.

See `docs/rips-json-mapping.md` for the full field-by-field JSON mapping
and PROJECT_STATUS.md's own "RIPS" section for current scope and gaps.

---

# Prospecto Comercial (Commercial Funnel)

Permanent architectural decision, same standing as the rest of this file.
**Public users do not self-create clinics. Clinic creation/provisioning is
controlled by Platform Superadmin; the public commercial path starts with
a prospect/demo request, never a public clinic-registration form** — see
Domain Model's Superadmin section above for `provision_clinic()`/the
`bootstrap_clinic()` self-service retirement. Odentia's public commercial
entry point is `/demo` (`src/features/commercial-prospects/`): Landing →
"Quiero Odentia para mi clínica" → `/demo` → a Prospecto Comercial is
persisted (`public.commercial_prospects`, via
`submit_commercial_prospect()`) → seguimiento comercial from Platform →
Prospectos (`/platform/prospects`) → an explicit, separate Superadmin
action converts a `won` prospect into a real clinic (see below) — this
entire path is real, not a future checkpoint. Marketplace's own public
header follows the same rule: its "Quiero Odentia para mi Clínica" CTA
links to this same Core `/demo`, never a Marketplace-side clinic
self-registration form.

**A Prospecto Comercial is never any Odentia identity entity.** It is not
an `auth.users` row, not a `profiles` row, not a `clinic`, not a
`clinic_membership`, not a `clinic_invitation`, and has no FK toward any
of them. Submitting `/demo`'s public form never creates a Supabase Auth
user, never asks for a password, never signs anyone in, and never calls
`bootstrap_clinic()`/`provision_clinic()`/any membership or invitation
RPC. `submit_commercial_prospect()` is anon-callable by design (the
visitor has no session at all) and is the only INSERT path — RLS on
`commercial_prospects` grants no direct anon/authenticated write at all.

**Only a platform Superadmin may ever read or manage a Prospecto.** The
table's only SELECT policy is scoped to `is_platform_superadmin()` — no
clinic role (Clinic Admin, Dentist, Assistant) and no Patient can ever
see this data, and anon has no SELECT at all. Platform → Prospectos
(`/platform/prospects`, `/platform/prospects/[prospectId]`) is read-only
identity/contact plus one mutation: status.

**Status pipeline is a minimal, sequential state machine, never a free
dropdown:** `new → contacted → demo_scheduled → demo_completed → won`,
one step at a time — no skipping. `lost` is reachable from any
non-terminal status. `won` and `lost` are both terminal for this MVP: no
transition out of either is ever allowed. **`won` is reachable ONLY
immediately after `demo_completed`** — `new`/`contacted`/`demo_scheduled`
→ `won` are all invalid, not just unreached by the UI. This matters for
the clinic-conversion mechanism below: it relies on `won` always meaning
a real demo actually happened first. The single source of truth for
these rules is `update_commercial_prospect_status()` (`SECURITY
DEFINER`, re-validates against the row's REAL current status under a row
lock — never a client-supplied `currentStatus`); the TypeScript mirror
lives in `src/features/commercial-prospects/state-machine.ts` and must
never drift from the RPC's own rules.

**`won` → "Crear clínica" is a second, independent axis from the status
pipeline — never a status value itself, and never automatic.** Marking a
prospect `won` never creates a clinic. Whether the corresponding clinic
already exists is tracked separately, on `commercial_prospects.
converted_clinic_id` (nullable FK to `clinics.id`) + `converted_at` (set
together, never independently) — never a new enum value like
`converted`/`provisioned`/`activated`. The only write path is
`convert_commercial_prospect_to_clinic()` (`SECURITY DEFINER`,
Superadmin-only, `src/components/platform/prospect-conversion-section.tsx`
on `/platform/prospects/[prospectId]`), which:
- re-validates `status = 'won'` and `converted_clinic_id is null` against
  the row's REAL current state under a row lock (`for update`) — never a
  client-supplied flag, and never possible to run twice for the same
  prospect (a concurrent/duplicate call blocks on the lock, then fails
  closed once it sees the row already converted);
- **reuses `provision_clinic()` directly, unchanged, as a plain nested
  call** — never a second, duplicated clinic-creation implementation.
  `provision_clinic()` was deliberately designed for exactly this (see
  its own migration comment: "Ruta A from a prospecto and Ruta B direct
  both converge here");
- only ever prefills `clinic_name`/`city` from the prospect onto the
  clinic/location form — the prospect's own `first_name`/`last_name`/
  `email`/`phone` describe the commercial CONTACT, never silently copied
  into a Clinic Admin, Auth user, membership, or invitation. The contact
  person and the future Clinic Admin may be different people; team
  provisioning stays the existing, separate Platform → Equipo flow, run
  afterward, unchanged.

A converted prospect stays `won` forever — the conversion link is purely
additive, operational state, never a reason to introduce a new
commercial status.

---

# Security

Security always has priority over convenience.

Never expose:

- patient information
- medical records
- credentials
- private data

Never bypass authentication or authorization.

---

# Communications

No transactional email, WhatsApp, SMS, or push notifications are
implemented anywhere in this codebase — not for staff invitations, not
for patient invitations, not for appointment reminders. Every invitation
(Equipo, Patient Portal access) is a real, persisted, tokenized link an
admin/assistant copies and shares manually themselves; UI copy always
says "creada"/"copiar enlace", never "enviada". `wa.me` links (e.g. a
clinic's own contact number) are manual deep-links a person clicks —
never an automated send, never a WhatsApp Business API integration. Do
not build toward automated sending, and do not phrase UI copy as if
something was sent automatically when it wasn't, unless explicitly asked
to build that infrastructure.

---

# UI / UX Principles

The platform should feel:

- modern
- lightweight
- intuitive
- fast

Prioritize:

- few clicks
- clear navigation
- responsive layouts
- mobile-first design

Avoid:

- clutter
- unnecessary dialogs
- complex forms

---

# Code Style

Always write code that is:

- clean
- strongly typed
- modular
- easy to understand

Prefer composition over inheritance.

Avoid duplicated logic.

Use meaningful naming.

---

# Documentation

Whenever a significant architectural decision is made:

- update documentation when appropriate
- keep code and documentation aligned

Never document obvious implementation details.

---

# Decision Making

When multiple implementations are possible:

1. Simpler
2. Easier to maintain
3. Faster to validate with users
4. Easier to evolve later

Prefer these over theoretical scalability.

---

# Working with Claude

When starting a new task:

1. Read:
   - PROJECT_IDENTITY.md
   - PROJECT_STATUS.md

2. Understand the current phase.

3. Implement only what is needed for the current milestone.

4. Do not anticipate future phases unless explicitly requested.

---

# Functional Freeze (current phase)

Odentia Core is in Functional Freeze during full manual QA — see
PROJECT_STATUS.md's "REAL E2E STABILIZATION" checkpoint for what's been
verified and what's left.

Do not add new MVP functionality unless explicitly requested.

Fix bugs/regressions found during QA surgically, with focused regression
coverage — same discipline as every fix already made to reach this
checkpoint.

Avoid broad refactors or unrelated cleanup while this freeze is in effect.

---

# Things Claude Should Avoid

Do not:

- overengineer
- create generic frameworks prematurely
- implement features not requested
- optimize before necessary
- introduce unnecessary dependencies
- create abstractions without a real use case
- build for hypothetical future requirements

---

# General Rule

When in doubt, always choose the solution that helps deliver a better MVP sooner.

Speed of learning is more valuable than technical perfection.