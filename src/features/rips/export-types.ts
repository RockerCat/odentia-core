// RIPS #5 — types for the RIPS sin factura JSON transaction (Documento
// Técnico 1, Resolución 948 de 2026, Versión 003 — 15-jul-2026, secciones
// 4.1/4.2/4.3.1/4.3.2). Field NAMES here are the exact, literal JSON
// property names the official schema expects (Spanish, camelCase, no
// translation) — see docs/rips-json-mapping.md for the field-by-field
// citation. Every field the schema documents is always PRESENT (never
// omitted) — absence of applicable data is represented as an explicit
// `null`, matching the Documento Técnico 1's own worked examples (e.g.
// `"codDiagnosticoRelacionado2": null`), never a missing key. See this
// task's own Section 18 ("null vs omitted").

// -------------------------------------------------------------------
// 4.1 — Datos relativos a la transacción (root object, un-named per the
// document's own note: "no debe ser nombrado al inicio de la estructura").
// -------------------------------------------------------------------
export type RipsSinFacturaTransaction = {
  numDocumentoIdObligado: string;
  // RIPS SIN FACTURA (this task's whole scope) — T02: "Si el RIPS es con
  // Factura Electrónica de Venta... se debe informar el número de
  // factura, en caso contrario informar null." Always null here.
  numFactura: null;
  // T03/T04 — only meaningful for a nota crédito/débito/ajuste, which this
  // phase never generates (see Section 42, out of scope). Always null.
  tipoNota: null;
  numNota: null;
  usuarios: RipsUser[];
};

// -------------------------------------------------------------------
// 4.2 — Datos relativos a los usuarios.
// -------------------------------------------------------------------
// IMPORTANT — grouping key: a `usuarios[]` entry is NOT simply "one per
// distinct patient". The Documento Técnico 1's own worked example shows
// the SAME numDocumentoIdentificacion appearing in TWO separate usuario
// entries (consecutivo 1 and 2) because a user-level field (tipoUsuario in
// that example) differed between their two atenciones. In Odentia's own
// model, `incapacidad` (U09) is the one usuario-level field that is
// genuinely per-atención, not a stable patient attribute (see RIPS #4's
// own migration comment) — so the correct, normatively-grounded grouping
// key is (patientId, incapacityCode): every encounter for the same
// patient sharing the same incapacityCode value merges into ONE usuario
// entry (their servicios simply accumulate); a patient whose atenciones in
// the period carry DIFFERENT incapacityCode values gets one usuario entry
// PER distinct value. See docs/rips-json-mapping.md Section "Usuarios" for
// the full citation and worked example.
export type RipsUser = {
  tipoDocumentoIdentificacion: string;
  numDocumentoIdentificacion: string;
  tipoUsuario: string;
  fechaNacimiento: string; // YYYY-MM-DD
  codSexo: string;
  codPaisResidencia: string;
  codMunicipioResidencia: string | null; // condicional — solo obligatorio si codPaisResidencia = "170"
  codZonaTerritorialResidencia: string | null; // condicional — ídem
  incapacidad: string;
  consecutivo: number; // 1..N, único dentro de usuarios[]
  codPaisOrigen: string | null;
  // U12 registroSIRAS — solo aplica a tipoUsuario 10/14 (SOAT/accidente de
  // tránsito sin póliza), fuera del alcance clínico de Odentia. Siempre
  // null.
  registroSIRAS: null;
  servicios: RipsServiciosTecnologias;
};

// -------------------------------------------------------------------
// 4.3 — Datos relativos al servicio y tecnologías de salud. "Dentro de
// cada usuario se crea el objeto 'serviciosTecnologias'... Sólo se
// informan los objetos sobre los cuales se prestó y facturó el servicio"
// — Odentia's scope is exclusively odontología ambulatoria: only
// `consultas`/`procedimientos` are ever populated; the other five arrays
// the schema allows (urgencias/hospitalizacion/recienNacidos/
// medicamentos/otrosServicios) never apply and are omitted entirely
// (never an empty array — "sólo se informan los objetos sobre los cuales
// se prestó" reads as "omit the ones that don't apply", distinct from
// this task's own "null vs omitted" rule for SCALAR fields within an
// object that IS included).
// -------------------------------------------------------------------
export type RipsServiciosTecnologias = {
  consultas?: RipsConsultation[];
  procedimientos?: RipsProcedure[];
};

