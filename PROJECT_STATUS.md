# PROJECT_STATUS.md

# Odentia Core

**Last Updated:** 2026-09-04

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
real authentication, real clinic onboarding, `/clinica` (including its Consultorios
catalog), `/pacientes`, `/pacientes/[id]/historia-clinica` (all five tabs, plus a real
PDF export), and — as of this update — **Agenda**: the weekly board, KPI cards, cita
CRUD (create/reschedule/cancel/reactivate/"Paciente llegó"), and the real
"Iniciar/Continuar atención" → "Finalizar atención" flow, which is what now actually
creates real Atención rows for Historia Clínica. Configuración's own Tratamientos
section is real too (the catalog Agenda's "Tratamiento" picker reads). Everything else
(`/admin`, the rest of Configuración, Mi Suscripción, Reportes, the Patient Portal) is
still exactly the Phase 1 mock prototype, deliberately untouched — see each section
below.

---

# Current Objective

Keep converting Odentia Core from the validated mock prototype to a real,
multi-tenant Supabase backend — one feature vertical at a time, always real data or
an honest empty state, never a redesign of the already-approved UI, and never
breaking a still-mock screen (the Patient Portal above all — now the largest
remaining surface) while its own conversion is pending.

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
  (`src/features/session/role-bridge.ts`) so every still-mock screen (the Patient
  Portal above all) keeps working completely unmodified while its own real-data
  conversion is still pending. New real features must read `resolveClinicContext()` directly and
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
  **Consultorios** — real, tenant-scoped catalog (`public.rooms`): add/rename, no
  physical delete (`active = false` instead, since a past appointment's `room` is a
  snapshot that must stay findable). Backs Agenda's own "Consultorio" picker (see
  Agenda below) — same list/actions pattern as Configuración's Tratamientos section,
  reused rather than duplicated.

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
- **Resumen** — all 8 cards real, none an inferred/fabricated value: Alergias/
  Medicamentos/Condiciones (`patient_medical_histories`, same row Antecedentes
  reads/writes), Última atención (`patient_clinical_encounters`, finalized
  only), Tratamientos activos (`patient_treatment_plan_items`, see Plan de
  Tratamiento below), Próxima cita (`appointments`, earliest non-terminal
  future row), Última actualización del odontograma
  (`patient_tooth_findings`), Notas clínicas importantes
  (`patient_clinical_notes`, see below). Plus the existing Alertas banner.
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
  tratamiento, notas, indicaciones al paciente, profesional, fecha/hora), only ever
  shows rows with `finalized_at is not null` — a draft saved but not yet finalized
  from Agenda's Atención screen is never shown here. Read-only in this screen by
  design: the approved UI has no "register" action here — rows are created/updated
  by "Guardar borrador"/"Finalizar atención" in Agenda's real Atención flow (see
  Agenda below), never a second creation flow. Each row is now linked to its
  originating Cita via a nullable, unique `appointment_id` (historical/manual
  encounters keep it null) — at most one encounter per Cita, enforced by a partial
  unique index, not just app logic. Procedimientos realizados live in their own
  `patient_clinical_encounter_procedures` child table; this tab still reads the
  parent row's auto-derived `treatment` summary, unchanged.
- **Documentos** — real, `patient_clinical_documents` + a private `clinical-documents`
  Storage bucket (20MB limit; JPG/PNG/WEBP/PDF/DOC/DOCX). Two-column layout (list +
  preview: images `object-contain`, PDFs embedded, DOC/DOCX as a file-info card).
  Upload, edit metadata (título/categoría only), and logical archive
  (`archived_at`/`archived_by` — never a physical delete, file stays in Storage) by
  `dentist`/`clinic_admin`; read-only for `assistant`/plain admin (flagged, not yet
  explicitly requested otherwise).
- **Notas clínicas importantes** (Resumen card) — real, `patient_clinical_notes`:
  persistent, patient-level notes, explicitly distinct from an encounter's own
  `notes` and from Antecedentes' `observations`. Multiple active notes shown
  most-recent-first on the card; "Gestionar notas" opens the full create/edit/
  archive surface. Logical archive only (`archived_at`/`archived_by`, never a
  physical delete). `dentist`/clinically-active `clinic_admin` can write;
  `assistant` read-only.
