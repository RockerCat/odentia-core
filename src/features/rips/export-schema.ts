// RIPS #5A — runtime structural validation of the built RIPS sin factura
// transaction, run AFTER mapping and BEFORE serialization/download (see
// export-actions.ts's own load → readiness → map → validate → serialize
// → download pipeline). TypeScript types alone (export-types.ts) don't
// exist at runtime — this module is the actual runtime guarantee that a
// malformed DTO (a generator bug, a stale/unexpected DB value) is caught
// before ever reaching a downloadable file, never just trusted because
// `tsc` was happy at build time.
//
// No new dependency: Zod isn't installed anywhere in this project (see
// this task's own instruction — "usa Zod si ya está disponible... de lo
// contrario usa la solución mínima coherente con el stack existente") and
// CLAUDE.md's own "avoid unnecessary dependencies" applies — this is a
// small, self-contained validator, not a schema DSL.
//
// Scope (Section 19's own split, unchanged from RIPS #5): STRUCTURAL only
// — required/optional, type, nullability, array shape, and the basic
// length/format bounds Documento Técnico 1 v003 itself states in its
// "Tamaño" column. This is explicitly NOT a reimplementation of the
// MUV's 100+ regulatory/cross-field rules (catalog cross-validation,
// date-vs-birthdate consistency, etc.) — those stay out of scope, same as
// export-readiness.ts's own documented boundary.
//
// Every error message below references only a PATH and a RULE
// description — never the actual field VALUE, since this transaction
// carries protected health information (patient document numbers,
// diagnoses) that must never end up in a log line (see this task's own
// "no loggear el JSON completo" and Section 35's PII requirements).

import type { RipsConsultation, RipsProcedure, RipsSinFacturaTransaction, RipsUser } from "./export-types";

export type SchemaValidationError = { path: string; message: string };
export type SchemaValidationResult = { valid: boolean; errors: SchemaValidationError[] };

type LengthOpts = { minLength?: number; maxLength?: number; exactLength?: number };

class Validator {
  errors: SchemaValidationError[] = [];

  private fail(path: string, message: string) {
    this.errors.push({ path, message });
  }

  private checkLength(path: string, value: string, opts: LengthOpts) {
    if (opts.exactLength !== undefined && value.length !== opts.exactLength) {
      this.fail(path, `debe tener exactamente ${opts.exactLength} caracteres`);
    }
    if (opts.minLength !== undefined && value.length < opts.minLength) {
      this.fail(path, `debe tener al menos ${opts.minLength} caracteres`);
    }
    if (opts.maxLength !== undefined && value.length > opts.maxLength) {
      this.fail(path, `debe tener como máximo ${opts.maxLength} caracteres`);
    }
  }

  requiredString(path: string, value: unknown, opts: LengthOpts = {}) {
    if (typeof value !== "string" || value.length === 0) {
      this.fail(path, "es obligatorio y debe ser un texto no vacío");
      return;
    }
    this.checkLength(path, value, opts);
  }

  nullableString(path: string, value: unknown, opts: LengthOpts = {}) {
    if (value === null) return;
    if (typeof value !== "string") {
      this.fail(path, "debe ser texto o null");
      return;
    }
    this.checkLength(path, value, opts);
  }

  // Every field this task's flow always sets to null (numFactura,
  // tipoNota, registroSIRAS, every *CIE11 field, etc.) — asserting this
  // structurally catches a generator regression that starts leaking a
  // value into a field this RIPS-sin-factura flow must never populate.
  mustBeNull(path: string, value: unknown) {
    if (value !== null) this.fail(path, "debe ser null en el flujo RIPS sin factura");
  }

