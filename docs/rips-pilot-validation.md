# RIPS — validación piloto real (carga manual al MUV)

Odentia no se conecta a SISPRO/MUV (ver RIPS #6A — PASS WITH ISSUES: la
infraestructura Docker + SQL Server que exige la solución oficial no existe
hoy en Vercel/Supabase). El flujo productivo actual, y el único que existe,
es:

```
Odentia → validar período → generar JSON RIPS sin factura → descargar
        → odontóloga carga el archivo manualmente en su MUV
        → MUV valida → aceptación/CUV o rechazo
```

## Qué valida cada parte

- **Odentia** valida dos cosas, ninguna de las cuales es "el RIPS es
  correcto para el Ministerio": (1) *readiness* — que existan los datos
  mínimos que Odentia conoce como necesarios (`export-readiness.ts`); (2)
  *esquema estructural* — que el JSON generado tenga la forma que
  Documento Técnico 1 v003 exige (`export-schema.ts`). Ninguna reproduce
  las 100+ reglas cruzadas de la MUV.
- **El MUV** (Ministerio de Salud) es la única fuente real de "este RIPS es
  válido". Su resultado (aceptación + CUV, o rechazo) se registra en
  Odentia manualmente — nunca se infiere.

Por eso `/rips` nunca usa la palabra "Validado" para el resultado de
Odentia — solo "Listo para generar" y "Archivo generado". "Aceptado por
MUV" / "Rechazado por MUV" aparecen únicamente después de que un
`clinic_admin` registra ese resultado a mano.

## Cómo generar y descargar

1. Entra a `/rips` (solo `clinic_admin`).
2. Selecciona el período (mes/año).
3. Resuelve los pendientes que Odentia señale, si los hay.
4. Pulsa **Generar RIPS** — descarga `RIPS_Sin_Factura_YYYY-MM.json`.

Cada generación exitosa crea una fila nueva en `rips_export_log`, con un
`content_hash` — SHA-256 del contenido exacto del JSON descargado — que
identifica sin ambigüedad qué archivo fue el que se generó. Regenerar el
mismo período produce un registro nuevo (nunca sobrescribe el anterior);
si los datos no cambiaron, el hash será idéntico, lo que permite
confirmar que dos descargas contienen exactamente el mismo contenido.

## Cómo identificar un export

En **Historial de archivos** (parte inferior de `/rips`) cada fila muestra
el período, la fecha de generación y los conteos de pacientes/consultas/
procedimientos — nunca el UUID técnico ni datos clínicos. Ese identificador
interno (`rips_export_log.id`) es el que Odentia usa para asociar
posteriormente un resultado del MUV a ese archivo exacto.

## Cómo realizar la prueba manual con la odontóloga

Checklist (nada de esto se ejecuta automáticamente — es el procedimiento
humano a seguir):

1. Entrar a Odentia con la clínica piloto.
2. Seleccionar el período real a probar.
3. Resolver los pendientes que Odentia señale.
4. Generar el RIPS.
5. Descargar el JSON.
6. Anotar (o simplemente ubicar después en el Historial) el export
   correspondiente — período + fecha + conteos son suficientes para
   identificarlo sin ambigüedad.
7. La odontóloga entra a su mecanismo oficial habitual (Cliente-Servidor o
   el proceso que ya use hoy).
8. Carga manualmente **exactamente ese** archivo — no uno regenerado
   después.
9. Espera el resultado del MUV.
10. Si el MUV **acepta**: en Odentia, sobre esa fila del historial, pulsar
    **Registrar resultado del MUV** → Aceptado → capturar el CUV
    (obligatorio), y el ProcesoId/fecha de radicación si están
    disponibles.
11. Si el MUV **rechaza**: pulsar **Registrar resultado del MUV** →
    Rechazado → escribir un resumen humano del motivo/código reportado.
    Conservar la respuesta original del MUV fuera de Odentia (no se pega
    aquí un payload completo).
12. Comparar el resultado contra `docs/rips-json-mapping.md` y el
    generador (`export-generator.ts`) para decidir si algo debe corregirse.
13. Nunca modificar silenciamente el export que fue probado — un
    resultado registrado (`accepted`/`rejected`) es inmutable en Odentia;
    una regeneración posterior del mismo período crea un registro nuevo,
    independiente.

## Qué NO hace Odentia todavía

- No transmite nada al MUV — la carga siempre es manual, por la
  odontóloga, en su propio mecanismo oficial.
- No solicita ni almacena usuario/contraseña de SISPRO.
- No genera, infiere ni valida el formato de un CUV — se captura tal cual
  lo entrega el Ministerio.
- No permite editar un resultado ya registrado — un error de tipeo real
  requeriría una corrección administrativa futura, fuera de este MVP.

## Siguiente paso

El siguiente paso NO es RIPS #6B (integración automática). Es la
**validación piloto real** descrita arriba, con la odontóloga. Solo después
de esa prueba real se decide si el trabajo siguiente es corregir el
generador (según lo que el MUV rechace) o invertir en la infraestructura
de envío automático (RIPS #6A's propio hallazgo pendiente).
