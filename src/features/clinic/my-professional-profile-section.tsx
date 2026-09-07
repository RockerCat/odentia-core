"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/toast";
import { UserAvatar } from "@/components/user-avatar";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { fetchWeeklyAvailability, summarizeWeeklyAvailability } from "@/features/settings/availability-data";
import { createClient } from "@/lib/supabase/client";
import type { Specialty, TeamMember } from "./data";
import { createMyProfessionalProfile, updateMyProfessionalProfile } from "./professional-profile-actions";

// Mi perfil profesional — Administrador + Odontólogo, never a role swap
// (see task scope). selfMember comes from the real team list, matched
// server-side by the authenticated profile.id — never RoleContext/
// useRole(). Editing is real: update_my_professional_profile() (see that
// migration) — professional_profiles has no RLS UPDATE policy at all, by
// design; every write goes through that SECURITY DEFINER RPC instead,
// which resolves the caller's OWN professional_profile from auth.uid()
// alone, so there is no clinic_id/profile id this form could ever send
// that would let it edit someone else's row or move its own to another
// clinic.
//
// Editable fields are exactly the ones this card already displayed:
// especialidad, registro profesional, duración de cita, biografía.
// Deliberately NOT editable here: Estado (professionalProfile.active) —
// that's a capacity toggle an admin manages via Clínica → Equipo's own
// Desactivar/Reactivar, not a self-service profile field, and neither
// update_my_professional_profile() nor create_my_professional_profile()
// accepts it either.
//
// "Configurar perfil profesional" (when professionalProfile is null — a
// Clinic Admin who hasn't opted into "también atiendo pacientes" yet) is
// now real: create_my_professional_profile() (see that migration), same
// form/fields/state machine as editing, just backed by a create instead of
// an update — never a second, divergent form.
//
// Shared, single-source component: /clinica (Clinic Admin's own view, one
// card among Información general/Equipo/Consultorios — see
// clinic-settings-screen.tsx) and /mi-perfil-profesional (Dentist's own
// dedicated route, this card alone — see that page) both render this
// exact same component, never a second copy of the form/persistence
// logic. `onSaved` is deliberately narrow (just the updated
// professionalProfile, not "the whole members list") so this component
// stays usable by a caller that only ever knows about ONE member (itself)
// as much as one that tracks a full clinic team list.
const DURATION_OPTIONS = [
  { value: "15", label: "15 minutos" },
  { value: "30", label: "30 minutos" },
  { value: "45", label: "45 minutos" },
  { value: "60", label: "60 minutos" },
];

