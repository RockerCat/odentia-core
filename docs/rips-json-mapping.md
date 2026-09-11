# RIPS sin factura — mapeo JSON ↔ Odentia

Fuente normativa: **Documento Técnico 1, "Especificaciones técnicas de los
campos de datos y las reglas de validación del RIPS como soporte de la FEV
en salud", Versión 003, 15 de julio de 2026** (Resolución 948 de 2026).
Toda cita de página/sección en este documento se refiere a esa versión —
nunca a la 001 (junio 2026) usada en fases anteriores.

Alcance: **RIPS sin Factura Electrónica de Venta** únicamente. No cubre
FEV/XML DIAN, MUV, CUV, ni notas crédito/débito/ajuste.

No existe en este repositorio (ni fue proporcionado en esta sesión) un
JSON real de un piloto para contrastar forma — todo el mapeo de abajo se
derivó leyendo directamente el texto de Documento Técnico 1 v003. Si en el
futuro aparece un fixture piloto real, debe usarse únicamente para
contrastar nombres/forma, nunca como fuente normativa por encima del texto
oficial (ver este mismo prompt, Sección 30).

## Estructura raíz

El objeto raíz (`transacción`) no se nombra — es el root del JSON.

| Campo | Fuente Odentia | Regla | Oblig./Cond. | Fuente normativa |
|---|---|---|---|---|
| `numDocumentoIdObligado` | `clinics.tax_id` | NIT del facturador electrónico en salud | Obligatorio | T01, p.18 |
| `numFactura` | — | Siempre `null` (RIPS sin factura) | Obligatorio (valor null) | T02, p.19 |
| `tipoNota` | — | Siempre `null` (nunca se genera nota crédito/débito/ajuste en esta fase) | Obligatorio (valor null) | T03, p.19 |
| `numNota` | — | Siempre `null` (depende de `tipoNota`) | Obligatorio (valor null) | T04, p.20 |
| `usuarios` | ver abajo | Arreglo, uno o más | Obligatorio | 4.2, p.20 |

## Usuarios — agrupación (decisión clave de esta fase)

**`usuarios[]` NO es "un objeto por paciente distinto".** El propio
Documento Técnico 1 v003 muestra en su ejemplo (p.25-26) el mismo
`numDocumentoIdentificacion` ("52100200") repetido en DOS objetos usuario
separados, con `consecutivo: 1` y `consecutivo: 2`, porque su
`tipoUsuario` difería entre ambos registros (01 vs 10). Esto confirma que
un usuario-entry agrupa "esta persona bajo estos valores concretos de
campos a nivel usuario", no "esta persona en general".

