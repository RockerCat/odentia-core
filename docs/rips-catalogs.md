# RIPS — Infraestructura de catálogos oficiales

Esta es la documentación técnica de la infraestructura de catálogos RIPS
(CUPS, diagnósticos, tablas de referencia SISPRO). Cubre solo esta capa —
**no** el motor RIPS, ni la generación de JSON, ni ningún cambio a
Paciente/Profesional/Clínica/Atención. Ver el reporte de la auditoría
previa (sesión "RIPS 01") para el panorama completo del feature.

## 1. Arquitectura

```
FUENTE OFICIAL (MinSalud / SISPRO)
  → archivo CSV descargado/verificado por un humano
  → scripts/rips-import/import-{cups,diagnoses,references}.mjs
      · parsea y valida estructura (columnas, duplicados, campos vacíos)
      · calcula sha256 del archivo
      · llama a la RPC de importación correspondiente
  → import_rips_{cups,diagnosis,reference_values}(...) [Postgres, una sola
      transacción por ejecución]
      · registra la versión en rips_catalog_imports
      · marca la versión anterior (si existe) como 'superseded', sin
        borrarla
      · hace upsert idempotente de cada código en su tabla de catálogo
  → cups_catalog / diagnosis_catalog / rips_reference_values
      (RLS: lectura para cualquier `authenticated`, sin escritura vía API)
  → src/features/rips/catalog-data.ts (capa de lectura server-side)
  → (futuro, NO implementado aquí) UI + motor RIPS
```

Ningún catálogo se consulta en tiempo real contra SISPRO durante una
atención — todo pasa primero por una importación controlada.

## 2. Fuentes oficiales

| Catálogo | Autoridad | Documento/Resolución | Estado |
|---|---|---|---|
| CUPS | Ministerio de Salud y Protección Social / SISPRO | Resolución 2706 de 2025 (vigente desde 2026-01-01) | **Cargado** (13.632 códigos, sesión RIPS 02C) |
| CIE-10 | OMS / adaptación SISPRO — tabla oficial SISPRO `CIE10` | Documento Técnico 1 — Resolución 948 de 2026 | **Cargado** (12.634 códigos, sesión RIPS 02D) |
| CIE-11 | OMS / adaptación SISPRO | Documento Técnico 1 — Resolución 948 de 2026 | Infraestructura lista (`classification_system` soporta `'CIE11'`); **archivo oficial no cargado** |
| Tablas de referencia (16 catalog_key — ver Sección 3) | Ministerio de Salud y Protección Social / SISPRO (`web.sispro.gov.co`) | Documento Técnico 1 — Resolución 948 de 2026 | **Cargadas** (sesión RIPS 02E, 2026-09-10) |

Ver la Sección 8 más abajo para el estado exacto, la matriz campo RIPS →
tabla SISPRO → `catalog_key`, y lo que queda pendiente (CIE-11, y el
caso especial `CUPSGrServicios` — Sección 5).

## 3. Modelo de datos

- **`rips_catalog_imports`** — una fila por versión importada de un
  catálogo. Responde "¿de qué resolución/archivo salió esta versión?" y
  "¿qué versión estaba vigente en la fecha X?". A lo sumo una fila
  `status = 'active'` por `catalog_key` (índice único parcial).
- **`cups_catalog`** — tabla especializada (no la genérica de abajo): CUPS
  tiene volumen (~13.640 códigos) y necesidad de búsqueda textual propia.
  Incluye `rips_service_type` (`'consultation' | 'procedure' | 'unknown'`)
  — ver Sección 5.
- **`diagnosis_catalog`** — tabla especializada, con `classification_system`
  como texto libre (`'CIE10'`, `'CIE11'`, o una clasificación futura) en
  vez de una tabla `cie10_diagnoses` — CIE-10 y CIE-11 conviven hoy como
  campos paralelos activos en el Documento Técnico 1 vigente, no es una
  migración futura hipotética.
- **`rips_reference_values`** — UNA tabla genérica para todos los
  catálogos pequeños del Documento Técnico 1 (Sexo, Municipio, TipoNota,
  etc.), distinguidos por `catalog_key`. Evita quince tablas casi vacías.
  `parent_code` soporta la única jerarquía oficial confirmada hasta ahora
  (Municipio → Departamento) — sin FK formal todavía (ver Sección 6).

Cada tabla de catálogo (`cups_catalog`, `diagnosis_catalog`,
`rips_reference_values`) versiona sus propias filas por
`(código, version_label)` — reimportar la misma versión actualiza esas
filas en su lugar (idempotente); una versión nueva inserta filas nuevas
sin tocar ni borrar las anteriores, que quedan con
`status = 'superseded'` y `valid_to` cerrado. Ningún código se sobrescribe
irreversiblemente.

