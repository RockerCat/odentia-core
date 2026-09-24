"use client";

import { useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { updatePatient, type PatientPatch } from "@/features/patients/actions";
import type { PatientIdentityCatalogs } from "@/features/patients/data";
import type { ReferenceValue } from "./catalog-data";
import { PATIENT_MISSING_FIELD_LABELS, type PatientMissingField, type PatientRipsGaps } from "./patient-rips-gaps";
import { ReferenceValueAutocomplete } from "./reference-value-autocomplete";

// Same ISO 3166-1 numérico code PatientRecordModal already keys off for
// its own U07/U08 Colombia conditional (see that file's own COLOMBIA_CODE
// comment) — identifying Colombia by its official code, never by a label
// match (labels aren't guaranteed stable/unique the way the code is).
const COLOMBIA_CODE = "170";

// Presentation-only reordering of the País de residencia options —
// Colombia first (the overwhelming majority of this clinic's patients),
// then every other country alphabetically by its own visible label.
// Never touches codes/labels, never mutates `countries` (identityCatalogs.Pais
// is a shared prop reused across renders/other consumers) — always
// returns a fresh array. Purely how the list is PRESENTED; it never picks
// a default value, so an empty selection stays empty until the admin
// actually chooses one.
export function sortCountriesColombiaFirst(countries: ReferenceValue[]): ReferenceValue[] {
  const colombia = countries.filter((c) => c.code === COLOMBIA_CODE);
  const rest = countries.filter((c) => c.code !== COLOMBIA_CODE).sort((a, b) => a.label.localeCompare(b.label, "es"));
  return [...colombia, ...rest];
}

// Prompt Ninja "corregir datos faltantes del paciente sin salir de /rips"
// — the ONE write path this modal uses is updatePatient() (existing,
// src/features/patients/actions.ts): a partial patch (only keys actually
// present in the patch object are sent to Postgres — every omitted field
// is left completely untouched), under the SAME
// patients_update_admin_or_assistant RLS this codebase already relies on
// everywhere else a patient gets edited. No new Server Action, no new
// RPC, no migration — /rips is already clinic_admin-only end to end
// (see rips-screen.tsx/export-actions.ts's own requireClinicAdminContext),
// a strict subset of who patients_update_admin_or_assistant already
// allows, so this never widens who can write a patient record. clinicId
// is never sent by this modal at all — tenant isolation is the row's own
// clinic_id, enforced by that RLS policy's USING/WITH CHECK, exactly like
// every other patient edit already is.
//
// Only ever shows the fields `gaps.missingFields` actually names — never
// the full patient editor, never a field that's already complete. Reuses
// the exact catalogs/select markup PatientRecordModal already uses for
// these same fields (identityCatalogs, ReferenceValueAutocomplete for
// Municipio) — no new catalog fetch, no hardcoded regulatory options.
export function CompletePatientRipsDataModal({
  gaps,
  identityCatalogs,
  onClose,
  onSaved,
}: {
  gaps: PatientRipsGaps;
  identityCatalogs: PatientIdentityCatalogs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [documentType, setDocumentType] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sexCode, setSexCode] = useState("");
  const [userTypeCode, setUserTypeCode] = useState("");
  const [countryOfResidenceCode, setCountryOfResidenceCode] = useState("");
  const [municipalityOfResidenceCode, setMunicipalityOfResidenceCode] = useState("");
  const [municipalityLabel, setMunicipalityLabel] = useState("");
  const [residenceZoneCode, setResidenceZoneCode] = useState("");
  const [countryOfOriginCode, setCountryOfOriginCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shows = (field: PatientMissingField) => gaps.missingFields.includes(field);

  // All visible fields must be filled before saving — the modal's whole
  // premise is "complete what's missing", so a half-filled save that
  // still leaves a pendiente behind would be a confusing, silent partial
  // success. updatePatient() itself would happily accept a partial patch
  // (that's what makes it safe to reuse here at all) — this is a UI
  // requirement, not a write-path limitation.
  const canSave =
    (!shows("documentType") || documentType.trim() !== "") &&
    (!shows("documentNumber") || documentNumber.trim() !== "") &&
    (!shows("birthDate") || birthDate.trim() !== "") &&
    (!shows("sexCode") || sexCode !== "") &&
    (!shows("userTypeCode") || userTypeCode !== "") &&
    (!shows("countryOfResidenceCode") || countryOfResidenceCode !== "") &&
    (!shows("municipalityOfResidenceCode") || municipalityOfResidenceCode !== "") &&
    (!shows("residenceZoneCode") || residenceZoneCode !== "") &&
    (!shows("countryOfOriginCode") || countryOfOriginCode !== "");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);

    // Only the fields this modal actually showed are ever sent — never a
    // full-object patch, so a field this patient already had (and this
    // modal never rendered) can never be accidentally cleared.
    const patch: PatientPatch = {};
    if (shows("documentType")) patch.documentType = documentType;
    if (shows("documentNumber")) patch.documentNumber = documentNumber;
    if (shows("birthDate")) patch.birthDate = birthDate;
    if (shows("sexCode")) patch.sexCode = sexCode;
    if (shows("userTypeCode")) patch.userTypeCode = userTypeCode;
    if (shows("countryOfResidenceCode")) patch.countryOfResidenceCode = countryOfResidenceCode;
    if (shows("municipalityOfResidenceCode")) patch.municipalityOfResidenceCode = municipalityOfResidenceCode;
    if (shows("residenceZoneCode")) patch.residenceZoneCode = residenceZoneCode;
    if (shows("countryOfOriginCode")) patch.countryOfOriginCode = countryOfOriginCode;

    const outcome = await updatePatient(gaps.patientId, patch);
    setSaving(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Completar datos del paciente para RIPS"
        className="relative z-10 flex w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:w-full sm:max-w-sm sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Completar datos del paciente para RIPS</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <p className="text-sm font-medium">{gaps.patientName}</p>
            <p className="text-xs text-muted-foreground">
              Completa la información necesaria para incluir este paciente en el archivo RIPS.
            </p>
          </div>

          {(shows("documentType") || shows("documentNumber")) && (
            <div className="flex gap-2">
              {shows("documentType") && (
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  <span className="text-label-foreground">{PATIENT_MISSING_FIELD_LABELS.documentType}</span>
                  <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className={FIELD_CLASS}>
                    <option value="">Selecciona</option>
                    {identityCatalogs.TipoDocumento.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {shows("documentNumber") && (
                <label className="flex flex-[1.5] flex-col gap-1 text-sm">
                  <span className="text-label-foreground">{PATIENT_MISSING_FIELD_LABELS.documentNumber}</span>
                  <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} className={FIELD_CLASS} autoFocus />
                </label>
              )}
            </div>
          )}

          {shows("birthDate") && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">{PATIENT_MISSING_FIELD_LABELS.birthDate}</span>
              <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={FIELD_CLASS} />
            </label>
          )}

          {shows("sexCode") && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">{PATIENT_MISSING_FIELD_LABELS.sexCode}</span>
              <select value={sexCode} onChange={(e) => setSexCode(e.target.value)} className={FIELD_CLASS}>
                <option value="">Selecciona</option>
                {identityCatalogs.SEXOconIndeterminado.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {shows("userTypeCode") && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">{PATIENT_MISSING_FIELD_LABELS.userTypeCode}</span>
              <select value={userTypeCode} onChange={(e) => setUserTypeCode(e.target.value)} className={FIELD_CLASS}>
                <option value="">Selecciona</option>
                {identityCatalogs.RIPSTipoUsuarioVersion2.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {shows("countryOfResidenceCode") && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">{PATIENT_MISSING_FIELD_LABELS.countryOfResidenceCode}</span>
              <select value={countryOfResidenceCode} onChange={(e) => setCountryOfResidenceCode(e.target.value)} className={FIELD_CLASS}>
                <option value="">Selecciona</option>
                {sortCountriesColombiaFirst(identityCatalogs.Pais).map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {shows("municipalityOfResidenceCode") && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">{PATIENT_MISSING_FIELD_LABELS.municipalityOfResidenceCode}</span>
              <ReferenceValueAutocomplete
                catalogKey="Municipio"
                value={municipalityOfResidenceCode}
                displayLabel={municipalityLabel}
                placeholder="Busca un municipio (p. ej. Tunja)"
                onChange={(v) => {
                  setMunicipalityOfResidenceCode(v?.code ?? "");
                  setMunicipalityLabel(v?.label ?? "");
                }}
              />
            </label>
          )}

          {shows("residenceZoneCode") && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">{PATIENT_MISSING_FIELD_LABELS.residenceZoneCode}</span>
              <select value={residenceZoneCode} onChange={(e) => setResidenceZoneCode(e.target.value)} className={FIELD_CLASS}>
                <option value="">Selecciona</option>
                {identityCatalogs.ZonaVersion2.map((z) => (
                  <option key={z.code} value={z.code}>
                    {z.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {shows("countryOfOriginCode") && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">{PATIENT_MISSING_FIELD_LABELS.countryOfOriginCode}</span>
              <select value={countryOfOriginCode} onChange={(e) => setCountryOfOriginCode(e.target.value)} className={FIELD_CLASS}>
                <option value="">Selecciona</option>
                {sortCountriesColombiaFirst(identityCatalogs.Pais).map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSave || saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