En el modelo de Odentia, `incapacidad` (U09) es el único campo a nivel
usuario que es realmente **por atención**, no un atributo estable del
paciente (ver la migración de RIPS #4). La regla de agrupación
implementada es: **`usuarios[]` agrupa por `(patientId, incapacityCode)`**
— cada atención de un mismo paciente con el mismo valor de
`incapacityCode` se fusiona en un solo objeto usuario (sus servicios se
acumulan); si el mismo paciente tuvo atenciones con `incapacityCode`
distinto dentro del período, genera un objeto usuario por cada valor
distinto, cada uno con su propio `servicios` anidado — exactamente el
patrón que el ejemplo oficial demuestra para `tipoUsuario`.

`consecutivo` a nivel usuario: 1..N, único dentro de `usuarios[]`,
asignado en orden determinístico (patientId, luego incapacityCode —
nunca orden de SELECT ni de inserción).

| Campo | Fuente Odentia | Regla | Oblig./Cond. | Fuente normativa |
|---|---|---|---|---|
| `tipoDocumentoIdentificacion` | `patients.document_type` | — | Obligatorio | U01, p.20 |
| `numDocumentoIdentificacion` | `patients.document_number` | — | Obligatorio | U02, p.21 |
| `tipoUsuario` | `patients.user_type_code` | — | Obligatorio | U03, p.21 |
| `fechaNacimiento` | `patients.birth_date` | Formato `YYYY-MM-DD` (ya es el formato nativo de la columna DATE) | Obligatorio | U04, p.21 |
| `codSexo` | `patients.sex_code` | — | Obligatorio | U05, p.23 |
| `codPaisResidencia` | `patients.country_of_residence_code` | — | Obligatorio | U06, p.23 |
| `codMunicipioResidencia` | `patients.municipality_of_residence_code` | `null` si el país de residencia no es Colombia (170) | Condicional (170) | U07, p.24 |
| `codZonaTerritorialResidencia` | `patients.residence_zone_code` | ídem | Condicional (170) | U08, p.24 |
| `incapacidad` | `patient_clinical_encounters.incapacity_code` | Es la CLAVE de agrupación — ver arriba | Obligatorio | U09, p.24 |
| `consecutivo` | calculado | 1..N determinístico | Obligatorio | U10, p.24 |
| `codPaisOrigen` | `patients.country_of_origin_code` | — | No exigido como bloqueante en esta fase (ver `completeness.ts` de RIPS #3) | U11, p.25 |
| `registroSIRAS` | — | Siempre `null` — solo aplica a tipoUsuario 10/14 (SOAT/accidente de tránsito), fuera del alcance clínico de Odentia | Condicional | U12, p.25 |
| `servicios` | ver abajo | Anidado DENTRO de cada usuario (nombre real: `"servicios"`, pese a que la tabla descriptiva de la sección 2.2 lo llama `serviciosTecnologias` — el propio documento aclara en p.13 que el nombre a usar en el JSON es `"servicios"`) | Obligatorio | 4.3, p.10-13 |

Solo se incluyen `consultas`/`procedimientos` dentro de `servicios` — los
otros cinco arreglos que el esquema permite (`urgencias`,
`hospitalizacion`, `recienNacidos`, `medicamentos`, `otrosServicios`)
nunca aplican a odontología ambulatoria y se omiten por completo (nunca
un arreglo vacío).

## Consultas (4.3.1)

`rips_service_type = 'consultation'` en `encounter_services` (snapshot al
guardar, ver migración RIPS #4) es el ÚNICO criterio de enrutamiento — jamás
heurística de texto ni prefijo de código.

| Campo | Fuente Odentia | Regla | Oblig./Cond. | Fuente normativa |
|---|---|---|---|---|
| `codPrestador` | `clinic_locations.cod_prestador` | Ver "Resolución de sede" abajo | Obligatorio | C01, p.27 |
| `fechaInicioAtencion` | `encounter_services.performed_at` | Formato `YYYY-MM-DD HH:MM`, hora local de la sede (`clinic_locations.timezone`, nunca UTC ni hora del servidor) | Obligatorio | C02, p.27 |
| `numAutorizacion` | — | Siempre `null` — Odentia no gestiona autorizaciones de terceros pagadores en este alcance | Condicional | C03, p.28 |
| `codConsulta` | `encounter_services.cups_code` | — | Obligatorio | C04, p.28 |
| `modalidadGrupoServicioTecSal` | `encounter_services.modalidad_code` | — | Opcional en Odentia hoy (no bloquea readiness) | C05, p.29 |
| `grupoServicios` | `encounter_services.grupo_servicios_code` | — | Opcional | C06, p.29 |
| `codServicio` | `encounter_services.cod_servicio_code` | Sin cruce contra `CUPSGrServicios` — ver decisión abajo | Opcional | C07, p.29 |
| `finalidadTecnologiaSalud` | `encounter_services.finalidad_code` | — | Opcional | C08, p.30 |
| `causaMotivoAtencion` | `encounter_services.causa_motivo_code` | Solo aplica si `rips_service_type = 'consultation'` (CHECK constraint estructural desde RIPS #4A) | Opcional | C09, p.34 |
| `codDiagnosticoPrincipal` | `encounter_diagnoses` (rol `principal`) | Ver "Resolución de diagnósticos por servicio" abajo | Obligatorio | C10, p.34 |
| `codDiagnosticoPrincipalCIE11` / `nomCodDiagnosticoPrincipalCIE11` | — | Siempre `null` — Odentia es CIE10 exclusivamente | Condicional | C23/C24, p.36 |
| `codDiagnosticoRelacionado1/2/3` | `encounter_diagnoses` (rol `related`) | Hasta 3 CAMPOS FIJOS (nunca arreglo) — se truncan los excedentes (con warning interno, nunca error) | Condicional | C11/C12/C13, p.35-37 |
| `codDiagnosticoRelacionado{1,2,3}CIE11` / `nomCodDiagnosticoRelacionado{1,2,3}CIE11` | — | Siempre `null` | Condicional | C25-C29 |
| `tipoDiagnosticoPrincipal` | `encounter_diagnoses.diagnosis_type_code` (fila principal) | `""` si no se capturó (no bloquea readiness hoy — gap documentado) | Obligatorio en DT1, no bloqueante en Odentia hoy | C14, p.38 |
| `tipoDocumentoIdentificacion` / `numDocumentoIdentificacion` | `professional_profiles.document_type/document_number` del profesional del servicio | — | Obligatorio | C15/C16, p.39 |
| `vrServicio` | `encounter_services.service_value` | "Si el RIPS es sin FEV, debe informar el valor pagado por el paciente" | Obligatorio (bloquea readiness si falta) | C17, p.39 |
| `conceptoRecaudo` | `encounter_services.concepto_recaudo_code` | — | Opcional | C18, p.40 |
| `valorPagoModerador` | `encounter_services.valor_pago_moderador` | Nunca `null` — "cuando no aplique... informar cero (0)" | Obligatorio (valor 0 si no aplica) | C19, p.40 |
| `numFEVPagoModerador` | — | Siempre `null` — Odentia no emite FEV de copago | Condicional | C20, p.41 |
| `consecutivo` | calculado | 1..N dentro de `servicios.consultas[]` de ESTE usuario (reinicia por usuario) | Obligatorio | C21, p.42 |
| `codigoVIDA` | — | Siempre `null` — depende del proyecto IHCE, "obligatorio una vez entre en operación" (aún no) | Condicional | C22, p.41 |

## Procedimientos (4.3.2)

Diferencias clave frente a consultas: solo **un** diagnóstico relacionado
(no 3), y campos distintos `viaIngresoServicioSalud`/`idMIPRES`/
`codComplicacion` en vez de `causaMotivoAtencion`/`tipoDiagnosticoPrincipal`.

| Campo | Fuente Odentia | Regla | Oblig./Cond. | Fuente normativa |
|---|---|---|---|---|
| `codPrestador` / `fechaInicioAtencion` | igual que consultas | — | Obligatorio | P01/P02, p.44 |
| `idMIPRES` | — | Siempre `null` — Odentia no gestiona prescripciones MIPRES | Condicional | P03, p.44 |
| `numAutorizacion` | — | Siempre `null` | Condicional | P04, p.44 |
| `codProcedimiento` | `encounter_services.cups_code` | — | Obligatorio | P05, p.44 |
| `viaIngresoServicioSalud` | `encounter_services.via_ingreso_code` | Solo aplica si `rips_service_type = 'procedure'` (CHECK constraint) | Opcional | P06, p.47 |
| `modalidadGrupoServicioTecSal` / `grupoServicios` / `codServicio` / `finalidadTecnologiaSalud` | igual que consultas | — | Opcional | P07-P10 |
| `tipoDocumentoIdentificacion` / `numDocumentoIdentificacion` | `professional_profiles` del profesional | — | Obligatorio | P11/P12, p.49 |
| `codDiagnosticoPrincipal` | `encounter_diagnoses` (rol `principal`) | Ver "Resolución de diagnósticos" | Obligatorio | P13, p.49 |
| `codDiagnosticoPrincipalCIE11` / `nomCodDiagnosticoPrincipalCIE11` | — | Siempre `null` | Condicional | P21/P22 |
| `codDiagnosticoRelacionado` | `encounter_diagnoses` (rol `related`) | **UN SOLO campo** (no 3 como en consultas) — se trunca a 1 con warning si hay más | Condicional | P14, p.50 |
| `codDiagnosticoRelacionadoCIE11` / `nomCodDiagnosticoRelacionadoCIE11` | — | Siempre `null` | Condicional | P23/P24 |
| `codComplicacion` | — | Siempre `null` — Odentia no modela complicaciones clínicas hoy | Condicional | P15, p.51 |
| `vrServicio` | `encounter_services.service_value` | Siempre `0` — "Si el RIPS es sin FEV, informar cero (0)" (ya el default en DB desde RIPS #4) | Obligatorio (valor 0) | P16, p.53 |
| `conceptoRecaudo` / `valorPagoModerador` / `numFEVPagoModerador` | igual que consultas | `valorPagoModerador` nunca `null` | ídem | P17-P19 |
| `consecutivo` | calculado | 1..N dentro de `servicios.procedimientos[]` de ESTE usuario | Obligatorio | — |
| `codigoVIDA` | — | Siempre `null` | Condicional | P27 |

## Resolución de diagnósticos por servicio

Cada consulta/procedimiento necesita su propio diagnóstico principal (y
relacionados) aunque Odentia modele los diagnósticos a nivel de la
atención completa (ver RIPS #4). Regla implementada
(`resolveDiagnosesForService`, `export-generator.ts`):

- **Principal**: si existe un diagnóstico principal ESCOPEADO a este
  servicio específico (`encounter_service_id` = id de este servicio),
  ese aplica; si no, se usa el principal de toda la atención
  (`encounter_service_id = null`). Nunca ambos, nunca ninguno una vez que
  readiness pasó.
- **Relacionados**: la UNIÓN de los relacionados de toda la atención y
  los específicos de este servicio, deduplicados por código CIE-10,
  ordenados por `sequence` (determinístico), truncados al límite del
  esquema (3 para consulta, 1 para procedimiento) — el excedente genera
  un `GeneratorWarning`, nunca un error ni una pérdida silenciosa.

## Resolución de sede (codPrestador)

**Hallazgo de la auditoría**: no existe ningún vínculo estructural entre
una cita/atención y una `clinic_location` específica —
`appointments.room` es un valor de texto libre de un catálogo fijo, sin
FK a `clinic_locations`, y no existe tabla `rooms.location_id`.

Decisión: cuando la clínica tiene **exactamente una** sede, se usa (no es
una suposición — es la única candidata posible). Cuando tiene **más de
una**, `getRipsExportReadiness` bloquea con `LOCATION_AMBIGUOUS`: no se
elige automáticamente la sede principal. Corregir esto de raíz (vincular
cada cita/atención a una sede) queda fuera de esta fase.

## Decisión: CUPSGrServicios (Sección 38)

`CUPSGrServicios` (~1.44M filas) sigue sin importarse. `grupoServicios`/
`codServicio` se validan cada uno contra SU PROPIO catálogo oficial
(`GrupoServicios`, `Servicios`) al momento de guardar el servicio (RIPS
#4's `upsert_patient_clinical_encounter`), pero Odentia **no** valida que
la combinación específica (este CUPS + este grupo + este servicio) sea la
oficialmente asociada. Por eso el lenguaje de readiness es deliberadamente
acotado: "todos los datos requeridos y validables por Odentia están
presentes y son válidos contra los catálogos oficiales que tenemos" —
nunca "este RIPS pasará el MUV sin objeciones". Esa validación cruzada
fina queda para el MUV o una fase de prevalidación futura (RIPS #6+),
nunca ocultada ni fingida como ya resuelta.

## Null vs omitted (Sección 18)

Regla aplicada de forma uniforme: **todo campo documentado por el
esquema siempre está presente** en el JSON — el valor es `null` cuando no
aplica/no se captura, nunca se omite la propiedad. Esto replica
exactamente la convención que el propio Documento Técnico 1 usa en sus
ejemplos (p. ej. `"codDiagnosticoRelacionado2": null`). La única
excepción real es a nivel de objeto (no de campo escalar): `servicios`
solo incluye las claves `consultas`/`procedimientos` que realmente tienen
al menos un elemento — nunca un arreglo vacío, y nunca las otras cinco
claves (`urgencias`, etc.) que no aplican al alcance de Odentia.

## Valores monetarios (Sección 17)

`vrServicio`/`valorPagoModerador` se serializan como `number` de JSON
(nunca string, nunca con símbolo de moneda ni separadores de miles) —
`toMoneyNumber()` en `export-generator.ts` coerciona explícitamente
cualquier valor que llegue como string desde el driver, en vez de
serializarlo tal cual.