### `catalog_key` en `rips_reference_values` (cargados, sesión RIPS 02E)

`catalog_key` usa el **Código oficial de la tabla en SISPRO tal cual**
(columna `Tabla`/parámetro `Code=` de
`ConsultarDetalleReferenciaBasica.aspx`), no un alias inventado —
trazabilidad directa 1:1 con la fuente. La lista candidata original de
esta sección (arriba, en versiones previas de este documento) usaba
nombres de campo RIPS como alias (`Sexo`, `ViaIngresoServicioSalud`,
`ModalidadGrupoServicioTecSal`, `ConceptoRecaudo`, `CausaMotivoAtencion`)
que **no son los Códigos reales de tabla en SISPRO** — se descartaron a
favor de los Códigos oficiales verificados abajo. `TipoIdPISIS` se evaluó
como candidata y se descartó: el campo U01 real usa la tabla `TipoDocumento`
(transversal SISPRO-TRV), no `TipoIdPISIS`.

| catalog_key (Código oficial SISPRO) | Filas | Campo(s) RIPS | Notas |
|---|---|---|---|
| `TipoDocumento` | 13 | U01 tipoDocumentoIdentificacion | — |
| `SEXOconIndeterminado` | 3 | U05 codSexo | **Remapeo**: se importó el valor de la columna `Extra` (H→M, I→I, M→F), no el `Codigo` primario (H/I/M) |
| `Pais` | 249 | U06 codPaisResidencia, U11 codPaisOrigen | ISO 3166-1 numérico |
| `Municipio` | 1.124 | U07 codMunicipioResidencia | `parent_code` = departamento, tomado de la columna oficial `Extra_I:Departamento` (33 departamentos) |
| `ZonaVersion2` | 2 | U08 codZonaTerritorialResidencia | Reemplaza la tabla obsoleta `Zona` |
| `LstSiNo` | 2 | U09 incapacidad | **Remapeo**: se importó el valor de `Extra_III:ListSINO10` (SI→01, NO→02), no el `Codigo` primario (texto SI/NO) |
| `RIPSTipoUsuarioVersion2` | 14 | U03 tipoUsuario | Código 14 tiene un defecto de codificación verificado en la fuente SISPRO misma (falta una "á") — ver Sección 8 |
| `TipoNota` | 4 | T03 tipoNota | RS = "RIPS sin Factura" |
| `GrupoServicios` | 5 | C06/P08 grupoServicios | — |
| `Servicios` | 157 | C07/P09 codServicio | `parent_code` = GrupoServicios, derivado del sufijo textual oficial de `Descripcion` |
| `ModalidadAtencion` | 8 | C05/P07 modalidadGrupoServicioTecSal | Códigos 01-04, 06-09 (no existe 05) |
| `conceptoRecaudo` | 5 | C18/P17 conceptoRecaudo | — |
| `RIPSFinalidadConsultaVersion2` | 34 | C08 y P10 finalidadTecnologiaSalud | Tabla única para consulta y procedimiento (columnas `Extra_I:Consultas`/`Extra_II:Procedimientos`) |
| `RIPSCausaExternaVersion2` | 29 | C09 causaMotivoAtencion | — |
| `RIPSTipoDiagnosticoPrincipalVersion2` | 3 | C14 tipoDiagnosticoPrincipal | — |
| `RIPSViaIngresoIPS` | 4 | P06 viaIngresoServicioSalud | **Reformateo**: Código oficial de 1 dígito, rellenado a 2 dígitos (01-04) para el tamaño exigido por el campo; no hay variante Version2 |

Candidatas descartadas por no aplicar al alcance RIPS-sin-factura /
Transacción-Usuario-Consulta-Procedimiento (sesión RIPS 02E):
`modalidadPago` (no aparece en el Documento Técnico 1 para ningún campo
en alcance — tabla de facturación electrónica) y `RIPSFinalidadProcedimiento`
(tabla obsoleta 2014-2016, códigos 1-5, sin relación de codificación con
`RIPSFinalidadConsultaVersion2`, que ya cubre P10 vía su columna
`Extra_II:Procedimientos`).

## 4. `rips_service_type` en CUPS — cómo se deriva (y cómo NO)

La auditoría previa encontró que el CUPS `890304` es oficialmente una
**consulta**, aunque el archivo de referencia de la odontóloga lo trató
como procedimiento. Para que Odentia nunca repita ese error:

- `rips_service_type` es `'unknown'` por defecto.
- Solo puede marcarse `'consultation'`/`'procedure'` cuando el importador
  recibe, para esa fila, un `rips_service_type_source` no vacío — un
  constraint de base de datos (`cups_catalog_rips_service_type_source_required`)
  lo exige.