  nonNegativeNumber(path: string, value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      this.fail(path, "debe ser un número mayor o igual a 0");
    }
  }

  // Structural invariant of THIS generator (Documento Técnico 1 P16: "Si
  // el RIPS es sin FEV, informar cero (0)") — not a MUV rule, our own
  // contract, so catching a violation here (a generator regression) is
  // exactly this module's job.
  mustEqualZero(path: string, value: unknown) {
    if (value !== 0) this.fail(path, "debe ser exactamente 0 (RIPS sin factura, procedimiento)");
  }

  positiveInteger(path: string, value: unknown, opts: { maxDigits?: number } = {}) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      this.fail(path, "debe ser un entero mayor o igual a 1");
      return;
    }
    if (opts.maxDigits !== undefined && String(value).length > opts.maxDigits) {
      this.fail(path, `no puede exceder ${opts.maxDigits} dígitos`);
    }
  }

  dateOnly(path: string, value: unknown) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      this.fail(path, "debe tener formato YYYY-MM-DD");
    }
  }

  dateTimeMinute(path: string, value: unknown) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
      this.fail(path, "debe tener formato YYYY-MM-DD HH:MM");
    }
  }

  array(path: string, value: unknown, opts: { minLength?: number } = {}): value is unknown[] {
    if (!Array.isArray(value)) {
      this.fail(path, "debe ser un arreglo");
      return false;
    }
    if (opts.minLength !== undefined && value.length < opts.minLength) {
      this.fail(path, `debe tener al menos ${opts.minLength} elemento(s)`);
      return false;
    }
    return true;
  }

  isPlainObject(path: string, value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      this.fail(path, "debe ser un objeto");
      return false;
    }
    return true;
  }
}

// Diagnosis codes are validated for EXISTENCE against the official CIE10
// catalog at write time (RIPS #4's upsert_patient_clinical_encounter) —
// this length check is a loose structural bound (3-4, matching both
// category-only codes like "A00" and subcategory codes like "K021"),
// deliberately not the DT1 table's plain "4" reading, to avoid this
// generic validator rejecting an already-catalog-validated real code.
function validateDiagnosisCode(v: Validator, path: string, value: unknown, required: boolean) {
  if (required) v.requiredString(path, value, { minLength: 3, maxLength: 4 });
  else v.nullableString(path, value, { minLength: 3, maxLength: 4 });
}

function validateConsultation(v: Validator, path: string, raw: unknown) {
  if (!v.isPlainObject(path, raw)) return;
  const c = raw as Partial<RipsConsultation>;

  v.requiredString(`${path}.codPrestador`, c.codPrestador, { exactLength: 12 });
  v.dateTimeMinute(`${path}.fechaInicioAtencion`, c.fechaInicioAtencion);
  v.mustBeNull(`${path}.numAutorizacion`, c.numAutorizacion);
  v.requiredString(`${path}.codConsulta`, c.codConsulta, { exactLength: 6 });
  v.nullableString(`${path}.modalidadGrupoServicioTecSal`, c.modalidadGrupoServicioTecSal, { exactLength: 2 });
  v.nullableString(`${path}.grupoServicios`, c.grupoServicios, { exactLength: 2 });
  v.nullableString(`${path}.codServicio`, c.codServicio, { minLength: 1, maxLength: 4 });
  v.nullableString(`${path}.finalidadTecnologiaSalud`, c.finalidadTecnologiaSalud, { exactLength: 2 });
  v.nullableString(`${path}.causaMotivoAtencion`, c.causaMotivoAtencion, { exactLength: 2 });
  validateDiagnosisCode(v, `${path}.codDiagnosticoPrincipal`, c.codDiagnosticoPrincipal, true);
  v.mustBeNull(`${path}.codDiagnosticoPrincipalCIE11`, c.codDiagnosticoPrincipalCIE11);
  v.mustBeNull(`${path}.nomCodDiagnosticoPrincipalCIE11`, c.nomCodDiagnosticoPrincipalCIE11);
  validateDiagnosisCode(v, `${path}.codDiagnosticoRelacionado1`, c.codDiagnosticoRelacionado1, false);
  v.mustBeNull(`${path}.codDiagnosticoRelacionado1CIE11`, c.codDiagnosticoRelacionado1CIE11);
  v.mustBeNull(`${path}.nomCodDiagnosticoRelacionado1CIE11`, c.nomCodDiagnosticoRelacionado1CIE11);
  validateDiagnosisCode(v, `${path}.codDiagnosticoRelacionado2`, c.codDiagnosticoRelacionado2, false);
  v.mustBeNull(`${path}.codDiagnosticoRelacionado2CIE11`, c.codDiagnosticoRelacionado2CIE11);
  v.mustBeNull(`${path}.nomCodDiagnosticoRelacionado2CIE11`, c.nomCodDiagnosticoRelacionado2CIE11);
  validateDiagnosisCode(v, `${path}.codDiagnosticoRelacionado3`, c.codDiagnosticoRelacionado3, false);
  v.mustBeNull(`${path}.codDiagnosticoRelacionado3CIE11`, c.codDiagnosticoRelacionado3CIE11);
  v.mustBeNull(`${path}.nomCodDiagnosticoRelacionado3CIE11`, c.nomCodDiagnosticoRelacionado3CIE11);
  // C14 — obligatorio para TODA consulta (Documento Técnico 1 v003: su
  // columna Tamaño es "2" sin el prefijo "0," que marca cada campo
  // condicional a lo largo de todo el documento — ver RIPS #5A's own
  // report). Nunca "" como sustituto de un valor faltante.
  v.requiredString(`${path}.tipoDiagnosticoPrincipal`, c.tipoDiagnosticoPrincipal, { exactLength: 2 });
  v.requiredString(`${path}.tipoDocumentoIdentificacion`, c.tipoDocumentoIdentificacion, { exactLength: 2 });
  v.requiredString(`${path}.numDocumentoIdentificacion`, c.numDocumentoIdentificacion, { minLength: 4, maxLength: 20 });
  v.nonNegativeNumber(`${path}.vrServicio`, c.vrServicio);
  v.nullableString(`${path}.conceptoRecaudo`, c.conceptoRecaudo, { exactLength: 2 });
  v.nonNegativeNumber(`${path}.valorPagoModerador`, c.valorPagoModerador);
  v.mustBeNull(`${path}.numFEVPagoModerador`, c.numFEVPagoModerador);
  v.positiveInteger(`${path}.consecutivo`, c.consecutivo, { maxDigits: 7 });
  v.mustBeNull(`${path}.codigoVIDA`, c.codigoVIDA);
}

