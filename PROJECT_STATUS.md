# PROJECT_STATUS.md

# Odentia Core

**Last Updated:** 2026-08-12

---

# Current Phase

## Phase 1 — Interactive UI Prototype

The current objective is to build a fully navigable frontend prototype using mock data only.

The prototype will be deployed to Vercel and validated with real users before any backend implementation begins.

This phase focuses exclusively on validating:

- User Experience (UX)
- Navigation
- Information Architecture
- Screen hierarchy
- User workflows

Backend implementation is intentionally postponed.

---

# Current Objective

Deliver a high-quality clickable prototype that feels like a finished application.

Every important user journey should be navigable.

The application should look production-ready even though all data is mocked.

---

# Progress So Far

What exists today in the clickable prototype (mock data only, no backend):

## Shell & Access

- Two shells: `AppShell` for clinic roles (desktop sidebar + header, mobile bottom
  tab bar + mobile header) and `PortalShell` for the Patient role — its own simpler
  nav, no clinic-dashboard chrome (see Patient Portal below). Both share one
  role-gating hook (`useRouteGuard`).
- Mock demo login at `/login` — no real backend. Lets a tester pick one of five demo
  profiles (Clinic Admin, Dentist, Assistant, Superadmin, Patient), each with its own
  mock identity, and enter the app as that role.
- The selected role is saved to `localStorage` so it survives a refresh, and drives
  header, greeting, avatar, "Mi perfil", permissions, and nav everywhere. "Salir"
  clears it and returns to `/login`.
- Role-based navigation (different nav items per role, per the Domain Model in
  CLAUDE.md).
- A separate dev-only role switcher (hidden outside `development`) still exists for
  fast manual testing without going through `/login`.

## Agenda (the Clinic Admin's operational home)

- Weekly appointment board scoped per role (a Dentist sees only their own column; a
  Clinic Admin/Assistant see all professionals), with professional/status filters.
- KPI summary cards, clickable for detail, plus an alerts modal.
- Appointment creation flow.
- Appointment detail modal with patient history timeline, cancel flow, and
  "start attention" flow.
- Clinical encounter screen (attending a patient) with an interactive odontogram.
- Marketplace card — placeholder only, no real integration (see Marketplace Status).

## Admin (the Superadmin's platform-wide home)

- `/admin` — platform KPIs, monthly activity, a Marketplace overview, a recent-clinics
  list, and an attention list. Gated to the Superadmin role.

## Pacientes (the Clinic Admin's patient directory)

- `/pacientes` — search/filters over the clinic's patients, a compact list, and a
  detail modal with an editable patient card plus the same appointment-history
  timeline component Agenda uses. New-patient and new-appointment-from-patient flows.

## Patient Portal

- `/portal/*` — the Patient's own experience, fully separate from the clinic
  dashboard. Nav: Mis citas, Mi salud dental, Mi Historia Clínica, and the clinic's
  own name (a read-only info screen); "Mi perfil" lives in the avatar menu instead.