// Same border-primary/10 (Activo) vs border-danger/10 (Inactivo) pill
// already used for Dentist/Patient status elsewhere in the app (see
// DentistProfileModal, patient-detail-modal.tsx) — reused for both
// Equipo's membership.status (clinic-settings-screen.tsx) and this
// section's own professional_profile.active.
export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        active ? "border-primary/25 bg-primary/10 text-primary" : "border-danger/25 bg-danger/10 text-danger"
      }`}
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

export function MyProfessionalProfileSection({
  selfMember,
  specialties,
  onSaved,
}: {
  selfMember: TeamMember | null;
  specialties: Specialty[];
  onSaved: (updated: NonNullable<TeamMember["professionalProfile"]>) => void;
}) {
  const { showToast } = useToast();
  const professionalProfile = selfMember?.professionalProfile ?? null;
  // Real equivalent of the old mock "Administrador Odontólogo Único"
  // framing — she's always the practicing dentist here by definition, so
  // the "también atiendo pacientes" checkbox copy doesn't apply.
  const isAdminWithProfile = selfMember?.role === "clinic_admin" && professionalProfile !== null;
  const selfName = selfMember ? `${selfMember.firstName} ${selfMember.lastName}`.trim() || selfMember.email : "";
  const selfInitials =
    selfMember && (`${selfMember.firstName[0] ?? ""}${selfMember.lastName[0] ?? ""}`.toUpperCase() || selfMember.email[0]?.toUpperCase() || "?");

  // "creating" is the real counterpart of the old disabled "Configurar
  // perfil profesional" button — same form, same state, just backed by
  // create_my_professional_profile() instead of an update (see
  // handleSubmit below).
  const [mode, setMode] = useState<"view" | "editing" | "creating">("view");
  const [specialtyId, setSpecialtyId] = useState<string>("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [duration, setDuration] = useState<string>("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real Horario summary — read-only here (editing lives in Configuración,
  // see horario-editor.tsx: Dentist's own screen, or the Clinic Admin's
  // selector for any professional). Self-fetched client-side, same pattern
  // as RealAppointmentDetailModal's own patient-history fetch, so this
  // works unchanged for both callers of this shared component (/clinica
  // and /mi-perfil-profesional) without either page having to fetch and
  // pass it down separately.
  const professionalProfileId = professionalProfile?.id ?? null;
  // null = loading, [] = loaded with nothing configured yet. Lazy
  // initializer (not an effect reset) since professionalProfileId is
  // already known synchronously from the very first render (selfMember is
  // a prop, never fetched by this component itself) — starts at [] instead
  // of a permanent "Cargando…" when there's no professional_profile at all.
  const [scheduleSummary, setScheduleSummary] = useState<string[] | null>(() => (professionalProfileId ? null : []));
  useEffect(() => {
    if (!professionalProfileId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const blocks = await fetchWeeklyAvailability(supabase, professionalProfileId);
        if (!cancelled) setScheduleSummary(summarizeWeeklyAvailability(blocks));
      } catch {
        if (!cancelled) setScheduleSummary([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [professionalProfileId]);

  const startEdit = () => {
    if (!professionalProfile) return;
    setSpecialtyId(professionalProfile.specialtyId ?? "");
    setLicenseNumber(professionalProfile.licenseNumber ?? "");
    setDuration(professionalProfile.defaultAppointmentDurationMinutes?.toString() ?? "");
    setBio(professionalProfile.bio ?? "");
    setError(null);
    setMode("editing");
  };

  // Never a previous draft to prefill — this only ever shows while
  // professionalProfile is still null.
  const startCreate = () => {
    setSpecialtyId("");
    setLicenseNumber("");
    setDuration("");
    setBio("");
    setError(null);
    setMode("creating");
  };

  // Discards the in-progress draft — the next "Editar"/"Configurar perfil
  // profesional" reseeds fresh, so this never leaves a stale draft to
  // reopen into.
  const cancelForm = () => {
    setMode("view");
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !selfMember) return;
    setSaving(true);
    setError(null);

    const specialtyNameById = new Map(specialties.map((s) => [s.id, s.name]));
    const input = {
      specialtyId: specialtyId || null,
      licenseNumber,
      defaultAppointmentDurationMinutes: duration ? Number(duration) : null,
      bio,
    };
    const outcome =
      mode === "creating"
        ? await createMyProfessionalProfile(input, specialtyNameById)
        : await updateMyProfessionalProfile(input, specialtyNameById);
    setSaving(false);
    if (outcome.status === "error") {
      // Form stays open, entered values stay exactly as typed — never a
      // false success.
      setError(outcome.message);
      return;
    }

    onSaved(outcome.professionalProfile);
    showToast(mode === "creating" ? "Perfil profesional creado correctamente" : "Perfil profesional actualizado correctamente");
    setMode("view");
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      {isAdminWithProfile ? (
        <>
          <h2 className="text-base font-semibold">Mi información profesional</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tu especialidad, registro y horario como odontóloga de la clínica.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-base font-semibold">Mi perfil profesional</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tu especialidad y registro como profesional, si atiendes pacientes en esta clínica.
          </p>
        </>
      )}

      {selfMember && (
        <div className="mt-4 flex items-center gap-3">
          <UserAvatar name={selfName} initials={selfInitials || "?"} avatar_url={selfMember.avatarUrl ?? undefined} sizeClassName="size-10" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selfName}</p>
            <p className="truncate text-xs text-muted-foreground">{selfMember.email}</p>
          </div>
        </div>
      )}

      {mode === "editing" || mode === "creating" ? (
        <ProfileForm
          specialtyId={specialtyId}
          onSpecialtyIdChange={setSpecialtyId}
          licenseNumber={licenseNumber}
          onLicenseNumberChange={setLicenseNumber}
          duration={duration}
          onDurationChange={setDuration}
          bio={bio}
          onBioChange={setBio}
          specialties={specialties}
          saving={saving}
          error={error}
          onSubmit={handleSubmit}
          onCancel={cancelForm}
          submitLabel={mode === "creating" ? "Crear perfil" : "Guardar"}
          savingLabel={mode === "creating" ? "Creando…" : "Guardando…"}
        />
      ) : professionalProfile ? (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-label-foreground">Especialidad</dt>
              <dd className="mt-0.5 font-medium">{professionalProfile.specialtyName ?? "Sin especialidad configurada"}</dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Registro profesional</dt>
              <dd className="mt-0.5 font-medium">{professionalProfile.licenseNumber || "No configurado"}</dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Duración de cita</dt>
              <dd className="mt-0.5 font-medium">
                {professionalProfile.defaultAppointmentDurationMinutes
                  ? `${professionalProfile.defaultAppointmentDurationMinutes} min`
                  : "No configurado"}
              </dd>
            </div>
            {/* Real weekly summary (professional_availability) — edited
                from Configuración, not here (see horario-editor.tsx). */}
            <div className="sm:col-span-2">
              <dt className="text-xs text-label-foreground">Horario</dt>
              {scheduleSummary === null ? (
                <dd className="mt-0.5 font-medium text-muted-foreground">Cargando…</dd>
              ) : scheduleSummary.length === 0 ? (
                <dd className="mt-0.5 font-medium text-muted-foreground">Horario aún no configurado</dd>
              ) : (
                <dd className="mt-0.5 flex flex-col gap-0.5 font-medium">
                  {scheduleSummary.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </dd>
              )}
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-label-foreground">Biografía</dt>
              <dd className="mt-0.5 font-medium">{professionalProfile.bio || "No configurado"}</dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Estado</dt>
              <dd className="mt-1">
                <StatusBadge active={professionalProfile.active} />
              </dd>
            </div>
          </dl>
          <button type="button" onClick={startEdit} className="mt-3 text-xs font-medium text-primary hover:underline">
            Editar perfil profesional
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          <p>Todavía no tienes un perfil profesional configurado en esta clínica.</p>
          <button
            type="button"
            onClick={startCreate}
            className="mt-3 text-xs font-medium text-primary hover:underline"
          >
            Configurar perfil profesional
          </button>
        </div>
      )}
    </div>
  );
}

// Shared by both "creating" (create_my_professional_profile) and "editing"
// (update_my_professional_profile) — same fields, same layout, only the
// submit label and which RPC handleSubmit calls differ (see the caller).
// Never a second, divergent form for the two cases.
function ProfileForm({
  specialtyId,
  onSpecialtyIdChange,
  licenseNumber,
  onLicenseNumberChange,
  duration,
  onDurationChange,
  bio,
  onBioChange,
  specialties,
  saving,
  error,
  onSubmit,
  onCancel,
  submitLabel,
  savingLabel,
}: {
  specialtyId: string;
  onSpecialtyIdChange: (value: string) => void;
  licenseNumber: string;
  onLicenseNumberChange: (value: string) => void;
  duration: string;
  onDurationChange: (value: string) => void;
  bio: string;
  onBioChange: (value: string) => void;
  specialties: Specialty[];
  saving: boolean;
  error: string | null;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  savingLabel: string;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-label-foreground">Especialidad</span>
          <select value={specialtyId} onChange={(e) => onSpecialtyIdChange(e.target.value)} disabled={saving} className={FIELD_CLASS}>
            <option value="">Sin especialidad</option>
            {specialties.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-label-foreground">Registro profesional</span>
          <input
            value={licenseNumber}
            onChange={(e) => onLicenseNumberChange(e.target.value)}
            disabled={saving}
            placeholder="Número de registro"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-label-foreground">Duración de cita</span>
          <select value={duration} onChange={(e) => onDurationChange(e.target.value)} disabled={saving} className={FIELD_CLASS}>
            <option value="">No configurado</option>
            {DURATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-xs text-label-foreground">Biografía</span>
          <textarea
            value={bio}
            onChange={(e) => onBioChange(e.target.value)}
            disabled={saving}
            rows={3}
            placeholder="Cuéntales a tus pacientes sobre tu experiencia"
            className={FIELD_CLASS}
          />
        </label>
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? savingLabel : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
