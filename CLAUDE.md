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

Real authentication (Supabase Auth) lives in `src/features/session/` —
`resolveClinicContext()` is the single source of truth for the
authenticated user's clinic/role/professional-profile context. Every real
feature derives permissions from that, server-side, never from the legacy
mock session below.

The real resolved role is also bridged into the legacy mock
`src/features/auth/session.ts` / `RoleContext` store
(`src/features/session/role-bridge.ts`), so screens not yet converted from
Phase 1's mock data (see PROJECT_STATUS.md) keep working unmodified. Do
not scatter session logic into feature folders. `src/dev/` (role switcher,
mock dentist resolver) is a separate, disposable dev-only shim, still used
by those unconverted screens — never a source of authorization for a real
feature, and not yet safe to delete.

There are two shells: `AppShell` (clinic roles — Superadmin, Clinic Admin,
Dentist, Assistant) and `PortalShell` (Patient only, its own simpler nav —
see Roles below). Both share one role-gating hook,
`src/components/shell/use-route-guard.ts`; add new gated routes through it
rather than duplicating auth-redirect logic per shell.

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
Antecedentes in Historia Clínica) stays Dentist-only. The Clinic Admin's
clinical permissions cover operating the practice, not writing clinical
documentation on a Dentist's behalf — she (and the Assistant, and the
Patient) can always read it.

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

- View their own appointments, and request a reschedule or cancellation
  (never edit the appointment directly — changes are proposals the clinic
  approves)
- View their own medical/dental record
- View their own clinic's info

Never sees other patients' data, clinic administration, or any clinic-team
screen. Has its own portal experience, not a role variant of the clinic
dashboard (see Architecture above).

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
appointment/encounter work. `patient_arrived`/`waiting_room`/`no_show` are
declared but have no dedicated UI action yet. The still-mock screens (the
Patient Portal above all) keep their own separate, flattened 6-value
`AppointmentStatus` (`confirmed | pending | in-progress | completed |
cancelled | no-show`, hyphenated) — depending on context, `pending`/
`confirmed` overload meanings from both lifecycles above there. Don't deepen
that conflation in new mock-side work; prefer an additive field scoped to
where it's actually needed (e.g. the Patient portal's own
`attendanceConfirmed`, separate from `status`) until that screen's own real
conversion lands.

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