function validateProcedure(v: Validator, path: string, raw: unknown) {
  if (!v.isPlainObject(path, raw)) return;
  const p = raw as Partial<RipsProcedure>;

  v.requiredString(`${path}.codPrestador`, p.codPrestador, { exactLength: 12 });
  v.dateTimeMinute(`${path}.fechaInicioAtencion`, p.fechaInicioAtencion);
  v.mustBeNull(`${path}.idMIPRES`, p.idMIPRES);
  v.mustBeNull(`${path}.numAutorizacion`, p.numAutorizacion);
  v.requiredString(`${path}.codProcedimiento`, p.codProcedimiento, { exactLength: 6 });
  v.nullableString(`${path}.viaIngresoServicioSalud`, p.viaIngresoServicioSalud, { exactLength: 2 });
  v.nullableString(`${path}.modalidadGrupoServicioTecSal`, p.modalidadGrupoServicioTecSal, { exactLength: 2 });
  v.nullableString(`${path}.grupoServicios`, p.grupoServicios, { exactLength: 2 });
  v.nullableString(`${path}.codServicio`, p.codServicio, { minLength: 1, maxLength: 4 });
  v.nullableString(`${path}.finalidadTecnologiaSalud`, p.finalidadTecnologiaSalud, { exactLength: 2 });
  v.requiredString(`${path}.tipoDocumentoIdentificacion`, p.tipoDocumentoIdentificacion, { exactLength: 2 });
  v.requiredString(`${path}.numDocumentoIdentificacion`, p.numDocumentoIdentificacion, { minLength: 4, maxLength: 20 });
  validateDiagnosisCode(v, `${path}.codDiagnosticoPrincipal`, p.codDiagnosticoPrincipal, true);
  v.mustBeNull(`${path}.codDiagnosticoPrincipalCIE11`, p.codDiagnosticoPrincipalCIE11);
  v.mustBeNull(`${path}.nomCodDiagnosticoPrincipalCIE11`, p.nomCodDiagnosticoPrincipalCIE11);
  validateDiagnosisCode(v, `${path}.codDiagnosticoRelacionado`, p.codDiagnosticoRelacionado, false);
  v.mustBeNull(`${path}.codDiagnosticoRelacionadoCIE11`, p.codDiagnosticoRelacionadoCIE11);
  v.mustBeNull(`${path}.nomCodDiagnosticoRelacionadoCIE11`, p.nomCodDiagnosticoRelacionadoCIE11);
  v.mustBeNull(`${path}.codComplicacion`, p.codComplicacion);
  v.mustEqualZero(`${path}.vrServicio`, p.vrServicio);
  v.nullableString(`${path}.conceptoRecaudo`, p.conceptoRecaudo, { exactLength: 2 });
  v.nonNegativeNumber(`${path}.valorPagoModerador`, p.valorPagoModerador);
  v.mustBeNull(`${path}.numFEVPagoModerador`, p.numFEVPagoModerador);
  v.positiveInteger(`${path}.consecutivo`, p.consecutivo, { maxDigits: 7 });
  v.mustBeNull(`${path}.codigoVIDA`, p.codigoVIDA);
}

