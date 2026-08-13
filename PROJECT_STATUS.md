# PROJECT_STATUS.md

# Odentia Core

**Last Updated:** 2026-08-13

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
- A compact clinic identity card above the KPI grid — the clinic's own logo
  (`object-contain`, capped well under its box so it stays clearly secondary to
  Odentia's own sidebar logo) centered above the clinic name.
- KPI summary cards, clickable for detail, plus an alerts modal.
- Appointment creation flow.
- Appointment detail modal with patient history timeline, cancel flow, and
  "start attention" flow.
- Clinical encounter screen (attending a patient) with an interactive odontogram.
- Marketplace card — placeholder only, no real integration (see Marketplace Status).

## Clínica (the Clinic Admin's own clinic settings)

- `/clinica` — general clinic info plus a "Logo de la clínica" field: a horizontal
  (never square/avatar-style), `object-contain` preview so horizontal, square, or
  vertical logos alike show in full, plus "Cambiar logo" (a real local file picker,
  mock only — nothing is uploaded) and "Eliminar logo." Clinic Admin only.

## Admin (the Superadmin's platform-wide home)

- `/admin` — platform KPIs, monthly activity, a Marketplace overview, a recent-clinics
  list, and an attention list. Gated to the Superadmin role.
- The Superadmin is also now locked out of clinic-operational routes (`/agenda`,
  `/pacientes`) at the route level, not just hidden from their own sidebar — visiting
  either URL directly redirects to `/admin` via the same shared route guard every
  other gated route already uses.

## Pacientes (the Clinic Admin's patient directory)

- `/pacientes` — search/filters over the clinic's patients, a compact list, and a
  detail modal with an editable patient card plus the same appointment-history
  timeline component Agenda uses. New-patient and new-appointment-from-patient flows.
- The patient detail modal also has an "Acceso del paciente" card: a mock QR (a real
  scannable QR image encoding an opaque per-patient link — no name/email/documento/
  clinical data in it) plus "Copiar enlace"/"Enviar por WhatsApp", with copy that
  adapts to whether that patient's own Portal account is activated yet.
- "Ver historia clínica" now opens a real page instead of a placeholder dialog — see
  Historia Clínica below.

## Historia Clínica (Clinic Admin)

- `/pacientes/[id]/historia-clinica` — reached from the patient detail modal. Compact
  patient header (identity, estado, "odontólogo habitual" as a real avatar+nombre+
  especialidad row, paciente desde) plus an always-visible "Alertas clínicas" banner
  derived from that patient's alergias/condiciones/medicamentos.
- Five tabs — `Resumen | Antecedentes | Odontograma | Atenciones | Documentos`:
  - **Resumen** — a KPI-card grid (icon + label + value; strict 3/2/1 columns, no
    column spans; a row's height always matches its tallest card, never truncated)
    for alergias, medicamentos, condiciones, última atención, tratamientos activos,
    próxima cita, última actualización del odontograma, and notas clínicas.
  - **Antecedentes** — same card-grid language for a structured Anamnesis
    (antecedentes personales/familiares, hábitos, cirugías/hospitalizaciones,
    embarazo only when it applies, otros antecedentes) plus a "Condiciones y
    factores relevantes" section with short, differently-worded summaries of the
    same facts (never repeating Anamnesis's own longer text). Shows "Actualizado
    {fecha/hora} · {odontólogo}" traceability. Editing ("Actualizar antecedentes," a
    modal, not a navigation) is Dentist-only — Clinic Admin/Assistant/Patient can
    read but never see the edit action. Only Clinic Admin can reach this screen
    today, so the button is always hidden in practice, but the role check itself is
    already correct for whenever Dentist access to this route opens up.
  - **Odontograma** — reuses the same tooth-chart component the clinical encounter
    flow already draws (read-only here), plus a "Hallazgos" side panel (75/25 on
    desktop, stacked on mobile) listing every finding with pieza/tipo/descripción/
    fecha/profesional.
  - **Atenciones** — past clinical encounters (fecha, odontólogo, tratamiento,
    hallazgos, estado) as their own record type — not reused straight off
    Appointment, whose own `notes` field is a scheduling note, not a clinical
    finding.
  - **Documentos** — mock metadata rows (radiografía/consentimiento/fotografía
    clínica) with fecha and profesional; no real files.
- Gated to the Clinic Admin role today (`allowedRoles`); nothing else hardcodes
  "admin only," so Dentist/Assistant/Patient variants are a matter of opening that
  gate later, not rebuilding the screen.
- Mock data: only Laura Martínez has every tab fully populated (the flagship demo —
  alergia a la penicilina, losartán, hipertensión arterial controlada). A few other
  patients (Camilo Ríos, Isabella Fonseca, Ricardo Peláez, Andrés Torres) carry
  targeted clinical alerts (diabetes, embarazo, anticoagulantes, alergia); everyone
  else correctly shows this feature's empty states. The mock patient formerly named
  "María Gómez" (a naming collision with the Clinic Admin's own identity) is now
  "Alejandra Vidal."
- Not built yet: Dentist/Assistant/Patient access to this screen, adding/editing
  Odontograma findings or Atenciones/Documentos entries (all three are read-only
  mock data this stage), and any real persistence for an "Actualizar antecedentes"
  save (it only updates local component state for the current session).

## Patient Portal

- `/portal/*` — the Patient's own experience, fully separate from the clinic
  dashboard. Nav: Mis citas, Mi salud dental, Mi Historia Clínica, and the clinic's
  own name (a read-only info screen); "Mi perfil" lives in the avatar menu instead.
- Branding: Odentia's own logo never appears anywhere in the Patient portal (mobile
  header or desktop sidebar) — the clinic's own logo does instead (currently the
  Clínica Sonrisa Perfecta mock asset), since the Patient is interacting with their
  clinic, not the Odentia platform. Desktop `Mis citas` is also capped/centered
  instead of stretching full width, for both the empty-scheduling and populated
  states, without touching the already-approved mobile layout.
- **Mis citas** (`/portal/citas`, the Patient's entry point) — a featured "Próxima
  cita" card (assigned professional, appointment data, a compact appointment-history
  timeline) plus:
  - **Sin próxima cita**: instead of a dead-end empty state, goes straight into
    booking one — the same odontólogo/week/day/slot picker Reprogramar uses (see
    below), with new-appointment copy. Selecting a slot only highlights it (no
    Reprogramar-style "nueva fecha y hora" recap); "Agendar cita" opens a "Confirma
    tu cita" summary (odontólogo + foto, fecha, hora, duración) before actually
    creating the appointment (status Pendiente) — nothing is booked until that's
    confirmed.
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
  - **Confirmar asistencia**: only offered once the clinic has already confirmed the
    appointment (not while a request is still Pendiente) and only once it's
    imminent — approximated in this mock as "the appointment is today," since there's
    no real clock; attendance confirmation is tracked separately from the
    appointment's own scheduling status (see CLAUDE.md's Appointment Lifecycle) so
    the two can never get confused with each other again.
  - "Historial de citas" (here and everywhere else it appears — the appointment
    detail modal, the patient detail modal) shares one consistent background
    treatment now, instead of some instances having a fill and others not.
