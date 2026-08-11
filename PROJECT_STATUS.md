# PROJECT_STATUS.md

# Odentia Core

**Last Updated:** 2026-08-11

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

- Responsive app shell: desktop sidebar + header, mobile bottom tab bar + mobile header.
- Mock demo login at `/login` — no real backend. Lets a tester pick one of four demo
  profiles (Clinic Admin, Dentist, Assistant, Superadmin), each with its own mock
  identity, and enter the app as that role.
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

## Identity & Profile

- Each role (Clinic Admin, Dentist, Assistant, Superadmin) has its own distinct mock
  identity — never a shared/default one.
- "Mi perfil" modals per role: Dentist/Clinic-Admin-as-professional share one modal,
  Assistant and Clinic Admin (pure administrator) each have their own simpler one.
- A Clinic Admin can optionally configure a "Perfil profesional" to also appear as a
  practicing professional, without a second role.

## Not built yet

Register, Forgot Password, Onboarding (Create Practice / Configure Schedule / Invite
Assistant), a dedicated Patients list/detail screen, Medical Records screens, Reports,
Team, Subscription, Settings, and the Patient Portal are all still just nav-item
placeholders or entirely absent — see MVP Scope below for what's still pending.

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

- Dashboard
- Schedule
- Calendar
- Patients
- Patient Details
- Medical Records
- Reports
- Team
- Subscription
- Settings

---

## Patient Portal

- Book Appointment
- View Appointments
- Appointment Confirmation

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
2. Authentication Screens — mock login done; Register/Forgot Password pending.
3. Onboarding — pending.
4. Dashboard — done (Agenda serves as the Clinic Admin's home).
5. Schedule — appointment board/creation/detail/encounter done; standalone Calendar view pending.
6. Patients — pending (only exists inline as history within the appointment detail modal).
7. Medical Records — pending (clinical encounter + odontogram exist; no dedicated record screens).
8. Reports — pending.
9. Settings — pending.
10. Marketplace Entry Point — placeholder card exists; no real navigation yet.

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