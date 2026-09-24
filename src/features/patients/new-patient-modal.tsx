"use client";

import { useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/form-primitives";
import { sortCountriesColombiaFirst } from "@/features/rips/complete-patient-rips-data-modal";
import { ReferenceValueAutocomplete } from "@/features/rips/reference-value-autocomplete";
import { createPatient } from "./actions";
import type { Patient, PatientIdentityCatalogs } from "./data";
import { COLOMBIA_CODE, getMissingNewPatientFields, type NewPatientMissingField } from "./new-patient-completeness";

// Purely visual — the underlying <input>/<select> already carries the
// real `required` attribute, which is what actually tells assistive
// tech this field is mandatory; aria-hidden here avoids a screen reader
// redundantly announcing a bare "asterisk" on top of that.
function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-warning">
      {" "}
      *
    </span>
  );
}

// Same base look as FIELD_CLASS, character-for-character, with only the
// border/focus-border color swapped — never both a border-border and a
// border-danger utility present at once (Tailwind doesn't guarantee a
// later class in the string wins over an earlier one targeting the same
// property), so this is the reliable way to override it, not just
// appending a danger class after FIELD_CLASS. Background always stays
// bg-background regardless — this never paints the whole field red, only
// the border.
function fieldClassName(invalid: boolean): string {
  return invalid
    ? "w-full rounded-lg border border-danger/60 bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-danger/60 focus:outline-none"
    : FIELD_CLASS;
}

// Label + required asterisk, tinted danger only once the field is both
// required AND still missing after a real attempt (see isFieldInvalid in
// the component below) — the asterisk itself (via RequiredMark) never
// changes: it communicates "required from the start", the danger tint
// communicates "still missing after you tried to continue". Two distinct
// signals, never conflated.
function FieldLabel({ children, invalid }: { children: string; invalid: boolean }) {
  return (
    <span className={invalid ? "text-danger" : "text-label-foreground"}>
      {children}
      <RequiredMark />
    </span>
  );
}

