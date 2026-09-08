# PROJECT_STATUS.md

# Odentia Core

**Last Updated:** 2026-09-08

---

# Estado actual

**FEATURE COMPLETE — MVP scope.**

Every feature vertical in the MVP scope (see "REAL / COMPLETO PARA MVP" below) runs
on real, tenant-isolated Supabase data — Auth, Postgres, RLS, Storage — with an
honest empty state everywhere real data doesn't exist yet. The only screens still on
Phase 1 mock data are the ones explicitly out of scope for this MVP (see "OUT OF
SCOPE ACTUAL" below): Mi Suscripción, Superadmin/`/admin`, and the Patient Portal's
own Mi salud dental.

**Feature Complete ≠ Production Ready.** This milestone means every vertical is
implemented and internally verified by reading the code/migrations/RLS directly —
not that every flow has been exercised end-to-end with real, independent accounts
(a second real staff account accepting an invitation, a real Patient session, two
Dentists in the same clinic, etc.). That's exactly what happens next: QA /
stabilization / release readiness — see "QA ONLY / PRE-RELEASE" below for the
consolidated checklist, and treat it as the actual next phase, not a footnote.

Historical framing, kept for continuity: **Phase 1** (below) was the mock,
navigable-only prototype. **Phase 2** was converting it to real Supabase data, one
vertical at a time, never redesigning the approved UI. Phase 2 is done. What's next
is QA/stabilization — not more building — before this is production-ready.

---

# REAL / COMPLETO PARA MVP

Real Supabase Auth + Postgres + RLS + Storage, tenant-isolated, unless noted.
Detailed per-vertical implementation notes are further below.

- **Auth** — real Supabase Auth: login/logout, forgot/reset password, onboarding
  (`/registro`, 3-step wizard), route protection (`src/lib/supabase/proxy.ts`, no
  dev bypass). Staff and Patient invitations are both real (real tokens, real
  acceptance flows) — shared manually as a copyable link; **no automated email**
  exists yet for either.
- **Onboarding** — real 3-step wizard creating a real Supabase Auth user, `clinics`
  row (with sede principal + map/geocoding + logo), and the founding `clinic_admin`
  membership.
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
  (constraint + trigger), not just app code.
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

# QA ONLY / PRE-RELEASE

Implemented and verified by reading the code/migrations/RLS directly. **Not** yet
exercised end-to-end with independent real accounts — this is exactly what the
next phase (Prompt Master de QA) is for. None of these are P0/P1 feature gaps;
treat a failure found here as a bug to fix, not evidence the feature doesn't exist.

- [ ] Equipo: invite → accept with a second real account (Dentist or Assistant).
- [ ] Clinic Admin with no `professional_profile` → self-creates one via
      `/mi-perfil-profesional` or `/clinica` in a real browser session.
- [ ] Reportes with more than one real professional in the same clinic (filter by
      professional).
- [ ] Patient Portal with a real, independent Patient login (not just reading the
      code path).
- [ ] Staff generates a Patient Portal invitation → patient accepts via a real
      account → "Acceso al Portal activo" shows back on the staff side.
- [ ] Solicitud de Cita: create (Patient) → accept (staff) → confirm exactly 1
      `appointments` row is created and the request is linked.
- [ ] Solicitud de Cita: reject → confirm no `appointments` row is ever created.
- [ ] Solicitud de Cita: double-accept / double-reject race — confirm the second
      call is rejected, never a duplicate Cita.
- [ ] Patient/clinic isolation: a Patient linked to clinic A can never read/act on
      anything in clinic B; a Patient can never read another patient's data.
- [ ] Cross-dentist permissions: a Dentist can never see/act on another Dentist's
      own-scoped Citas or Solicitudes in the same clinic.
- [ ] Clinical documents: a real Patient session can open a signed URL for her own
      document, and only her own.
- [ ] Patient confirms attendance (`scheduled` → `confirmed`) from a real Portal
      session.
- [ ] Availability/absences with a second real Dentist configured differently from
      the first — confirm neither's rules leak into the other's slots.
- [ ] Full arrival flow with a real session: Paciente llegó → Sala de espera →
      Iniciar atención → Finalizar atención, confirm the Cita and the resulting
      Atención end up correct.
- [x] `ClinicalNotesModal` showing "Sin asignar" for a real Patient session —
      **fixed during the pre-release QA Master** (was a duplicated author
      lookup that never used the Patient-aware fallback every other tab
      already had). No longer a QA item; verified by re-running
      `qa-clinical-notes-check.mjs` (still green — staff behavior unchanged)
      plus `tsc`/`eslint`.
- [ ] Node runtime: local/CI currently run on Node 20, which `@supabase/supabase-js`
      already logs as deprecated (`Node.js 20 and below are deprecated`). Not
      currently breaking anything — revisit the Node 22 upgrade before or shortly
      after release, whichever is lower-risk operationally.
- [x] **Migrations gate:** `supabase migration list --linked` re-confirmed during
      the pre-release QA Master — 47/47 in sync, `local` = `remote`.

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

## Onboarding (real)

- `/registro` — a real 3-step wizard (Cuenta → Clínica → Rol) that creates a real
  Supabase Auth user, a real `clinics` row (name, slug, sede principal with a real
  Leaflet/Nominatim map picker + geocoding, logo upload to a public Storage
  bucket), and the founding `clinic_admin` membership via a `SECURITY DEFINER`
  bootstrap RPC (`bootstrap_clinic`). Handles "already onboarded" and
  email-confirmation-pending states.

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

## Identity & Profile (mock parts)

Per-role mock profile modals/screens still exist for the DEV role switcher's own
preview (`AdminProfileModal`/`AssistantProfileModal` in `src/features/dashboard/`)
— these back development-only tooling, not any real screen a real user reaches.

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

Marketplace is NOT part of Odentia Core's own implementation. Clinic-facing links
point to the real, independently-deployed Marketplace app
(`https://odentia-marketplace.vercel.app`) — no shared database, no shared
business logic, per Marketplace Independence in CLAUDE.md.

---

# Success Criteria

## Phase 1 (met)

Every major screen existed, navigation was complete, mobile/desktop experience was
polished, mock data felt realistic, the prototype was deployed and demonstrable.

## Phase 2 (met)

Every MVP-scope feature vertical runs on real, tenant-isolated Supabase data with
an honest empty state everywhere real data doesn't exist yet.

## Phase 3 — QA / Stabilization / Release Readiness (current)

Complete when every item in "QA ONLY / PRE-RELEASE" above has been exercised with
real, independent accounts and any bugs found are fixed — not when new features
are added.

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

QA / stabilization / release readiness (see "QA ONLY / PRE-RELEASE" above) is the
actual next phase — not more feature building. After that:

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