- El importador (`import-cups.mjs`) **no infiere nada por heurística de
  texto** sobre la descripción — el CSV de entrada debe traer ya
  poblados `rips_service_type`/`rips_service_type_source` para cada fila
  que se quiera clasificar (típicamente derivados, fuera de este script,
  de una columna de capítulo/sección oficial del archivo CUPS real — algo
  que no pudo confirmarse en esta sesión por no tener el archivo, ver
  Sección 8). Sin esa fuente, el código queda `'unknown'`, nunca
  adivinado.

## 5. Municipio → Departamento

`rips_reference_values.parent_code` guarda, para `catalog_key =
'Municipio'`, el código de departamento (2 dígitos). **Resuelto en la
sesión RIPS 02E**: SISPRO publica esta jerarquía como una columna propia
del archivo de Municipio (`Extra_I:Departamento`), no como un
`catalog_key` de Departamento independiente — no se cargó un catálogo
`Departamento` separado porque el Documento Técnico 1 no lo pide como
tabla propia para ningún campo en alcance de este MVP. Sigue sin haber
foreign key formal hacia otra fila de `rips_reference_values`.

## 5bis. `CUPSGrServicios` — hallazgo y propuesta (no cargado)

El Documento Técnico 1 (Resolución 948 de 2026) declara, como regla de
validación **opcional** para el campo CUPS tanto en Consulta como en
Procedimiento: *"El código de CUPS puede ser validado con el grupo de
servicio, servicio, finalidad y causa."* Esto corresponde exactamente a
la tabla SISPRO `CUPSGrServicios`, ya localizada en la sesión RIPS 02C.

Verificado en esta sesión (2026-09-10): `CUPSGrServicios` tiene
**1.443.708 filas**. Su estructura NO es un catálogo enumerado simple:
`Codigo` es un identificador secuencial interno sin significado RIPS
(1, 10, 100, 1000...), `Nombre`/`Descripcion` es un identificador de lote
interno (p.ej. "DCX1"), y el par realmente útil vive en las columnas
`Extra_I:CUPS` (código CUPS real) y `Extra_II:GrServicios` (una
combinación codificada de grupo+servicio+modalidad, p.ej. "01301"). Es,
en esencia, una tabla de combinaciones válidas CUPS ↔ grupo/servicio, no
un catálogo de valores.

**Por la Regla 9 de la sesión RIPS 02E: no se fuerza ni se improvisa una
migración.** `rips_reference_values` (code/label/parent_code) no puede
representar correctamente una relación combinatoria de 1.44M filas entre
dos dominios distintos (CUPS × grupo/servicio) — intentarlo forzaría un
modelo de datos incorrecto. Se reporta el caso sin cargar el catálogo.

**Propuesta mínima** (no implementada en esta sesión, requiere decisión
explícita antes de construirla): una tabla dedicada, p.ej.
`cups_grupo_servicio_mappings(cups_code, grupo_servicios_code,
codigo_combinado, ...)`, poblada por su propio importador — nunca
forzada dentro de `rips_reference_values`. Como la regla del Documento
Técnico 1 es explícitamente opcional ("puede ser validado", no
"debe"), esta relación no es un bloqueante para el MVP RIPS-sin-factura
actual; queda como trabajo futuro si se decide implementar esa
validación cruzada.

## 6. Cómo ejecutar una importación

```bash
export NEXT_PUBLIC_SUPABASE_URL=...        # ya en .env.local
export SUPABASE_SERVICE_ROLE_KEY=...       # NUNCA lo pongas en .env.local
                                            # ni en ningún archivo versionado

npm run rips:import:cups -- \
  --file /ruta/a/cups-2026.csv \
  --version-label 2026 \
  --valid-from 2026-01-01 \
  --source-resolution "Resolución 2706 de 2025" \
  --source-url "https://www.sispro.gov.co/..."

npm run rips:import:diagnoses -- \
  --file /ruta/a/cie10.csv \
  --classification-system CIE10 \
  --version-label 2026 \
  --valid-from 2026-01-01 \
  --source-url "https://www.sispro.gov.co/..."

npm run rips:import:references -- \
  --file /ruta/a/municipio.csv \
  --catalog-key Municipio \
  --version-label 2026 \
  --valid-from 2026-01-01 \
  --source-url "https://www.sispro.gov.co/..."
```

Cada comando imprime un resumen (`Imported / Added / Updated / Unchanged`)
al finalizar. Un archivo con columnas faltantes, campos vacíos en
`code`/`description`/`label`, o códigos duplicados, se rechaza **antes**
de tocar la base de datos — no hay importación parcial posible (ver
Sección 8 del reporte de implementación: transaccionalidad).

### Formato de archivo esperado

CSV UTF-8, separado por comas, con fila de encabezado.

| Importador | Columnas requeridas | Columnas opcionales |
|---|---|---|
| CUPS | `code`, `description` | `chapter`, `section`, `category`, `rips_service_type`, `rips_service_type_source` |
| Diagnósticos | `code`, `description` | `chapter`, `category` |
| Referencias | `code`, `label` | `parent_code` |