function validateUser(v: Validator, path: string, raw: unknown) {
  if (!v.isPlainObject(path, raw)) return;
  const u = raw as Partial<RipsUser>;

  v.requiredString(`${path}.tipoDocumentoIdentificacion`, u.tipoDocumentoIdentificacion, { exactLength: 2 });
  v.requiredString(`${path}.numDocumentoIdentificacion`, u.numDocumentoIdentificacion, { minLength: 4, maxLength: 20 });
  v.requiredString(`${path}.tipoUsuario`, u.tipoUsuario, { exactLength: 2 });
  v.dateOnly(`${path}.fechaNacimiento`, u.fechaNacimiento);
  v.requiredString(`${path}.codSexo`, u.codSexo, { exactLength: 1 });
  v.requiredString(`${path}.codPaisResidencia`, u.codPaisResidencia, { exactLength: 3 });
  v.nullableString(`${path}.codMunicipioResidencia`, u.codMunicipioResidencia, { exactLength: 5 });
  v.nullableString(`${path}.codZonaTerritorialResidencia`, u.codZonaTerritorialResidencia, { exactLength: 2 });
  v.requiredString(`${path}.incapacidad`, u.incapacidad, { exactLength: 2 });
  v.positiveInteger(`${path}.consecutivo`, u.consecutivo, { maxDigits: 7 });
  v.nullableString(`${path}.codPaisOrigen`, u.codPaisOrigen, { exactLength: 3 });
  v.mustBeNull(`${path}.registroSIRAS`, u.registroSIRAS);

  const serviciosPath = `${path}.servicios`;
  if (!v.isPlainObject(serviciosPath, u.servicios)) return;
  const servicios = u.servicios as Record<string, unknown>;

  const hasConsultas = "consultas" in servicios;
  const hasProcedimientos = "procedimientos" in servicios;
  if (!hasConsultas && !hasProcedimientos) {
    v.errors.push({ path: serviciosPath, message: "debe incluir al menos consultas o procedimientos (nunca ambos ausentes)" });
  }
  if (hasConsultas) {
    if (v.array(`${serviciosPath}.consultas`, servicios.consultas, { minLength: 1 })) {
      (servicios.consultas as unknown[]).forEach((item, i) => validateConsultation(v, `${serviciosPath}.consultas[${i}]`, item));
    }
  }
  if (hasProcedimientos) {
    if (v.array(`${serviciosPath}.procedimientos`, servicios.procedimientos, { minLength: 1 })) {
      (servicios.procedimientos as unknown[]).forEach((item, i) => validateProcedure(v, `${serviciosPath}.procedimientos[${i}]`, item));
    }
  }
}

export function validateRipsSinFacturaTransaction(raw: unknown): SchemaValidationResult {
  const v = new Validator();
  if (!v.isPlainObject("$", raw)) return { valid: false, errors: v.errors };
  const t = raw as Partial<RipsSinFacturaTransaction>;

  v.requiredString("$.numDocumentoIdObligado", t.numDocumentoIdObligado, { minLength: 4, maxLength: 12 });
  v.mustBeNull("$.numFactura", t.numFactura);
  v.mustBeNull("$.tipoNota", t.tipoNota);
  v.mustBeNull("$.numNota", t.numNota);

  if (v.array("$.usuarios", t.usuarios, { minLength: 1 })) {
    (t.usuarios as unknown[]).forEach((item, i) => validateUser(v, `$.usuarios[${i}]`, item));
  }

  return { valid: v.errors.length === 0, errors: v.errors };
}