- **Mis citas** (`/portal/citas`, the Patient's entry point) — a featured "Próxima
  cita" card (assigned professional, appointment data, a compact appointment-history
  timeline) plus:
  - **Reprogramar**: a mock request flow, not an immediate edit. Week navigation +
    horizontal day selector + availability-aware slot grid (mirrors Agenda's own
    week-nav pattern), with an odontólogo dropdown to request a different
    professional (always includes the current one, shows avatar/specialty/next
    availability per option, re-searches availability on change). Submitting never
    changes the real appointment — it records a pending request and shows a
    confirmation message; the original appointment stays valid until the clinic
    would approve it (approval itself isn't built — no backend yet). A second
    request can't be started while one is pending.
  - **Cancelar cita**: a confirmation modal requiring a motivo before cancelling.
  - Confirmar asistencia for a pending appointment.
- **Mi salud dental**, **Mi Historia Clínica**, clinic info screen, and "Mi perfil" —
  read-only mock views scoped to the logged-in patient only.
- Not built: the Patient starting a brand-new booking from scratch ("Agendar nueva
  cita" is a placeholder button with no flow behind it yet), and any clinic-side
  approval UI for a pending reschedule request.

## Identity & Profile

- Each role (Clinic Admin, Dentist, Assistant, Superadmin, Patient) has its own
  distinct mock identity — never a shared/default one.
- "Mi perfil" modals/screens per role: Dentist/Clinic-Admin-as-professional share one
  modal, Assistant and Clinic Admin (pure administrator) each have their own simpler
  one, and the Patient has its own read-only profile screen in the portal.
- A Clinic Admin can optionally configure a "Perfil profesional" to also appear as a
  practicing professional, without a second role.

## Not built yet

Register, Forgot Password, Onboarding (Create Practice / Configure Schedule / Invite
Assistant), dedicated clinic-side Medical Records screens, Reports, Team,
Subscription, and Settings are all still just nav-item placeholders or entirely
absent — see MVP Scope below for what's still pending. Within what's already built,
the Patient booking a new appointment and the clinic approving a pending reschedule
request are the two known gaps (see Patient Portal above).

---

# Development Rules (Current Phase)

During this phase Claude MUST:

- Use mock data only.
- Simulate backend responses.
- Simulate CRUD operations using local state.
- Create realistic sample data.
- Build complete user flows.
- Focus on polish and UX.

Claude MUST NOT:

- Implement Supabase.
- Create database schemas.
- Create migrations.
- Implement real authentication (a mock/demo login backed by localStorage — see
  Progress So Far — is in scope; verifying real credentials against a backend is not).
- Implement APIs.
- Integrate payment providers.
- Build Marketplace APIs.
- Implement background jobs.
- Optimize performance prematurely.

---

# MVP Scope

The first prototype should include:

## Public

- Landing Page
- Login — delivered as a mock demo login (see Progress So Far); no real backend yet.
- Register
- Forgot Password

---

## Onboarding

- Create Practice
- Configure Schedule
- Invite Assistant

---

## Core

- Dashboard — done (Agenda for clinic roles, `/admin` for Superadmin).
- Schedule — appointment board/creation/detail/encounter done; standalone Calendar
  view pending.
- Calendar — pending.
- Patients — done (`/pacientes`: search/filters, list, detail modal).
- Patient Details — done (part of the `/pacientes` detail modal).
- Medical Records — pending (dedicated clinic-side screens; the clinical encounter +
  odontogram exist, and the Patient's own read-only Historia Clínica exists in the
  portal, but there's no clinic-side record management screen yet).
- Reports — pending.
- Team — pending.
- Subscription — pending.
- Settings — pending.

---

## Patient Portal

- Book Appointment — pending ("Agendar nueva cita" is a placeholder button only).
- View Appointments — done (`/portal/citas`, "Mis citas").
- Appointment Confirmation — done (Confirmar asistencia, plus mock
  reschedule-request and cancel-with-motivo flows — see Progress So Far).

---

## Marketplace

Marketplace should only be represented as an integrated module.

No real integration is required.

Navigation and user experience should already exist.

---

# Marketplace Status

Marketplace is NOT part of the current implementation.

Only navigation placeholders should exist.

Future integration will happen through APIs.

---

# Current Priorities

Priority order:

1. Design System — done.
2. Authentication Screens — mock login done (now 5 role profiles, incl. Patient);
   Register/Forgot Password pending.
3. Onboarding — pending.
4. Dashboard — done (Agenda for clinic roles, `/admin` for Superadmin).
5. Schedule — appointment board/creation/detail/encounter done; standalone Calendar view pending.
6. Patients — done (`/pacientes`: search/filters, list, detail modal).
7. Patient Portal — done for viewing/requesting changes to appointments and
   read-only health/record/clinic info (`/portal/*`); booking a new appointment and
   the clinic's approval side of a pending reschedule are still pending.
8. Medical Records — pending (clinical encounter + odontogram, and the Patient's own
   read-only Historia Clínica, exist; no clinic-side record management screen).
9. Reports — pending.
10. Team / Subscription / Settings — pending.
11. Marketplace Entry Point — placeholder card exists; no real navigation yet.

---

# Success Criteria

This phase will be considered complete when:

- Every major screen exists.
- Navigation is complete.
- Mobile experience is polished.
- Desktop experience is polished.
- Mock data feels realistic.
- The prototype is deployed on Vercel.
- The prototype can be demonstrated to dentists without explanations.

---

# Validation

The prototype will be reviewed by:

- Project founders
- LopaDent
- Dentists
- Dental assistants

Feedback gathered during validation will determine backend priorities.

---

# Known Decisions

Already approved:

- Odentia is independent from LopaDent.
- Marketplace is optional.
- LopaDent is the only Marketplace provider.
- Subscription price reference:
  COP $99.900 / month.
- Subscription may be:
  - paid by the dentist
  - sponsored by LopaDent
- Marketplace must remain fully decoupled from Core.

These decisions should be treated as fixed unless explicitly changed.

---

# Out of Scope

The following features are intentionally postponed:

- AI
- Electronic invoicing
- Accounting
- Payroll
- Advanced inventory
- Laboratory integrations
- Multi-location practices
- Analytics
- Automation

---

# Next Phase

After UI validation:

- Next.js production setup
- Supabase
- Authentication
- Multi-tenant
- Database
- File Storage
- Notifications

No backend work should begin until the UI prototype has been validated.

---

# Notes for Claude

When implementing any feature ask yourself:

> Does this help validate the product with real users?

If the answer is "no", postpone it.

Always optimize for learning speed, not technical perfection.