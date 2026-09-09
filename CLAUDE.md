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

**Real auth for this role is currently out of scope.** `/admin` is fully
mock UI (`src/features/admin/mock-data.ts`), with no `resolveClinicContext()`
call and no route protection beyond the mock role switcher —
`ClinicContext.membership.role` only ever resolves to `clinic_admin |
dentist | assistant` for a real session, so `role-bridge.ts` can never
produce a real `"superadmin"` mock role. `/admin` is therefore
unreachable through any real login in production, only through the DEV
role switcher in development. Do not build toward real Superadmin auth
unless explicitly asked — it's not part of the current MVP scope.

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