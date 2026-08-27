# PROJECT_STATUS.md

# Odentia Core

**Last Updated:** 2026-08-27

---

# Current Phase

## Phase 1 — Interactive UI Prototype — done

A fully navigable frontend prototype, mock data only, was built and deployed to
Vercel. It validated UX, navigation, information architecture, and workflows across
every major screen. See "Phase 1 legacy — screens still mock" below for what's still
running on that original mock data.

## Phase 2 — Real Backend (Supabase) — in progress

Backend implementation has started. It is being done **incrementally, one vertical at
a time**, converting screens from Phase 1's mock data to real Supabase-backed data —
never all at once, never by redesigning the already-approved UI. The standing rule for
every conversion is:

> **REAL DATA OR HONEST EMPTY STATE — never use a mock as fallback.**

Converted so far (real Supabase Auth + Postgres + Storage, real RLS, tenant-isolated):
real authentication, real clinic onboarding, `/clinica`, `/pacientes`, and
`/pacientes/[id]/historia-clinica` (all five tabs, plus a real PDF export). Everything
else (Agenda, `/admin`, Configuración, Mi Suscripción, Reportes, the Patient Portal)
is still exactly the Phase 1 mock prototype, deliberately untouched — see each
section below.

---

# Current Objective

Keep converting Odentia Core from the validated mock prototype to a real,
multi-tenant Supabase backend — one feature vertical at a time, always real data or
an honest empty state, never a redesign of the already-approved UI, and never
breaking a still-mock screen (Agenda above all) while its own conversion is pending.

---

# Progress So Far

## Autenticación (real)

- Real Supabase Auth (`signInWithPassword`) at `/login` — replaced the old mock demo
  login entirely. `src/features/session/resolve-clinic-context.ts` is the single
  source of truth for "who is this real user, and what's their clinic/role/
  professional-profile context," used by the real route guard
  (`src/lib/supabase/proxy.ts`), the login flow, and the shell's own identity display.
- **Compatibility bridge**: the real resolved role is written into the legacy mock
  `src/features/auth/session.ts` / `RoleContext` store
  (`src/features/session/role-bridge.ts`) so every still-mock screen (Agenda above
  all) keeps working completely unmodified while its own real-data conversion is
  still pending. New real features must read `resolveClinicContext()` directly and
  never derive permissions from `RoleContext`/`useRole()`/the DEV role switcher.
- `src/dev/` (role switcher, effective-dentists mock resolver) is still present —
  still used by every not-yet-converted mock screen — and remains a disposable,
  never-a-source-of-real-authorization shim, not deleted yet.
- Route guard (`proxy.ts`) enforces real auth on every request, including
  `npm run dev` — no `NODE_ENV === 'development'` bypass.

## Onboarding (real)

- `/registro` — a real 3-step wizard (Cuenta → Clínica → Rol) that creates a real
  Supabase Auth user, a real `clinics` row (name, slug, sede principal with a real
  Leaflet/Nominatim map picker + geocoding, logo upload to a public Storage bucket),
  and the founding `clinic_admin` membership via a `SECURITY DEFINER` bootstrap RPC.
  Handles "already onboarded" (real sign-out) and email-confirmation-pending states.
- Real RLS + GRANTs for every table/RPC this flow touches (see
  `supabase/migrations/2026082*`).

## Clínica (real, Clinic Admin)

- `/clinica` — **Información general** (real, editable inline: name, contact info,
  sede principal with the same real map/geocoding editor as onboarding, logo
  upload/removal against the public `clinic-logos` Storage bucket). **Equipo** (real,
  read-only list of the clinic's real members + their professional profile/
  specialty). **Mi perfil profesional** (real display of the caller's own
  professional profile; editing intentionally disabled — `professional_profiles` has
  no INSERT/UPDATE RLS policy yet, reserved for a future column-whitelisted RPC).
  **Consultorios** — still a placeholder; no real table exists for it yet.

