import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import {
  getToothKind,
  LOWER_LEFT,
  LOWER_RIGHT,
  UPPER_LEFT,
  UPPER_RIGHT,
  type FindingType,
  type OdontogramData,
} from "@/features/dashboard/odontogram-teeth";
import { PDF_COLORS } from "./pdf-theme";
import type { PdfDocumentRow, PdfEncounterRow, PdfFindingRow, RealClinicalRecordPdfData } from "./real-clinical-record-data";
import { ToothGlyphPdf } from "./tooth-glyph-pdf";

// Real Historia Clínica PDF — same visual design/hierarchy as the
// approved reference document (clinical-record-document.tsx, the mock/demo
// reference this restores layout from, never imported or modified —
// same reasoning as patient-clinical-record-screen.tsx vs
// clinical-record-screen.tsx throughout this feature). The StyleSheet
// below is deliberately a close copy of that reference's own styles (same
// visual output, "diseño profesional aprobado" preserved) — only the JSX
// tree and the data it renders differ, since the real data shapes
// (PatientMedicalHistory/ToothFindingRecord/ClinicalEncounterRecord/
// ClinicalDocumentRecord) aren't the mock Patient's shape. Pure primitives
// genuinely shared with the reference (PDF_COLORS, ToothGlyphPdf,
// getToothKind/UPPER_RIGHT/etc.) ARE imported directly, not duplicated.
const FINDING_TYPE_COLOR: Record<FindingType, string> = {
  caries: PDF_COLORS.danger,
  restauracion: PDF_COLORS.info,
  ausente: PDF_COLORS.mutedForeground,
  otro: PDF_COLORS.warning,
};

const FINDING_TYPE_LABEL: Record<FindingType, string> = {
  caries: "Caries",
  restauracion: "Restauración",
  ausente: "Ausente",
  otro: "Otro",
};

const FINDING_LEGEND: { type: FindingType; label: string }[] = [
  { type: "caries", label: "Caries" },
  { type: "restauracion", label: "Restauración" },
  { type: "ausente", label: "Ausente" },
  { type: "otro", label: "Otro" },
];