// Short intake form on purpose — full clinical intake/odontogram is a
// later module (see PROJECT_STATUS.md). Real write via createPatient()
// (public.patients, under patients_insert_admin_or_assistant RLS). Two
// separate Nombres/Apellidos fields rather than one "Nombre completo" —
// the real schema has first_name/last_name as separate required columns,
// and guessing a split from free text would risk silently wrong data on
// a real record (unlike the old local-only mock). No "Alergias" field —
// patients has no column for it yet; collecting it here would just
// silently drop what the user typed (see CLAUDE.md task scope: never
// fake a capability that doesn't persist).
//
// RIPS demographics (Sexo/Tipo de usuario/País/Municipio/Zona) are
// captured here too now, so a NEW patient is born without the RIPS
// pendientes /rips used to report after the fact — reuses the exact same
// catalogs/components the RIPS correction flow already established
// (identityCatalogs, ReferenceValueAutocomplete for Municipio,
// sortCountriesColombiaFirst for País), never a second, parallel
// mechanism. /rips's own CompletePatientRipsDataModal stays untouched —
// it remains the defense for legacy patients and any exceptional
// inconsistency, not the normal path for a brand-new one anymore. No
// silent default anywhere: every field starts empty, including País
// (Colombia only appears first in the list, never preselected).
export function NewPatientModal({
  clinicId,
  identityCatalogs,
  onClose,
  onCreate,
}: {
  clinicId: string;
  identityCatalogs: PatientIdentityCatalogs;
  onClose: () => void;
  onCreate: (patient: Patient) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sexCode, setSexCode] = useState("");
  const [userTypeCode, setUserTypeCode] = useState("");
  const [countryOfResidenceCode, setCountryOfResidenceCode] = useState("");
  const [municipalityOfResidenceCode, setMunicipalityOfResidenceCode] = useState("");
  const [municipalityLabel, setMunicipalityLabel] = useState("");
  const [residenceZoneCode, setResidenceZoneCode] = useState("");
  // Separate from País de residencia — never prefilled from it.
  const [countryOfOriginCode, setCountryOfOriginCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Never true until the odontóloga/asistente actually tries to submit
  // once — a fully empty form must never greet her with every field
  // highlighted before she's typed a single character. Once true, it
  // never needs to be reset back to false to hide feedback again: both
  // the per-field highlight (isFieldInvalid below) and the footer
  // message already gate on missingFields itself, which naturally goes
  // to [] as she completes the form.
  const [hasAttemptedCreate, setHasAttemptedCreate] = useState(false);

  const isColombia = countryOfResidenceCode === COLOMBIA_CODE;

  // Switching away from Colombia clears Municipio/Zona rather than just
  // hiding them — a hidden-but-still-set colombian code must never reach
  // createPatient() for a patient who no longer says she resides there.
  const handleCountryChange = (value: string) => {
    setCountryOfResidenceCode(value);
    if (value !== COLOMBIA_CODE) {
      setMunicipalityOfResidenceCode("");
      setMunicipalityLabel("");
      setResidenceZoneCode("");
    }
  };

  // Single source of truth for the button, the footer message, AND every
  // per-field highlight below — getMissingNewPatientFields() is the ONLY
  // place that decides which fields still block creation, so none of
  // them can ever disagree (this task's own explicit requirement). No
  // separate fieldErrors list, no second required-fields check anywhere
  // in this file.
  const missingFields = getMissingNewPatientFields({
    firstName,
    lastName,
    documentType,
    documentNumber,
    phone,
    birthDate,
    sexCode,
    userTypeCode,
    countryOfResidenceCode,
    municipalityOfResidenceCode,
    residenceZoneCode,
    countryOfOriginCode,
  });
  const canCreate = missingFields.length === 0 && !creating;

  // A field only ever highlights after a real attempt to create AND
  // while it's still in missingFields — correcting it removes it from
  // missingFields on the very next render, which flips this back to
  // false immediately, with no separate error state to clear manually.
  const isFieldInvalid = (field: NewPatientMissingField) => hasAttemptedCreate && missingFields.includes(field);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // The button is intentionally never HTML `disabled` for the
    // "missing fields" case — it stays a normal, fully interactive
    // primary button, so this handler always fires on click/Enter and a
    // genuine attempt reveals which fields are missing instead of the
    // click silently doing nothing. `!canCreate` here is the exact same
    // missingFields-derived check that drives every per-field highlight
    // and the footer message — never a second, divergent condition.
    if (!canCreate) {
      setHasAttemptedCreate(true);
      return;
    }
    setCreating(true);
    setError(null);

    const outcome = await createPatient({
      clinicId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      documentType,
      documentNumber: documentNumber.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      birthDate: birthDate || null,
      sexCode,
      userTypeCode,
      countryOfResidenceCode,
      municipalityOfResidenceCode: isColombia ? municipalityOfResidenceCode : null,
      residenceZoneCode: isColombia ? residenceZoneCode : null,
      countryOfOriginCode,
    });

    setCreating(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    onCreate(outcome.patient);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        // Disables ONLY the browser's own constraint-validation UI (the
        // native "Please select an item in the list."/"Please fill out
        // this field." popup) — that popup fires at submission time,
        // before React's onSubmit even runs, so handleSubmit's own
        // preventDefault() never gets a chance to. `required` stays on
        // every field below unchanged (still real semantics for
        // assistive tech, still documents intent), and
        // getMissingNewPatientFields() remains the ONLY thing that
        // decides completeness — this line only stops the browser from
        // running a second, competing validation UI on top of it.
        noValidate
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo paciente"
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Nuevo paciente</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <FieldLabel invalid={isFieldInvalid("firstName")}>Nombres</FieldLabel>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={fieldClassName(isFieldInvalid("firstName"))}
                  aria-invalid={isFieldInvalid("firstName") || undefined}
                  placeholder="Nombres"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <FieldLabel invalid={isFieldInvalid("lastName")}>Apellidos</FieldLabel>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={fieldClassName(isFieldInvalid("lastName"))}
                  aria-invalid={isFieldInvalid("lastName") || undefined}
                  placeholder="Apellidos"
                  required
                />
              </label>
            </div>
            <div className="grid grid-cols-[minmax(0,110px)_1fr] gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <FieldLabel invalid={isFieldInvalid("documentType")}>Tipo doc.</FieldLabel>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className={fieldClassName(isFieldInvalid("documentType"))}
                  aria-invalid={isFieldInvalid("documentType") || undefined}
                  required
                >
                  <option value="">Tipo</option>
                  {identityCatalogs.TipoDocumento.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <FieldLabel invalid={isFieldInvalid("documentNumber")}>Número de documento</FieldLabel>
                <input
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  className={fieldClassName(isFieldInvalid("documentNumber"))}
                  aria-invalid={isFieldInvalid("documentNumber") || undefined}
                  placeholder="1234567"
                  required
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <FieldLabel invalid={isFieldInvalid("birthDate")}>Fecha de nacimiento</FieldLabel>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className={fieldClassName(isFieldInvalid("birthDate"))}
                  aria-invalid={isFieldInvalid("birthDate") || undefined}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <FieldLabel invalid={isFieldInvalid("sexCode")}>Sexo</FieldLabel>
                <select
                  value={sexCode}
                  onChange={(e) => setSexCode(e.target.value)}
                  className={fieldClassName(isFieldInvalid("sexCode"))}
                  aria-invalid={isFieldInvalid("sexCode") || undefined}
                  required
                >
                  <option value="">Selecciona</option>
                  {identityCatalogs.SEXOconIndeterminado.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <FieldLabel invalid={isFieldInvalid("phone")}>Teléfono</FieldLabel>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={fieldClassName(isFieldInvalid("phone"))}
                  aria-invalid={isFieldInvalid("phone") || undefined}
                  placeholder="+57 300 000 0000"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <FieldLabel invalid={isFieldInvalid("userTypeCode")}>Tipo de usuario</FieldLabel>
                <select
                  value={userTypeCode}
                  onChange={(e) => setUserTypeCode(e.target.value)}
                  className={fieldClassName(isFieldInvalid("userTypeCode"))}
                  aria-invalid={isFieldInvalid("userTypeCode") || undefined}
                  required
                >
                  <option value="">Selecciona</option>
                  {identityCatalogs.RIPSTipoUsuarioVersion2.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Correo</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD_CLASS}
                placeholder="correo@ejemplo.com"
              />
            </label>

            {isColombia ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <FieldLabel invalid={isFieldInvalid("countryOfResidenceCode")}>País de residencia</FieldLabel>
                  <select
                    value={countryOfResidenceCode}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className={fieldClassName(isFieldInvalid("countryOfResidenceCode"))}
                    aria-invalid={isFieldInvalid("countryOfResidenceCode") || undefined}
                    required
                  >
                    <option value="">Selecciona</option>
                    {sortCountriesColombiaFirst(identityCatalogs.Pais).map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <FieldLabel invalid={isFieldInvalid("municipalityOfResidenceCode")}>Municipio de residencia</FieldLabel>
                  <ReferenceValueAutocomplete
                    catalogKey="Municipio"
                    value={municipalityOfResidenceCode}
                    displayLabel={municipalityLabel}
                    placeholder="Busca un municipio (p. ej. Tunja)"
                    invalid={isFieldInvalid("municipalityOfResidenceCode")}
                    onChange={(v) => {
                      setMunicipalityOfResidenceCode(v?.code ?? "");
                      setMunicipalityLabel(v?.label ?? "");
                    }}
                  />
                </label>
              </div>
            ) : (
              <label className="flex flex-col gap-1 text-sm">
                <FieldLabel invalid={isFieldInvalid("countryOfResidenceCode")}>País de residencia</FieldLabel>
                <select
                  value={countryOfResidenceCode}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className={fieldClassName(isFieldInvalid("countryOfResidenceCode"))}
                  aria-invalid={isFieldInvalid("countryOfResidenceCode") || undefined}
                  required
                >
                  <option value="">Selecciona</option>
                  {sortCountriesColombiaFirst(identityCatalogs.Pais).map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {isColombia && (
              <label className="flex flex-col gap-1 text-sm">
                <FieldLabel invalid={isFieldInvalid("residenceZoneCode")}>Zona territorial</FieldLabel>
                <select
                  value={residenceZoneCode}
                  onChange={(e) => setResidenceZoneCode(e.target.value)}
                  className={fieldClassName(isFieldInvalid("residenceZoneCode"))}
                  aria-invalid={isFieldInvalid("residenceZoneCode") || undefined}
                  required
                >
                  <option value="">Selecciona</option>
                  {identityCatalogs.ZonaVersion2.map((z) => (
                    <option key={z.code} value={z.code}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1 text-sm">
              <FieldLabel invalid={isFieldInvalid("countryOfOriginCode")}>País de origen</FieldLabel>
              <select
                value={countryOfOriginCode}
                onChange={(e) => setCountryOfOriginCode(e.target.value)}
                className={fieldClassName(isFieldInvalid("countryOfOriginCode"))}
                aria-invalid={isFieldInvalid("countryOfOriginCode") || undefined}
                required
              >
                <option value="">Selecciona</option>
                {sortCountriesColombiaFirst(identityCatalogs.Pais).map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <p className="text-[11px] text-muted-foreground">* Campos obligatorios</p>

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          {/* Mismo patrón que el footer de blockers de "Finalizar
              atención" — el mensaje vive junto a los botones que
              disparan la acción, nunca como alerta separada arriba.
              flex-1/min-w-0 deja que el texto crezca y se envuelva sin
              empujar los botones fuera de pantalla; ml-auto en el grupo
              de botones los mantiene alineados a la derecha incluso si
              el aviso envuelve a su propia línea. Nunca visible al abrir
              el modal (gated por hasAttemptedCreate) — solo aparece
              después de un intento de "Crear paciente" con campos
              faltantes, ya resaltados individualmente arriba, así que
              esto es solo un empujón compacto hacia dónde mirar, nunca
              la lista larga de antes. Desaparece solo en cuanto
              missingFields queda vacío, sin necesidad de resetear
              hasAttemptedCreate. */}
          {hasAttemptedCreate && missingFields.length > 0 && (
            <p className="min-w-0 flex-1 rounded-md border border-danger/20 bg-danger/10 px-2.5 py-1 text-[11px] font-medium text-danger">
              Completa los campos resaltados.
            </p>
          )}
          <div className="ml-auto flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5"
            >
              Cancelar
            </button>
            {/* Siempre un botón primario normal, nunca disabled/atenuado
                por incompletitud — solo `creating` (envío real en curso)
                lo deshabilita, para evitar doble submit. Con campos
                faltantes, el click SÍ llega a handleSubmit, que decide
                (vía el mismo `canCreate`) si resalta lo que falta o
                procede a crear — nunca una segunda condición. */}
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {creating ? "Creando…" : "Crear paciente"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