## Pacientes (real, Clinic Admin/Dentist/Assistant)

- `/pacientes` — real, tenant-scoped `patients` table. Search/filter, list, 4-KPI
  header (Pacientes activos / Nuevos este mes are real counts; Con cita próxima / Sin
  atención +6 meses show an honest `—`, not `0` — no real appointments table exists
  yet to compute either), create/edit, and a 3-column patient quick-profile modal
  (`PatientRecordModal`) matching the approved design.
- Tenant isolation and role-based permissions come from
  `resolveClinicContext()`/`clinical-permissions.ts` server-side — never the DEV role
  switcher.

## Historia Clínica (real, all five tabs)

- `/pacientes/[id]/historia-clinica` — real, tenant-scoped patient identity header
  (estado, "odontólogo habitual" — honestly "Aún sin odontólogo" until that real
  relationship exists in the schema, paciente desde) plus a real "Alertas clínicas"
  banner (alergias/condiciones/medicamentos), all fed by real data, never fabricated.
- **Resumen** — real KPI grid + Alertas, driven by the same real
  `patient_medical_histories` row Antecedentes reads/writes.
- **Antecedentes** — real, one row per patient (`patient_medical_histories`),
  editable ("Actualizar antecedentes") by `dentist`/`clinic_admin` with an active
  `professional_profile` (never `clinic_admin` alone) via a `SECURITY DEFINER` RPC.
  Shows real "Actualizado {fecha} · {profesional}" traceability.
- **Odontograma** — real, individual finding records
  (`patient_tooth_findings` — one row per hallazgo, not a JSON blob), reusing the
  approved tooth-chart component exactly. Always renders, including empty. Editable
  ("Actualizar odontograma": select a piece, register/remove hallazgos) under the
  same authorization rule as Antecedentes. Header shows real "Actualizado {fecha} ·
  {profesional}" from the most recently updated finding.
- **Atenciones** — real, `patient_clinical_encounters` (motivo, diagnóstico,
  tratamiento, notas, profesional, fecha/hora). Read-only in this screen by design:
  the approved UI has no "register" action here — encounters are meant to be created
  by completing a real appointment in Agenda, which is still fully mock, so no second
  creation flow was invented. The write RPC exists and is permission-gated, ready for
  that future Agenda integration.
- **Documentos** — real, `patient_clinical_documents` + a private `clinical-documents`
  Storage bucket (20MB limit; JPG/PNG/WEBP/PDF/DOC/DOCX). Two-column layout (list +
  preview: images `object-contain`, PDFs embedded, DOC/DOCX as a file-info card).
  Upload, edit metadata (título/categoría only), and logical archive
  (`archived_at`/`archived_by` — never a physical delete, file stays in Storage) by
  `dentist`/`clinic_admin`; read-only for `assistant`/plain admin (flagged, not yet
  explicitly requested otherwise).
- **Descargar PDF** — real, generated client-side from the same real rows this screen
  already holds (`@react-pdf/renderer`, dynamically imported). Same approved visual
  design as the original mock PDF (colors/layout/typography untouched); patient name
  keeps normal capitalization; footer "Generado por odentia.co" on every page.
- Every write in this feature goes through a `SECURITY DEFINER` RPC, never a direct
  table INSERT/UPDATE/DELETE — `clinic_id` and the acting professional are always
  resolved server-side from `auth.uid()`, never client-supplied.
- Gated to Clinic Admin/Dentist/Assistant roles today; not yet built: Patient access
  to this screen, and any Agenda-driven creation of a real Atención.

---

# Phase 1 legacy — screens still mock

Everything below is unchanged since Phase 1 and still runs entirely on mock data —
not yet converted, not on the current backend-conversion roadmap until their turn
comes.

## Shell & Access (mock parts)

- Role-based navigation still branches on the bridged/mock role (see Autenticación
  above for how a real role reaches it).