- **Mi salud dental**, **Mi Historia Clínica**, clinic info screen, and "Mi perfil" —
  read-only mock views scoped to the logged-in patient only.
- Not built: any clinic-side approval UI for a pending reschedule/new-appointment
  request (the clinic just never sees "solicitudes" yet — see Agenda above).

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
Assistant), Reports, Team, and Subscription/Settings are all still just nav-item
placeholders or entirely absent — see MVP Scope below for what's still pending.
Within what's already built, the clinic approving a pending reschedule/new-appointment
request (Patient Portal), and Dentist/Assistant/Patient access plus
add/edit flows for Odontograma/Atenciones/Documentos (Historia Clínica), are the
known gaps — see those sections above.

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
- Medical Records — first stage done (Clinic Admin's `/pacientes/[id]/historia-clinica`:
  Resumen, Antecedentes, Odontograma, Atenciones, Documentos; Dentist-only editing
  of Antecedentes, view-only for other roles). Dentist/Assistant/Patient access to
  this screen, and add/edit flows for Odontograma/Atenciones/Documentos, still
  pending.
- Reports — pending.
- Team — pending.
- Subscription — pending.
- Settings — pending.

---

## Patient Portal

- Book Appointment — done (empty-state scheduling flow + "Confirma tu cita", see
  Progress So Far); creates the appointment directly (no clinic-approval step, unlike
  Reprogramar).
- View Appointments — done (`/portal/citas`, "Mis citas").
- Appointment Confirmation — done (Confirmar asistencia, gated to confirmed +
  imminent appointments only, plus mock reschedule-request and cancel-with-motivo
  flows — see Progress So Far).

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
6. Patients — done (`/pacientes`: search/filters, list, detail modal, "Acceso del
   paciente" QR card).
7. Patient Portal — done for viewing/requesting changes to appointments (including
   booking a brand-new one) and read-only health/record/clinic info (`/portal/*`);
   the clinic's approval side of a pending request is still pending.
8. Medical Records — first stage done (`/pacientes/[id]/historia-clinica`, Clinic
   Admin only, Dentist-only editing); Dentist/Assistant/Patient access and
   Odontograma/Atenciones/Documentos add/edit flows still pending.
9. Clínica — done (`/clinica`: general info + logo).
10. Reports — pending.
11. Team / Subscription / Settings — pending.
12. Marketplace Entry Point — placeholder card exists; no real navigation yet.

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