const MARGIN_X = 42;

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 50,
    paddingHorizontal: MARGIN_X,
    fontSize: 9,
    lineHeight: 1.35,
    color: PDF_COLORS.foreground,
    fontFamily: "Helvetica",
  },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 3.5, backgroundColor: PDF_COLORS.primary },
  runningHeader: {
    position: "absolute",
    top: 18,
    left: MARGIN_X,
    right: MARGIN_X,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 5,
    borderBottomWidth: 0.75,
    borderBottomColor: PDF_COLORS.border,
    fontSize: 7.5,
    color: PDF_COLORS.mutedForeground,
  },
  runningHeaderName: { fontFamily: "Helvetica-Bold", color: PDF_COLORS.foreground },
  // No textTransform:"uppercase" here — the patient's real name must keep
  // its normal capitalization in the printed PDF (see task scope), never
  // an artificial uppercase transform.
  runningHeaderRight: { letterSpacing: 0.5 },
  runningHeaderAccent: { color: PDF_COLORS.primary, fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    top: 803,
    left: MARGIN_X,
    right: MARGIN_X,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.75,
    borderTopColor: PDF_COLORS.border,
    paddingTop: 6,
    fontSize: 7.5,
    letterSpacing: 0.3,
    color: PDF_COLORS.mutedForeground,
  },
  footerBrand: { color: PDF_COLORS.primary, fontFamily: "Helvetica-Bold" },
  openingBrandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  openingBrandLeft: { flexDirection: "row", alignItems: "center" },
  openingLogo: { width: 100, height: 30, marginRight: 10, objectFit: "contain" },
  openingClinicName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: PDF_COLORS.primary },
  openingMetaRight: { alignItems: "flex-end" },
  openingMetaLabel: { fontSize: 7, color: PDF_COLORS.labelForeground, textTransform: "uppercase", letterSpacing: 0.7 },
  openingMetaValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: PDF_COLORS.foreground, marginTop: 1 },
  openingHeavyRule: { height: 2.5, backgroundColor: PDF_COLORS.primary, marginTop: 12, marginBottom: 18 },
  openingKicker: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  openingPatientName: { fontSize: 24, fontFamily: "Helvetica-Bold", color: PDF_COLORS.foreground },
  openingSubtitle: { fontSize: 9.5, color: PDF_COLORS.mutedForeground, marginTop: 16, marginBottom: 18 },
  panelRow: { flexDirection: "row", marginHorizontal: -5 },
  panel: { flex: 1, backgroundColor: PDF_COLORS.surface, borderRadius: 5, padding: 12, marginHorizontal: 5 },
  panelLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  // width:96 (was 72) so "Odontólogo habitual" — the longest real label in
  // this panel — fits on one line instead of wrapping into the value's
  // row and reading as cramped against it; marginTop:6 (was 4) gives every
  // PanelLine a touch more breathing room, applied uniformly, not singled
  // out for this one field.
  panelLine: { flexDirection: "row", marginTop: 6 },
  panelLineLabel: { fontSize: 8, color: PDF_COLORS.mutedForeground, width: 96 },
  panelLineValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: PDF_COLORS.foreground, flex: 1 },
  alertHero: {
    flexDirection: "row",
    backgroundColor: PDF_COLORS.dangerTint,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.danger,
    borderRadius: 4,
    padding: 12,
    marginTop: 16,
  },
  alertHeading: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.danger,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  alertGrid: { flexDirection: "row", flexWrap: "wrap" },
  alertItem: { width: "33%", paddingRight: 8, marginTop: 3 },
  alertLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: PDF_COLORS.danger, textTransform: "uppercase", letterSpacing: 0.4 },
  alertValue: { fontSize: 9, color: PDF_COLORS.foreground, marginTop: 1 },
  alertEmpty: { fontSize: 8.5, color: PDF_COLORS.mutedForeground, marginTop: 16 },
  section: { marginTop: 22 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  sectionDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: PDF_COLORS.primary, marginRight: 7 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: PDF_COLORS.foreground },
  sectionRule: { height: 0.75, backgroundColor: PDF_COLORS.border, marginBottom: 12 },
  emptyState: { fontSize: 8.5, color: PDF_COLORS.mutedForeground },
  subLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  subLabelRule: { height: 1.5, backgroundColor: PDF_COLORS.primary, marginBottom: 10, opacity: 0.35 },
  anamnesisMeta: { fontSize: 8, color: PDF_COLORS.mutedForeground, marginBottom: 10 },
  anamnesisGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  anamnesisItem: { width: "50%", paddingHorizontal: 5, marginBottom: 10 },
  anamnesisBlock: { backgroundColor: PDF_COLORS.surface, borderRadius: 5, padding: 10 },
  anamnesisLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.labelForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  anamnesisValue: { fontSize: 9, lineHeight: 1.4, color: PDF_COLORS.foreground },
  odontoFrame: {
    backgroundColor: PDF_COLORS.primaryTint,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.primary,
    borderRadius: 4,
    padding: 11,
  },
  odontoMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  odontoMetaRight: { alignItems: "flex-end" },
  odontoMetaLabel: { fontSize: 8, color: PDF_COLORS.mutedForeground },
  odontoMetaValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: PDF_COLORS.foreground, marginTop: 1 },
  arch: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center" },
  archDivider: { width: 0.75, height: 24, backgroundColor: PDF_COLORS.border, marginHorizontal: 10 },
  archMidline: { height: 0.75, backgroundColor: PDF_COLORS.border, marginVertical: 8, marginHorizontal: 20 },
  toothCell: { alignItems: "center", width: 22, marginHorizontal: 1.5 },
  toothNumber: { fontSize: 5.5, color: PDF_COLORS.mutedForeground, marginBottom: 2 },
  legendRow: { flexDirection: "row", justifyContent: "center", marginTop: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", marginHorizontal: 9 },
  legendDot: { width: 5.5, height: 5.5, borderRadius: 2.75, marginRight: 4 },
  legendLabel: { fontSize: 7.5, color: PDF_COLORS.mutedForeground },
  compactRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 7, borderBottomWidth: 0.75, borderBottomColor: PDF_COLORS.border },
  compactDot: { width: 5.5, height: 5.5, borderRadius: 2.75, marginTop: 3, marginRight: 7 },
  compactBody: { flex: 1 },
  compactTopLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  compactHeadline: { fontSize: 9, fontFamily: "Helvetica-Bold", color: PDF_COLORS.foreground },
  compactSubLine: { fontSize: 8, color: PDF_COLORS.mutedForeground, marginTop: 1 },
  compactNote: { fontSize: 8.5, color: PDF_COLORS.foreground, marginTop: 2, lineHeight: 1.35 },
  findingsHeading: { marginTop: 14 },
  table: { marginTop: 2 },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: PDF_COLORS.primary,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  tableHeaderCell: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.primaryForeground,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 0.75,
    borderBottomColor: PDF_COLORS.border,
  },
  tableCellDoc: { flex: 2.2, paddingRight: 10 },
  tableCellType: { flex: 1.3 },
  tableCellDate: { flex: 1 },
  tableCellDentist: { flex: 1.5 },
  tableDocLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: PDF_COLORS.foreground },
  tableCellText: { fontSize: 8, color: PDF_COLORS.mutedForeground },
});

function PanelLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.panelLine}>
      <Text style={styles.panelLineLabel}>{label}</Text>
      <Text style={styles.panelLineValue}>{value}</Text>
    </View>
  );
}

function Section({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View wrap={false}>
        <View style={styles.sectionHeadingRow}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={styles.sectionRule} />
        {lead}
      </View>
      {children}
    </View>
  );
}

function AnamnesisBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.anamnesisItem}>
      <View style={styles.anamnesisBlock}>
        <Text style={styles.anamnesisLabel}>{label}</Text>
        <Text style={styles.anamnesisValue}>{value}</Text>
      </View>
    </View>
  );
}

function ToothArch({ fdiList, flipped, odontogram }: { fdiList: number[]; flipped: boolean; odontogram: OdontogramData }) {
  return (
    <>
      {fdiList.map((fdi) => {
        const findings = odontogram[fdi] ?? [];
        const latest = findings[findings.length - 1];
        const color = latest ? FINDING_TYPE_COLOR[latest.type] : PDF_COLORS.toothNeutral;
        const isAusente = findings.some((f) => f.type === "ausente");
        return (
          <View key={fdi} style={styles.toothCell}>
            <Text style={styles.toothNumber}>{fdi}</Text>
            <ToothGlyphPdf kind={getToothKind(fdi)} color={color} flipped={flipped} opacity={isAusente ? 0.45 : 1} width={18} height={24} />
          </View>
        );
      })}
    </>
  );
}

function CompactRow({ color, children }: { color: string; children: ReactNode }) {
  return (
    <View style={styles.compactRow} wrap={false}>
      <View style={[styles.compactDot, { backgroundColor: color }]} />
      <View style={styles.compactBody}>{children}</View>
    </View>
  );
}

function FindingRow({ row }: { row: PdfFindingRow }) {
  return (
    <CompactRow color={FINDING_TYPE_COLOR[row.type]}>
      <View style={styles.compactTopLine}>
        <Text style={styles.compactHeadline}>
          Pieza {row.fdi} · {FINDING_TYPE_LABEL[row.type]}
        </Text>
        <Text style={styles.compactSubLine}>
          {row.dateLabel} · {row.professionalName}
        </Text>
      </View>
      {row.note && <Text style={styles.compactNote}>{row.note}</Text>}
    </CompactRow>
  );
}

function EncounterRow({ encounter }: { encounter: PdfEncounterRow }) {
  return (
    <CompactRow color={PDF_COLORS.primary}>
      <View style={styles.compactTopLine}>
        <Text style={styles.compactHeadline}>
          {encounter.dateLabel} · {encounter.timeLabel}
        </Text>
        <Text style={styles.compactSubLine}>{encounter.professionalName}</Text>
      </View>
      {encounter.reason && <Text style={styles.compactNote}>Motivo: {encounter.reason}</Text>}
      {encounter.diagnosis && <Text style={styles.compactNote}>Diagnóstico: {encounter.diagnosis}</Text>}
      {encounter.treatment && <Text style={styles.compactNote}>Tratamiento: {encounter.treatment}</Text>}
      {encounter.notes && <Text style={styles.compactNote}>Notas: {encounter.notes}</Text>}
      {encounter.indications && <Text style={styles.compactNote}>Indicaciones: {encounter.indications}</Text>}
    </CompactRow>
  );
}