- The DEV-only role switcher (`src/dev/`) still exists for fast manual testing of
  every not-yet-converted screen.

## Agenda (the Clinic Admin's operational home) — fully mock

- Weekly appointment board, KPI cards, appointment creation/detail/cancel/"start
  attention" flow, and the interactive clinical-encounter/odontogram screen — all
  still 100% mock data. This is the largest remaining conversion; Historia Clínica's
  Atenciones RPC and Odontograma table were deliberately built ready for it.
- Marketplace card links out to the real external Marketplace app
  (`https://odentia-marketplace.vercel.app`) — the card itself is still a mock
  preview, but the link is real, per Marketplace Independence.

## Admin (the Superadmin's platform-wide home) — fully mock

- `/admin` — platform KPIs, monthly activity, Marketplace overview, recent-clinics
  list, attention list. Gated to Superadmin; Superadmin is locked out of
  `/agenda`/`/pacientes` at the route level.

## Configuración, Mi Suscripción, Reportes — fully mock

- `/configuracion` (Clinic Admin: clinic-wide agenda defaults/notifications/regional
  prefs; Dentist: personal ausencias + notification prefs only), `/suscripcion`
  (Clinic Admin only, mock plan/billing), `/reportes` (Clinic Admin + Dentist, shared
  screen, Dentist scoped to "own activity only") — all UI/UX only, mock data, no
  backend yet.

## Patient Portal — fully mock

- `/portal/*` — Mis citas (book/reschedule-request/cancel/confirm-attendance),
  Mi salud dental, Mi Historia Clínica, clinic info, Mi perfil — all still mock,
  scoped to the logged-in mock Patient identity. Not yet started on the real-backend
  roadmap.

## Identity & Profile (mock parts)

