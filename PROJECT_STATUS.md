# PROJECT_STATUS.md

# Odentia Core

**Last Updated:** 2026-08-05

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
- Implement authentication.
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
- Login
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

1. Design System
2. Authentication Screens
3. Onboarding
4. Dashboard
5. Schedule
6. Patients
7. Medical Records
8. Reports
9. Settings
10. Marketplace Entry Point

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