**Los archivos oficiales de MinSalud/SISPRO suelen distribuirse en
Excel (.xlsx), no en CSV.** Esta implementación deliberadamente no agrega
una dependencia de parseo de Excel (ver Sección 17 del reporte de
implementación) — conviértelos a CSV con Excel/LibreOffice/`ssconvert`
antes de importar. Si los nombres de columna del archivo real no
coinciden con los de la tabla de arriba, ajusta el CSV (o el importador,
si el desajuste es sistemático) — no adivines un mapeo.

## 7. Actualizar a una versión nueva

Vuelve a correr el mismo comando con un `--version-label` distinto (y su
propio `--valid-from`). La versión anterior queda automáticamente
`status = 'superseded'` con `valid_to` cerrado el día antes del nuevo
`valid_from` — nunca se borra.

## 8. Estado real de la carga de catálogos

**C. CUPS, CIE-10 y las 16 tablas de referencia del MVP RIPS-sin-factura
están cargados y verificados.** CIE-11 y `CUPSGrServicios` (Sección 5bis)
quedan pendientes, y no son necesarios para el alcance actual.

- CUPS: 13.632 códigos (sesión RIPS 02C).
- CIE-10: 12.634 códigos (sesión RIPS 02D).
- Tablas de referencia: 16 `catalog_key` (Sección 3), todas verificadas
  contra SISPRO el 2026-09-10 (conteo exacto, sin duplicados, sin campos
  vacíos, y valores puntuales confirmados manualmente) y reimportadas
  para confirmar idempotencia (mismo `import_id`, mismo conteo de filas,
  historial intacto — sesión RIPS 02E, ver
  `RIPS_02E_REFERENCE_TABLES_REPORT.md` para el detalle completo).

**Defecto de codificación conocido, no corregido**: el label oficial del
código `14` de `RIPSTipoUsuarioVersion2` aparece en el propio render de
SISPRO como "Lesionado en accidente de tr nsito sin seguro SOAT" (falta
la "á"). Verificado con captura de pantalla directa de sispro.gov.co —
no es un artefacto de este proyecto. Se importó verbatim para no divergir
del dato oficialmente publicado.

**Qué queda pendiente:**

1. CIE-11 — tabla de referencia SISPRO citada en el Documento Técnico 1;
   no se cargó (no requerida por el alcance actual, ver Sección 2).
2. `CUPSGrServicios` — ver la propuesta de la Sección 5bis; solo
   necesaria si se decide implementar la validación cruzada opcional
   CUPS ↔ grupo/servicio.
3. Para `rips_service_type` en CUPS: confirmar si el archivo oficial de
   CUPS distingue estructuralmente "consulta" de "procedimiento" (p.ej.
   una columna de capítulo/sección), y en tal caso construir el mapeo
   capítulo→tipo una sola vez, de forma revisable por un humano — nunca
   heurística de texto en tiempo de import.

## 9. Qué NO hacer

- No agregues catálogos hardcodeados en TypeScript/React "mientras tanto".
- No importes un catálogo desde un blog, PDF de terceros, o el JSON de
  ejemplo de la odontóloga — únicamente desde el archivo oficial.
- No le des a `authenticated`/`anon` ningún permiso de escritura sobre
  estas tablas — la única puerta de escritura son las funciones
  `import_rips_*_catalog`, invocadas por un script con la service role
  key.
- No agregues `clinic_id` a ninguna de estas tablas — son catálogos
  globales, compartidos por todas las clínicas.
- No implementes scraping en runtime contra SISPRO — el input siempre es
  un archivo ya descargado/verificado por un humano.
- No borres una versión anterior al importar una nueva — el modelo existe
  precisamente para conservarla como `superseded`.

## 10. Rollback lógico

No hay DELETE físico expuesto en ningún camino de escritura. Para
"deshacer" una importación equivocada:

1. Corregir el archivo fuente.
2. Reimportar con el MISMO `version_label` — el upsert corrige las filas
   en el lugar.
3. Si la versión completa nunca debió existir, marcarla manualmente
   (fuera de esta infraestructura, vía Studio/SQL directo con privilegios
   de administrador) como `status = 'deprecated'`/`'superseded'` — no
   existe todavía una RPC para esto porque no fue parte del alcance de
   este prompt (ver "no implementar todavía").

## 11. Fixtures de test

`scripts/rips-import/fixtures/cups-sample.csv` y los códigos usados en
`scripts/rips-import/lib.test.mjs` / `import-rpc.integration.test.mjs`
son siempre `TEST###`/`TEST_REFERENCE` — nunca códigos CUPS/CIE/SISPRO
reales. No los uses como referencia de ningún valor oficial.