- Per-role mock profile modals/screens for Dentist/Assistant/Superadmin/Patient (the
  Clinic Admin's own identity is now real — see Autenticación/Clínica above).

## Public pages (real, but not backend-tied)

- Landing page, `/planes` (commercial pricing sequence) — real, deployed static/
  marketing pages; "real" here means finished content, not Supabase-backed (they
  have no per-tenant data to begin with).

---

# Development Rules (Current Phase)

Phase 2 backend work is now in scope and actively happening. For every conversion:

Claude MUST:

- Convert one feature vertical at a time — never redesign, never batch multiple
  unrelated verticals into one change.
- Use real Supabase data or an honest empty state — never a mock as fallback, never
  invented/hardcoded clinical or tenant data.
- Derive `clinic_id`/role/permissions server-side from `resolveClinicContext()` —
  never from the DEV role switcher, `RoleContext`, a URL, or a form field.
- Write through a `SECURITY DEFINER` RPC for anything beyond a plain read, with
  `clinic_id` and the acting user always resolved from `auth.uid()` server-side, and
  ship the matching RLS policy + migration alongside the feature that needs it.
- Audit GRANTs explicitly (`grant`/`revoke` in the migration) — never assume a
  policy alone is enough; a missing GRANT is a common, silent failure mode here.
- Keep every still-mock screen (Agenda above all) working completely unmodified
  during its own pending conversion — never share a component between a converted
  real consumer and a still-mock one; build a separate, distinctly-named component
  instead.
- Preserve the already-approved visual design exactly when converting a screen —
  layout, hierarchy, components, spacing, labels, iconography, UX behavior. Replace
  mock → real data only; never substitute an approved screen with a generic
  placeholder.
- Never touch the `demo` branch, and never remove mocks from it.

Claude MUST NOT:

- Integrate payment providers.
- Build Marketplace APIs (Marketplace stays a fully decoupled, independent product —
  see CLAUDE.md).
- Implement background jobs.
- Optimize performance prematurely.
- Anticipate a future conversion's schema/UI before that vertical's own task starts.

---

# MVP Scope

## Public

- Landing Page — done.
- Login — real (Supabase Auth).
- Register — real (`/registro`, 3-step onboarding wizard).
- Forgot Password — pending.

---

## Onboarding

- Create Practice — done, real.
- Configure Schedule — pending.
- Invite Assistant — pending (the wizard's own "Rol" step covers the founding
  admin's role only).

---

## Core

- Dashboard — mock (Agenda for clinic roles, `/admin` for Superadmin); real-data
  conversion pending.
- Schedule — mock; pending.
- Calendar — pending.
- Patients — real (`/pacientes`).
- Patient Details — real (part of the `/pacientes` detail modal).
- Medical Records — real, all five tabs (`/pacientes/[id]/historia-clinica`:
  Resumen, Antecedentes, Odontograma, Atenciones, Documentos, PDF export). Patient
  access to this screen, and Agenda-driven creation of a real Atención, still
  pending.
- Reports — mock; pending.
- Team — real display only (`/clinica`'s Equipo); invite/manage flows pending.
- Subscription — mock; pending.
- Settings — mock; pending.

---

## Patient Portal

- Book Appointment — mock.
- View Appointments — mock.
- Appointment Confirmation — mock.

(No Patient Portal conversion has started yet.)

---

## Marketplace

Marketplace should only be represented as an integrated module.

No real integration is required — the clinic-facing nav/card links to the real
external Marketplace app, which is itself a fully independent product.

---

# Marketplace Status

Marketplace is NOT part of Odentia Core's own implementation. Clinic-facing links
point to the real, independently-deployed Marketplace app
(`https://odentia-marketplace.vercel.app`) — no shared database, no shared business
logic, per Marketplace Independence in CLAUDE.md.

---

# Current Priorities

Priority order:

1. Design System — done.
2. Authentication — done, real.
3. Onboarding — done, real (Create Practice); Invite Assistant / Forgot Password
   pending.
4. Clínica — done, real (Información general, Sede, Logo, Equipo, Mi perfil
   profesional); Consultorios still pending.
5. Patients — done, real.
6. Historia Clínica — done, real, all five tabs + PDF export; Patient access and
   Agenda-driven Atenciones creation pending.
7. Agenda — still mock; next major backend conversion.
8. Patient Portal — still mock; conversion not started.
9. Reports / Team (invite-and-manage) / Subscription / Settings — still mock;
   pending.
10. Marketplace Entry Point — real external link exists; card itself stays a
    preview.

---

# Success Criteria

## Phase 1 (met)

- Every major screen existed, navigation was complete, mobile/desktop experience was
  polished, mock data felt realistic, the prototype was deployed and demonstrable.

## Phase 2 (in progress)

This phase will be considered complete when every feature vertical above runs on
real, tenant-isolated Supabase data with an honest empty state everywhere real data
doesn't exist yet — no mock data remaining outside the (deliberately preserved)
`demo` branch.

---

# Validation

The Phase 1 prototype was reviewed by:

- Project founders
- LopaDent
- Dentists
- Dental assistants

Phase 2 conversions are being validated incrementally per vertical as they ship.

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
- Backend conversion proceeds one vertical at a time, real data or honest empty
  state — never a full-app rewrite, never a mock fallback.

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

Backend integration (Supabase, real authentication, multi-tenant database, file
storage) is already underway — see Phase 2 above. What's left, roughly in order:

- Agenda's real-data conversion (the largest remaining piece; Historia Clínica's
  Atenciones/Odontograma were built anticipating it).
- Patient Portal's real-data conversion.
- Reports / Team (invite-and-manage) / Subscription / Settings real-data conversion.
- Notifications.

---

# Notes for Claude

When implementing any feature ask yourself:

> Does this help validate the product with real users, and does it use real data or
> an honest empty state?

If the answer is "no" to either, postpone it or fix it before shipping.

Always optimize for learning speed, not technical perfection. When converting a
screen from mock to real, the approved Phase 1 design is the source of visual truth
— match it, don't redesign it.