// -------------------------------------------------------------------
// 4.3.1 — Datos de las consultas. CIE11 fields (C23/C24/C25/C26/C27/C28/
// C29) and C22 codigoVIDA are always null — Odentia is CIE10-only and the
// IHCE project (codigoVIDA's own source) isn't operational yet (see the
// field's own DT1 v003 text: "será obligatorio una vez entre en
// operación").
// -------------------------------------------------------------------
export type RipsConsultation = {
  codPrestador: string;
  fechaInicioAtencion: string; // "YYYY-MM-DD HH:MM", sede local time
  // C03 — Odentia doesn't track third-party payer authorizations in this
  // MVP scope (private, out-of-pocket dental practice). Always null.
  numAutorizacion: null;
  codConsulta: string;
  modalidadGrupoServicioTecSal: string | null;
  grupoServicios: string | null;
  codServicio: string | null;
  finalidadTecnologiaSalud: string | null;
  causaMotivoAtencion: string | null;
  codDiagnosticoPrincipal: string;
  codDiagnosticoPrincipalCIE11: null;
  nomCodDiagnosticoPrincipalCIE11: null;
  // C11/C12/C13 — up to 3 FIXED SLOTS (never an array) per DT1 v003.
  codDiagnosticoRelacionado1: string | null;
  codDiagnosticoRelacionado1CIE11: null;
  nomCodDiagnosticoRelacionado1CIE11: null;
  codDiagnosticoRelacionado2: string | null;
  codDiagnosticoRelacionado2CIE11: null;
  nomCodDiagnosticoRelacionado2CIE11: null;
  codDiagnosticoRelacionado3: string | null;
  codDiagnosticoRelacionado3CIE11: null;
  nomCodDiagnosticoRelacionado3CIE11: null;
  tipoDiagnosticoPrincipal: string;
  tipoDocumentoIdentificacion: string; // del profesional que realizó la consulta
  numDocumentoIdentificacion: string; // ídem
  vrServicio: number;
  conceptoRecaudo: string | null;
  valorPagoModerador: number; // nunca null — DT1 v003: "cuando no aplique... informar cero (0)"
  numFEVPagoModerador: null;
  consecutivo: number; // 1..N, único dentro de servicios.consultas[] de ESTE usuario
  codigoVIDA: null;
};

// -------------------------------------------------------------------
// 4.3.2 — Datos de los procedimientos. Only ONE related-diagnosis slot
// (P14, singular) — not 3 like consultas. P15 codComplicacion, P03
// idMIPRES, and the CIE11/codigoVIDA fields are always null (not tracked
// by Odentia's current clinical model / out of this task's scope).
// -------------------------------------------------------------------
export type RipsProcedure = {
  codPrestador: string;
  fechaInicioAtencion: string;
  idMIPRES: null;
  numAutorizacion: null;
  codProcedimiento: string;
  viaIngresoServicioSalud: string | null;
  modalidadGrupoServicioTecSal: string | null;
  grupoServicios: string | null;
  codServicio: string | null;
  finalidadTecnologiaSalud: string | null;
  tipoDocumentoIdentificacion: string;
  numDocumentoIdentificacion: string;
  codDiagnosticoPrincipal: string;
  codDiagnosticoPrincipalCIE11: null;
  nomCodDiagnosticoPrincipalCIE11: null;
  codDiagnosticoRelacionado: string | null;
  codDiagnosticoRelacionadoCIE11: null;
  nomCodDiagnosticoRelacionadoCIE11: null;
  codComplicacion: null;
  vrServicio: number; // siempre 0 para RIPS sin factura, per DT1 v003 P16
  conceptoRecaudo: string | null;
  valorPagoModerador: number;
  numFEVPagoModerador: null;
  consecutivo: number;
  codigoVIDA: null;
};