function OdontogramSection({ odontogramData, odontogramUpdatedLabel, findingRows }: {
  odontogramData: OdontogramData;
  odontogramUpdatedLabel: string;
  findingRows: PdfFindingRow[];
}) {
  const [firstFinding, ...restFindings] = findingRows;

  return (
    <Section
      title="Odontograma"
      lead={
        <View style={styles.odontoFrame} wrap={false}>
          <View style={styles.odontoMetaRow}>
            <View>
              <Text style={styles.odontoMetaLabel}>Última actualización</Text>
              <Text style={styles.odontoMetaValue}>{odontogramUpdatedLabel}</Text>
            </View>
            <View style={styles.odontoMetaRight}>
              <Text style={styles.odontoMetaLabel}>Hallazgos registrados</Text>
              <Text style={styles.odontoMetaValue}>{findingRows.length}</Text>
            </View>
          </View>

          <View style={styles.arch}>
            <ToothArch fdiList={UPPER_RIGHT} flipped odontogram={odontogramData} />
            <View style={styles.archDivider} />
            <ToothArch fdiList={UPPER_LEFT} flipped odontogram={odontogramData} />
          </View>
          <View style={styles.archMidline} />
          <View style={styles.arch}>
            <ToothArch fdiList={LOWER_RIGHT} flipped={false} odontogram={odontogramData} />
            <View style={styles.archDivider} />
            <ToothArch fdiList={LOWER_LEFT} flipped={false} odontogram={odontogramData} />
          </View>

          <View style={styles.legendRow}>
            {FINDING_LEGEND.map(({ type, label }) => (
              <View key={type} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: FINDING_TYPE_COLOR[type] }]} />
                <Text style={styles.legendLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      }
    >
      {firstFinding && (
        <View style={styles.findingsHeading} wrap={false}>
          <Text style={styles.subLabel}>Hallazgos ({findingRows.length})</Text>
          <View style={styles.subLabelRule} />
          <FindingRow row={firstFinding} />
        </View>
      )}
      {restFindings.map((row) => (
        <FindingRow key={row.fdi} row={row} />
      ))}
    </Section>
  );
}

function AtencionesSection({ encounters }: { encounters: PdfEncounterRow[] }) {
  const [firstEncounter, ...restEncounters] = encounters;

  if (encounters.length === 0) {
    return (
      <Section
        title="Atenciones"
        lead={<Text style={styles.emptyState}>El paciente todavía no ha tenido atenciones en la clínica.</Text>}
      />
    );
  }

  return (
    <Section title="Atenciones" lead={<EncounterRow encounter={firstEncounter} />}>
      {restEncounters.map((encounter) => (
        <EncounterRow key={encounter.id} encounter={encounter} />
      ))}
    </Section>
  );
}

function DocumentRow({ doc }: { doc: PdfDocumentRow }) {
  return (
    <View style={styles.tableRow} wrap={false}>
      <Text style={[styles.tableCellDoc, styles.tableDocLabel]}>{doc.label}</Text>
      <Text style={[styles.tableCellType, styles.tableCellText]}>{doc.kindLabel}</Text>
      <Text style={[styles.tableCellDate, styles.tableCellText]}>{doc.dateLabel}</Text>
      <Text style={[styles.tableCellDentist, styles.tableCellText]}>{doc.professionalName}</Text>
    </View>
  );
}

function DocumentosSection({ documents }: { documents: PdfDocumentRow[] }) {
  const [firstDoc, ...restDocs] = documents;

  if (documents.length === 0) {
    return <Section title="Documentos" lead={<Text style={styles.emptyState}>Aún no hay documentos clínicos adjuntos.</Text>} />;
  }

  return (
    <Section
      title="Documentos"
      lead={
        <View style={styles.table} wrap={false}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableCellDoc, styles.tableHeaderCell]}>Documento</Text>
            <Text style={[styles.tableCellType, styles.tableHeaderCell]}>Categoría</Text>
            <Text style={[styles.tableCellDate, styles.tableHeaderCell]}>Fecha</Text>
            <Text style={[styles.tableCellDentist, styles.tableHeaderCell]}>Subido por</Text>
          </View>
          <DocumentRow doc={firstDoc} />
        </View>
      }
    >
      {restDocs.map((doc) => (
        <DocumentRow key={doc.id} doc={doc} />
      ))}
    </Section>
  );
}

// "historia-clinica-{nombre-paciente}-{fecha}.pdf" — same convention as
// the reference document's getClinicalRecordPdfFilename.
export function getRealClinicalRecordPdfFilename(patientFullName: string): string {
  const slug = patientFullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const now = new Date();
  const fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `historia-clinica-${slug}-${fecha}.pdf`;
}

