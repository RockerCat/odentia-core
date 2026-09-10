"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CloseIcon, PhoneIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { updatePatient } from "./actions";
import { ClinicalAlerts } from "./clinical-alerts";
import type { Patient } from "./data";
import type { PatientIdentityCatalogs } from "./patients-screen";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { findReferenceValueByCodeAction } from "@/features/rips/actions";
import { ReferenceValueAutocomplete } from "@/features/rips/reference-value-autocomplete";
import type { ReferenceValue } from "@/features/rips/catalog-data";
import { createClient } from "@/lib/supabase/client";
import { fetchPatientMedicalHistory, type PatientMedicalHistory } from "./medical-history-data";
import { PatientPortalAccessCard } from "./patient-portal-access-card";

// COLOMBIA_CODE: Documento Técnico 1 U07/U08 son obligatorios únicamente
// cuando codPaisResidencia = "170" (ISO 3166-1 numérico de Colombia) — ver
// la migración de patients y src/features/rips/completeness.ts.
const COLOMBIA_CODE = "170";

function labelFor(values: ReferenceValue[], code: string | null): string {
  if (!code) return "No configurado";
  return values.find((v) => v.code === code)?.label ?? code;
}

function waLink(phone: string, message?: string): string {
  const base = `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

function initialsOf(patient: Patient): string {
  return `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase() || "?";
}