- **Plan de Tratamiento** (Resumen's "Tratamientos activos" card) — real,
  `patient_treatment_plans` (one implicit row per patient, created on first
  item — no "create plan" step) + `patient_treatment_plan_items` (status
  `planned | in_progress | completed | cancelled`; "activo" = `planned` +
  `in_progress`). Each item optionally references the `treatments` catalog
  but always stores its own `treatment_name` **snapshot** — a later catalog
  rename never rewrites existing plan history. "Ver plan de tratamiento"
  opens create/edit/change-status, with an Activos/Completados/Cancelados/
  Todos filter so closed items are never mixed into the active view but are
  never deleted either. Independent of Atenciones: finishing a procedure
  during an atención never auto-completes a plan item (not built in this
  pass). Same `dentist`/clinically-active `clinic_admin` write, `assistant`
  read-only rule.
- **Descargar PDF** — real, generated client-side from the same real rows this screen
  already holds (`@react-pdf/renderer`, dynamically imported), now including
  compact "Notas clínicas importantes" (active only) and "Plan de tratamiento"
  (active only) sections. Same approved visual design as the original mock PDF
  (colors/layout/typography untouched); patient name keeps normal
  capitalization; footer "Generado por odentia.co" on every page.
- Every write in this feature goes through a `SECURITY DEFINER` RPC, never a direct
  table INSERT/UPDATE/DELETE — `clinic_id` and the acting professional are always
  resolved server-side from `auth.uid()`, never client-supplied.
- Gated to Clinic Admin/Dentist/Assistant roles today; not yet built: Patient access
  to this screen.

---

## Navegación y feedback global (real, cross-cutting)

Two transversal UX gaps were closed across every real screen, not scoped to one
vertical:

- **Toast/success feedback** — `src/components/toast.tsx`
  (`ToastProvider`/`useToast()`), mounted once in the root layout. Every
  mutation across Agenda (crear/reprogramar cita) and Historia Clínica
  (Notas/Plan de Tratamiento create/edit/archive/status-change) now follows
  click → pending → backend success → toast, never a false-success toast on
  error, never a duplicate loader on top of an action's own contextual
  pending state.
- **Navigation pending feedback** — real Sidebar/BottomTabBar/Portal-nav
  `<Link>`s show an immediate, per-item pending indicator (Next's own
  `useLinkStatus()`, via `src/components/shell/nav-link-status.tsx`) instead
  of going silent while the next page loads; the active item never flips
  until the destination actually renders. Closed the same gap for the plain
  (non-`<Link>`) programmatic-navigation buttons that had none: "Salir",
  "Ver historia clínica", "Ver paciente", "Volver a Agenda", "Ver o
  modificar cita", and Historial de citas' own "Atrás".
- Also fixed in this pass: a slot-collision bug that could hide a live Cita
  behind a stale row in the same professional+time slot, and a mislabeled
  "Tratamiento" heading in Atenciones now correctly reading "Procedimientos
  realizados".

---

## Agenda (real, Clinic Admin/Dentist/Assistant)

- `/agenda` — real, tenant-scoped weekly appointment board
  (`RealAppointmentsBoard`/`RealAgendaScreen`) + KPI cards (`RealSummaryCards`: Citas
  hoy / Confirmadas / Pendientes de confirmar are real counts scoped to the caller —
  a Dentist sees only their own; "Alertas" is an honest `0`/"Sin alertas aún", no
  backing table yet). Same approved visual design as the Phase 1 demo — separate,
  distinctly-named `Real*` components from the still-mock `appointments-card.tsx`/
  `summary-cards.tsx` they were ported from, never shared.
- **Cita CRUD** — create (`RealNewAppointmentModal`, Paciente/Profesional/Consultorio/
  Tratamiento all real catalogs), reschedule/cancel/reactivate/change status/
  "Paciente llegó" (`RealAppointmentDetailModal`). Real 8-value status vocabulary
  (`scheduled | confirmed | patient_arrived | waiting_room | in_progress | completed
  | no_show | cancelled`, see `appointments-data.ts`) — closer to CLAUDE.md's actual
  Cita lifecycle than the mock's own flattened 6-value stand-in;
  `patient_arrived`/`waiting_room` are declared but have no dedicated UI action yet
  (same gap the schema already flagged); `no_show` now does (see "Sin cerrar" below).
  Create/reschedule now close the feedback loop end to end: pending → backend
  success → a toast ("Cita creada/reprogramada correctamente" with paciente ·
  fecha · hora) — the modal only ever closes on confirmed success, never
  before — and the board auto-jumps to the appointment's day and briefly
  highlights its slot if it landed outside the currently-selected day.
- **"Sin cerrar"** (`real-status.ts`) — a non-terminal Cita more than 2 hours
  (`UNRESOLVED_GRACE_MINUTES`) past `startsAt + durationMinutes` reads as `Sin cerrar`
  everywhere its status shows (board, KPIs, detail modal, history), purely derived —
  the real `status` never changes on its own. Covers both an `in_progress` Cita stuck
  running (resolved via "Continuar atención"/"Finalizar atención") and one that never
  started at all (resolved via "Iniciar atención" or the new "Marcar No asistió",
  `markNoShow` in `appointments-actions.ts`).
- **No past appointments, one rule, everywhere**: `appointments-actions.ts`'s
  `isPastInstant` is the single backend source of truth (rejects any past `starts_at`
  on create or reschedule); `real-format.ts`'s `isPastSlot`/`isPastDayKey` mirror it
  at the UI layer (past days/times are disabled, not just rejected after submit) for
  every real date/time picker — Agenda's "Nueva cita", the reschedule editor, and
  Atención's own "Agendar próxima cita" all resolve to the same `RealNewAppointmentModal`,
  so there is exactly one implementation, not one per screen.
- **Iniciar/Continuar atención → Finalizar atención (real)**: the detail modal's
  primary CTA moves the Cita to `in_progress` and opens
  `/agenda/atencion/[appointmentId]` — a real, routed, full-screen port of the
  approved clinical-encounter design (`RealClinicalEncounterScreen`), keyed by the
  appointment id itself (not client state), so a refresh mid-attention reconstructs
  the exact same Cita/Odontograma from Postgres. Reopening an already-`in_progress`
  Cita offers "Continuar atención" onto that same URL — never a duplicate.
  - **Odontograma** inside the attention screen is the SAME real editor Historia
    Clínica uses (`EditOdontogramaModal`/`public.patient_tooth_findings`) — not a
    second implementation. It shows the patient's whole cumulative odontogram
    (there's no per-visit odontogram concept), so a finding from an earlier visit is
    expected to already show up on a brand-new atención.
  - **"Guardar borrador" (real)**: persists the encounter's current
    notas/indicaciones/procedimientos via `upsert_patient_clinical_encounter`
    (`clinic_id`-scoped, clinic-wide clinical write — see Roles below), keyed by
    `appointment_id` so it always updates the SAME row, never inserts a second one.
    `finalized_at` (nullable) is the draft/finalized state itself — a draft never
    flips the Cita's own `status`. Refresh, "Continuar atención," or a second
    "Guardar borrador" all reconstruct/update the exact same persisted draft
    (`existingEncounter`/`existingProcedures` in the route's own loader).
  - **Procedimientos realizados** — real, `patient_clinical_encounter_procedures`
    (one row per procedure: name + optional note, not JSON), replaced wholesale on
    every save/finalize (the UI always edits the full set). `treatment` on the
    parent row stays an auto-derived flattened summary for Historia Clínica/PDF,
    which read it unchanged.
  - **"Finalizar atención"** upserts the SAME real `patient_clinical_encounters`
    row (idempotent by `appointment_id` — a retry, two concurrent tabs, or a
    resumed draft can never create a second row or overwrite an already-finalized
    one) and only THEN marks the Cita `completed` — never the other way around, so
    a failed write leaves the Cita safely `in_progress` and retryable. Redirects
    back to `/agenda` afterward, never to Historia Clínica automatically (Historia
    Clínica just picks the new Atención up next time it's opened — filtered to
    `finalized_at is not null`, a draft is never shown there).
- Marketplace card still links out to the real external Marketplace app
  (`https://odentia-marketplace.vercel.app`) — the card itself stays a mock preview,
  per Marketplace Independence.
- "Iniciar/Continuar atención" is gated by `canEditClinicalData()` (the same rule
  Historia Clínica uses), not just role — a Clinic Admin with no active
  `professional_profile` never sees the CTA, closing a dead-end where she could
  otherwise move a Cita to `in_progress` and fill in the whole encounter form only to
  hit a permission error at "Finalizar atención." `/agenda/atencion/[appointmentId]`
  also self-heals a scheduled/confirmed Cita to `in_progress` on load, so a
  direct/bookmarked URL can never skip straight to `completed`.
- Not yet real: `Solicitud de Cita` (Patient-initiated request lifecycle — Patient
  Portal is still fully mock) and a front-desk flow for `patient_arrived`/`waiting_room`.
- **Roles/RLS for clinical writes (decided)**: any active Dentist, or a Clinic
  Admin with her own active `professional_profile`, may register/edit clinical
  data (Atenciones, Antecedentes, Odontograma) for ANY patient in her clinic —
  deliberately clinic-wide, never restricted to "assigned to this professional."
  `clinic_id` is the only mandatory isolation boundary. CLAUDE.md's Roles section
  reflects this; RLS/`is_active_clinical_professional()` already implemented it
  exactly, untouched. Assistant can read Historia Clínica per existing rules but
  can never start/continue/edit/finalize a clinical encounter.
- Known gap (tracked, not yet resolved): "¿Necesita próxima cita?" 's Sí/No
  toggle in `RealClinicalEncounterScreen` is UI-only — only the "Tratamiento
  recomendado" selection has real effect (it preselects "Agendar próxima cita"'s
  reason field); the toggle itself and whether a follow-up was actually needed are
  never persisted anywhere.

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

## Admin (the Superadmin's platform-wide home) — fully mock

- `/admin` — platform KPIs, monthly activity, Marketplace overview, recent-clinics
  list, attention list. Gated to Superadmin; Superadmin is locked out of
  `/agenda`/`/pacientes` at the route level.

## Configuración, Mi Suscripción, Reportes — mostly mock

- `/configuracion` (Clinic Admin: clinic-wide agenda defaults/notifications/regional
  prefs; Dentist: personal ausencias + notification prefs only), `/suscripcion`
  (Clinic Admin only, mock plan/billing), `/reportes` (Clinic Admin + Dentist, shared
  screen, Dentist scoped to "own activity only") — all UI/UX only, mock data, no
  backend yet. Exception: Configuración's own **Tratamientos** section is real
  (`public.treatments`, same list/actions pattern as Clínica's Consultorios) — it
  backs Agenda's "Tratamiento" picker.

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
- Keep every still-mock screen (the Patient Portal above all) working completely
  unmodified during its own pending conversion — never share a component between a
  converted real consumer and a still-mock one; build a separate, distinctly-named
  component instead.
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

- Dashboard — Agenda (clinic roles) is real, see "Agenda (real...)" above;
  `/admin` (Superadmin) is still mock.
- Schedule — mock; pending.
- Calendar — pending.
- Patients — real (`/pacientes`).
- Patient Details — real (part of the `/pacientes` detail modal).
- Medical Records — real, all five tabs (`/pacientes/[id]/historia-clinica`:
  Resumen — all 8 cards real, including Notas clínicas importantes and Plan de
  Tratamiento — Antecedentes, Odontograma, Atenciones — now populated by
  Agenda's real "Finalizar atención" — Documentos, PDF export). Patient access
  to this screen still pending.
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
   profesional, Consultorios).
5. Patients — done, real.
6. Historia Clínica — done, real, all five tabs + PDF export, Resumen's 8
   cards all real (Notas clínicas importantes, Plan de Tratamiento included),
   Atenciones now Agenda-driven; Patient access still pending.
7. Agenda — done, real (board, KPIs, cita CRUD, Iniciar/Continuar/Finalizar
   atención); front-desk `patient_arrived`/`waiting_room`/no-show actions and
   Solicitud de Cita still pending.
8. Patient Portal — still mock; conversion not started; now the largest remaining
   mock surface.
9. Reports / Team (invite-and-manage) / Subscription / rest of Settings — still
   mock; pending.
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

- Patient Portal's real-data conversion (now the largest remaining piece).
- Reports / Team (invite-and-manage) / Subscription / rest of Settings real-data
  conversion.
- Agenda's own remaining gaps: front-desk `patient_arrived`/`waiting_room` flow,
  "Marcar no asistió", and the real Solicitud de Cita lifecycle (depends on the
  Patient Portal conversion above).
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