export function RealClinicalRecordDocument({
  data,
  clinicName,
  clinicLogoUrl,
}: {
  data: RealClinicalRecordPdfData;
  clinicName: string;
  clinicLogoUrl?: string;
}) {
  const hasAlerts = Boolean(data.allergies || data.medicalConditions || data.currentMedications);

  return (
    <Document title={`Historia clínica — ${data.patientFullName}`} author="Odentia" subject={`Historia clínica de ${data.patientFullName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.topBar} fixed />

        <View style={styles.runningHeader} fixed>
          <Text style={styles.runningHeaderName}>{clinicName}</Text>
          <Text style={styles.runningHeaderRight}>
            {data.patientFullName} · <Text style={styles.runningHeaderAccent}>Historia clínica</Text>
          </Text>
        </View>

        <View wrap={false}>
          <View style={styles.openingBrandRow}>
            <View style={styles.openingBrandLeft}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- this is @react-pdf/renderer's own Image (PDF node, no DOM a11y tree), not an <img>; its type has no alt prop */}
              {clinicLogoUrl && <Image src={clinicLogoUrl} style={styles.openingLogo} />}
              <Text style={styles.openingClinicName}>{clinicName}</Text>
            </View>
            <View style={styles.openingMetaRight}>
              <Text style={styles.openingMetaLabel}>Generado</Text>
              <Text style={styles.openingMetaValue}>{data.generatedAtLabel}</Text>
            </View>
          </View>

          <View style={styles.openingHeavyRule} />

          <Text style={styles.openingKicker}>Historia clínica</Text>
          <Text style={styles.openingPatientName}>{data.patientFullName}</Text>
          <Text style={styles.openingSubtitle}>
            {data.documentId}
            {data.patientAge !== null && ` · ${data.patientAge} años`}
          </Text>

          <View style={styles.panelRow}>
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Contacto</Text>
              <PanelLine label="Teléfono" value={data.phone} />
              <PanelLine label="Correo" value={data.email} />
            </View>
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Clínico</Text>
              <PanelLine label="Odontólogo habitual" value="Aún sin odontólogo" />
              <PanelLine label="Paciente desde" value={data.patientSinceLabel} />
            </View>
          </View>

          {hasAlerts ? (
            <View style={styles.alertHero}>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertHeading}>Alertas clínicas</Text>
                <View style={styles.alertGrid}>
                  {data.allergies && (
                    <View style={styles.alertItem}>
                      <Text style={styles.alertLabel}>Alergias</Text>
                      <Text style={styles.alertValue}>{data.allergies}</Text>
                    </View>
                  )}
                  {data.medicalConditions && (
                    <View style={styles.alertItem}>
                      <Text style={styles.alertLabel}>Condiciones</Text>
                      <Text style={styles.alertValue}>{data.medicalConditions}</Text>
                    </View>
                  )}
                  {data.currentMedications && (
                    <View style={styles.alertItem}>
                      <Text style={styles.alertLabel}>Medicamentos</Text>
                      <Text style={styles.alertValue}>{data.currentMedications}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ) : (
            <Text style={styles.alertEmpty}>Sin alertas clínicas registradas</Text>
          )}
        </View>

        <Section
          title="Antecedentes"
          lead={
            <>
              <Text style={styles.anamnesisMeta}>
                {data.antecedentesUpdatedLabel ? `Actualizado ${data.antecedentesUpdatedLabel}` : "Sin actualizaciones registradas"}
              </Text>
              <View style={styles.anamnesisGrid}>
                {data.anamnesisFields.map((field) => (
                  <AnamnesisBlock key={field.label} label={field.label} value={field.value} />
                ))}
                {data.conditionFields.map((field) => (
                  <AnamnesisBlock key={field.label} label={field.label} value={field.value} />
                ))}
              </View>
            </>
          }
        />

        <OdontogramSection
          odontogramData={data.odontogramData}
          odontogramUpdatedLabel={data.odontogramUpdatedLabel}
          findingRows={data.findingRows}
        />

        <AtencionesSection encounters={data.encounters} />

        <DocumentosSection documents={data.documents} />

        <View style={styles.footer} fixed>
          <Text>
            Generado por <Text style={styles.footerBrand}>odentia.co</Text>
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