function ageOf(patient: Patient): number | null {
  if (!patient.birthDate) return null;
  const birth = new Date(patient.birthDate);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

const PATIENT_SINCE_FORMATTER = new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric" });

// Real patient quick-profile — restores the approved demo's full 3-column
// layout (clinical-record-screen.tsx's sibling, patient-detail-modal.tsx —
// deliberately a SEPARATE component, not shared: that file is Agenda's own
// "Ver paciente" flow, still fully mock and out of scope to touch; its
// Patient shape is no longer compatible with this real one). Left column:
// identity + contact (real, editable). Center: Alertas clínicas (real,
// same patient_medical_histories row Historia Clínica reads/writes),
// Resumen clínico + KPIs de citas (honest empty states — no appointments
// table yet), Acceso del paciente (real — see patient-portal-access-card.tsx:
// create_patient_access_invitation(), the same clinic_admin/assistant-only
// gate as Equipo's own invitations). Right: Próxima cita (honest empty
// state).
export function PatientRecordModal({
  patient,
  clinicId,
  canEditPatientData,
  identityCatalogs,
  onClose,
  onUpdated,
}: {
  patient: Patient;
  clinicId: string | null;
  canEditPatientData: boolean;
  identityCatalogs: PatientIdentityCatalogs;
  onClose: () => void;
  onUpdated: (patient: Patient) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [firstNameDraft, setFirstNameDraft] = useState(patient.firstName);
  const [lastNameDraft, setLastNameDraft] = useState(patient.lastName);
  const [phoneDraft, setPhoneDraft] = useState(patient.phone ?? "");
  const [emailDraft, setEmailDraft] = useState(patient.email ?? "");
  const [documentTypeDraft, setDocumentTypeDraft] = useState(patient.documentType ?? "");
  const [documentNumberDraft, setDocumentNumberDraft] = useState(patient.documentNumber ?? "");
  const [birthDateDraft, setBirthDateDraft] = useState(patient.birthDate ?? "");
  const [sexCodeDraft, setSexCodeDraft] = useState(patient.sexCode ?? "");
  const [userTypeCodeDraft, setUserTypeCodeDraft] = useState(patient.userTypeCode ?? "");
  const [countryCodeDraft, setCountryCodeDraft] = useState(patient.countryOfResidenceCode ?? "");
  const [municipalityCodeDraft, setMunicipalityCodeDraft] = useState(patient.municipalityOfResidenceCode ?? "");
  const [municipalityLabelDraft, setMunicipalityLabelDraft] = useState("");
  const [zoneCodeDraft, setZoneCodeDraft] = useState(patient.residenceZoneCode ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Purely cosmetic pending flag for "Ver historia clínica" — router.push
  // is a real client-side transition to a Server Component route
  // (resolveClinicContext + patient/history fetches), which used to give
  // zero feedback between the click and the new screen appearing.
  // Deliberately never reset back to false: this modal/screen is about to
  // be replaced by the destination once navigation lands, so there's
  // nothing left to reset it for (same convention as this file's own
  // saving/editing flags don't need — see PROMPT NINJA's own "no resetear
  // manualmente el pending antes de que termine la navegación").
  const [openingHistory, setOpeningHistory] = useState(false);

  // Same patient_medical_histories row Historia Clínica reads/writes (see
  // clinical-alerts.tsx) — resolved client-side on open since this modal,
  // unlike the Historia Clínica page, isn't its own server-rendered route.
  const [medicalHistory, setMedicalHistory] = useState<PatientMedicalHistory | null>(null);
  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const history = await fetchPatientMedicalHistory(supabase, clinicId, patient.id);
        if (!cancelled) setMedicalHistory(history);
      } catch {
        if (!cancelled) setMedicalHistory(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, patient.id]);

  // Municipio isn't in identityCatalogs (1,124 rows — see the Performance
  // section of this task) — resolve just this one saved code's label, if
  // any, so the view/edit UI never shows a raw "05001" to the user.
  useEffect(() => {
    const code = patient.municipalityOfResidenceCode;
    if (!code) return;
    let cancelled = false;
    (async () => {
      const resolved = await findReferenceValueByCodeAction("Municipio", code);
      if (!cancelled) setMunicipalityLabelDraft(resolved?.label ?? code);
    })();
    return () => {
      cancelled = true;
    };
  }, [patient.municipalityOfResidenceCode]);

  const age = ageOf(patient);

  const startEditing = () => {
    setFirstNameDraft(patient.firstName);
    setLastNameDraft(patient.lastName);
    setPhoneDraft(patient.phone ?? "");
    setEmailDraft(patient.email ?? "");
    setDocumentTypeDraft(patient.documentType ?? "");
    setDocumentNumberDraft(patient.documentNumber ?? "");
    setBirthDateDraft(patient.birthDate ?? "");
    setSexCodeDraft(patient.sexCode ?? "");
    setUserTypeCodeDraft(patient.userTypeCode ?? "");
    setCountryCodeDraft(patient.countryOfResidenceCode ?? "");
    setMunicipalityCodeDraft(patient.municipalityOfResidenceCode ?? "");
    setZoneCodeDraft(patient.residenceZoneCode ?? "");
    setSaveError(null);
    setEditing(true);
  };

  const saveEditing = async () => {
    setSaving(true);
    setSaveError(null);
    const patch = {
      firstName: firstNameDraft.trim() || patient.firstName,
      lastName: lastNameDraft.trim() || patient.lastName,
      phone: phoneDraft.trim() || null,
      email: emailDraft.trim() || null,
      documentType: documentTypeDraft || null,
      documentNumber: documentNumberDraft.trim() || null,
      birthDate: birthDateDraft || null,
      sexCode: sexCodeDraft || null,
      userTypeCode: userTypeCodeDraft || null,
      countryOfResidenceCode: countryCodeDraft || null,
      municipalityOfResidenceCode: municipalityCodeDraft || null,
      residenceZoneCode: zoneCodeDraft || null,
    };
    const outcome = await updatePatient(patient.id, patch);
    setSaving(false);
    if (outcome.status === "error") {
      setSaveError(outcome.message);
      return;
    }
    onUpdated({
      ...patient,
      ...patch,
      documentId:
        documentTypeDraft && documentNumberDraft.trim()
          ? `${documentTypeDraft} ${documentNumberDraft.trim()}`
          : patient.documentId,
    });
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={fullName(patient)}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-5xl sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Paciente</p>
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
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,260px)_1fr_minmax(0,260px)]">
            {/* Izquierda — tarjeta de paciente, mismo lenguaje visual que
                el diseño aprobado (patient-detail-modal.tsx). */}
            <div className="rounded-xl border border-border bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] p-4 shadow-sm">
              <div className="flex flex-col items-center gap-2 text-center">
                <UserAvatar name={fullName(patient)} initials={initialsOf(patient)} sizeClassName="size-20" />

                {editing ? (
                  <div className="flex w-full gap-2">
                    <input
                      value={firstNameDraft}
                      onChange={(e) => setFirstNameDraft(e.target.value)}
                      placeholder="Nombres"
                      className={`${FIELD_CLASS} text-center`}
                    />
                    <input
                      value={lastNameDraft}
                      onChange={(e) => setLastNameDraft(e.target.value)}
                      placeholder="Apellidos"
                      className={`${FIELD_CLASS} text-center`}
                    />
                  </div>
                ) : (
                  <p className="text-base font-semibold">{fullName(patient)}</p>
                )}

                {age !== null && <p className="text-sm text-muted-foreground">{age} años</p>}

                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    patient.active ? "border-primary/25 bg-primary/10 text-primary" : "border-danger/25 bg-danger/10 text-danger"
                  }`}
                >
                  {patient.active ? "Activo" : "Inactivo"}
                </span>

                {!editing && canEditPatientData && (
                  <button type="button" onClick={startEditing} className="text-xs font-medium text-primary hover:underline">
                    Editar datos
                  </button>
                )}
              </div>

              <div className="mt-5 border-t border-border" />

              <dl
                className={`mt-5 flex flex-col gap-4 text-sm ${
                  editing ? "rounded-lg border border-primary/15 bg-primary/[0.03] p-3" : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-label-foreground">Teléfono</dt>
                    {editing ? (
                      <input
                        value={phoneDraft}
                        onChange={(e) => setPhoneDraft(e.target.value)}
                        className={`${FIELD_CLASS} max-w-[60%]`}
                      />
                    ) : (
                      <dd className="truncate font-medium">{patient.phone || "Sin registrar"}</dd>
                    )}
                  </div>
                  {!editing && patient.phone && (
                    <a
                      href={waLink(patient.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <PhoneIcon className="size-3" />
                      WhatsApp
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <dt className="text-label-foreground">Correo</dt>
                  {editing ? (
                    <input
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      className={`${FIELD_CLASS} max-w-[60%]`}
                    />
                  ) : (
                    <dd className="truncate font-medium">{patient.email || "Sin registrar"}</dd>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <dt className="text-label-foreground">Paciente desde</dt>
                  <dd className="truncate font-medium">{PATIENT_SINCE_FORMATTER.format(new Date(patient.createdAt))}</dd>
                </div>

                {/* Identificación — RIPS #3 (Documento Técnico 1 U01/U02/U04/U05).
                    Nombres humanos siempre, nunca el código crudo (ver el
                    principio de producto de esta tarea). */}
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-label-foreground">Identificación</p>
                  {editing ? (
                    <div className="flex flex-col gap-2.5">
                      <div className="grid grid-cols-[minmax(0,90px)_1fr] gap-2">
                        <select
                          value={documentTypeDraft}
                          onChange={(e) => setDocumentTypeDraft(e.target.value)}
                          className={FIELD_CLASS}
                        >
                          <option value="">Tipo</option>
                          {identityCatalogs.TipoDocumento.map((d) => (
                            <option key={d.code} value={d.code}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={documentNumberDraft}
                          onChange={(e) => setDocumentNumberDraft(e.target.value)}
                          placeholder="Número de documento"
                          className={FIELD_CLASS}
                        />
                      </div>
                      <label className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-label-foreground">Fecha de nacimiento</span>
                        <input
                          type="date"
                          value={birthDateDraft}
                          onChange={(e) => setBirthDateDraft(e.target.value)}
                          className={`${FIELD_CLASS} max-w-[60%]`}
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-label-foreground">Sexo</span>
                        <select
                          value={sexCodeDraft}
                          onChange={(e) => setSexCodeDraft(e.target.value)}
                          className={`${FIELD_CLASS} max-w-[60%]`}
                        >
                          <option value="">Sin registrar</option>
                          {identityCatalogs.SEXOconIndeterminado.map((s) => (
                            <option key={s.code} value={s.code}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-label-foreground">Documento</dt>
                        <dd className="truncate font-medium">
                          {patient.documentType && patient.documentNumber
                            ? `${labelFor(identityCatalogs.TipoDocumento, patient.documentType)} ${patient.documentNumber}`
                            : "Sin registrar"}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-label-foreground">Nacimiento</dt>
                        <dd className="truncate font-medium">{patient.birthDate ?? "No configurado"}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-label-foreground">Sexo</dt>
                        <dd className="truncate font-medium">{labelFor(identityCatalogs.SEXOconIndeterminado, patient.sexCode)}</dd>
                      </div>
                    </div>
                  )}
                </div>

                {/* Residencia — U06/U07/U08. Municipio/Zona solo son
                    obligatorios cuando el país es Colombia (170) — ver
                    completeness.ts — pero se muestran siempre por si el
                    paciente reside en el exterior sin necesitarlos. */}
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-label-foreground">Residencia</p>
                  {editing ? (
                    <div className="flex flex-col gap-2.5">
                      <label className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-label-foreground">País</span>
                        <select
                          value={countryCodeDraft}
                          onChange={(e) => setCountryCodeDraft(e.target.value)}
                          className={`${FIELD_CLASS} max-w-[60%]`}
                        >
                          <option value="">Sin registrar</option>
                          {identityCatalogs.Pais.map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {countryCodeDraft === COLOMBIA_CODE && (
                        <>
                          <label className="flex flex-col gap-1 text-sm">
                            <span className="text-label-foreground">Municipio</span>
                            <ReferenceValueAutocomplete
                              catalogKey="Municipio"
                              value={municipalityCodeDraft}
                              displayLabel={municipalityLabelDraft}
                              placeholder="Busca un municipio (p. ej. Tunja)"
                              onChange={(v) => {
                                setMunicipalityCodeDraft(v?.code ?? "");
                                setMunicipalityLabelDraft(v?.label ?? "");
                              }}
                            />
                          </label>
                          <label className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-label-foreground">Zona</span>
                            <select
                              value={zoneCodeDraft}
                              onChange={(e) => setZoneCodeDraft(e.target.value)}
                              className={`${FIELD_CLASS} max-w-[60%]`}
                            >
                              <option value="">Sin registrar</option>
                              {identityCatalogs.ZonaVersion2.map((z) => (
                                <option key={z.code} value={z.code}>
                                  {z.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-label-foreground">País</dt>
                        <dd className="truncate font-medium">{labelFor(identityCatalogs.Pais, patient.countryOfResidenceCode)}</dd>
                      </div>
                      {patient.countryOfResidenceCode === COLOMBIA_CODE && (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-label-foreground">Municipio</dt>
                            <dd className="truncate font-medium">
                              {patient.municipalityOfResidenceCode ? municipalityLabelDraft || "…" : "No configurado"}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-label-foreground">Zona</dt>
                            <dd className="truncate font-medium">{labelFor(identityCatalogs.ZonaVersion2, patient.residenceZoneCode)}</dd>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Información para atención — U03. */}
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-label-foreground">Información para atención</p>
                  {editing ? (
                    <label className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-label-foreground">Tipo de usuario</span>
                      <select
                        value={userTypeCodeDraft}
                        onChange={(e) => setUserTypeCodeDraft(e.target.value)}
                        className={`${FIELD_CLASS} max-w-[60%]`}
                      >
                        <option value="">Sin registrar</option>
                        {identityCatalogs.RIPSTipoUsuarioVersion2.map((u) => (
                          <option key={u.code} value={u.code}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <dt className="text-label-foreground">Tipo de usuario</dt>
                      <dd className="truncate font-medium">
                        {labelFor(identityCatalogs.RIPSTipoUsuarioVersion2, patient.userTypeCode)}
                      </dd>
                    </div>
                  )}
                </div>
              </dl>

              {editing && (
                <>
                  {saveError && <p className="mt-2 text-xs text-danger">{saveError}</p>}
                  <div className="mt-4 flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      disabled={saving}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={saveEditing}
                      disabled={saving}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {saving ? "Guardando…" : "Guardar cambios"}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Centro — alertas + resumen clínico */}
            <div className="flex flex-col gap-4">
              <ClinicalAlerts history={medicalHistory} />

              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold">Resumen clínico</p>
                <dl className="mt-3 flex flex-col gap-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-label-foreground">Última atención</dt>
                    <dd className="text-right font-medium">Sin atenciones registradas</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-label-foreground">Odontólogo habitual</dt>
                    <dd className="font-medium">Sin asignar</dd>
                  </div>
                </dl>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xl font-bold tracking-tight">0</p>
                  <p className="mt-0.5 text-[11px] text-label-foreground">Citas completadas</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xl font-bold tracking-tight">0</p>
                  <p className="mt-0.5 text-[11px] text-label-foreground">Canceladas / no asistió</p>
                </div>
              </div>

              {/* Acceso del paciente — real (see patient-portal-access-card.tsx).
                  canGrantAccess reuses canEditPatientData: it's already
                  exactly "role !== dentist", the same two roles
                  (clinic_admin/assistant) create_patient_access_invitation()
                  itself authorizes — no new prop, no new role decision. */}
              <PatientPortalAccessCard patientId={patient.id} canGrantAccess={canEditPatientData} />
            </div>

            {/* Derecha — próxima cita. */}
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs font-semibold text-primary uppercase">Próxima cita</p>
                <p className="mt-1 text-sm font-medium text-foreground">Sin cita programada</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            disabled={openingHistory}
            onClick={() => {
              if (openingHistory) return;
              setOpeningHistory(true);
              router.push(`/pacientes/${patient.id}/historia-clinica`);
            }}
            className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-60"
          >
            {openingHistory ? "Abriendo historia clínica…" : "Ver historia clínica"}
          </button>
          {/* No hay backend real de citas todavía — visible por paridad de
              diseño, deshabilitado en vez de abrir un flujo mock. */}
          <button
            type="button"
            disabled
            title="Disponible próximamente."
            className="rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground opacity-50 disabled:cursor-not-allowed"
          >
            Nueva cita
          </button>
        </div>
      </div>
    </div>
  );
}
