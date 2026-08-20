import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { DENTISTS, STATUS_LABELS, type Dentist } from "@/features/dashboard/mock-data";
import {
  getToothKind,
  LOWER_LEFT,
  LOWER_RIGHT,
  UPPER_LEFT,
  UPPER_RIGHT,
  type FindingType,
} from "@/features/dashboard/odontogram-teeth";
import { FINDING_LEGEND, formatUpdatedNowLabel, getOdontogramFindingRows, labelForType } from "../clinical-record-screen";
import { CLINICAL_DOCUMENT_KIND_LABELS, type Patient } from "../mock-data";
import { PDF_COLORS, PDF_STATUS_COLORS } from "./pdf-theme";
import { ToothGlyphPdf } from "./tooth-glyph-pdf";

// Same finding-type → color mapping as the on-screen odontogram (see
// FINDING_TEXT_CLASS in odontogram-teeth.tsx), re-expressed as flat PDF
// colors instead of Tailwind text-color classes.
const FINDING_TYPE_COLOR: Record<FindingType, string> = {
  caries: PDF_COLORS.danger,
  restauracion: PDF_COLORS.info,
  ausente: PDF_COLORS.mutedForeground,
  otro: PDF_COLORS.warning,
};

const MARGIN_X = 42;

// This design's reference is a dense, structured business document (a
// solar-quote PDF — see the task's own reference file), not a printed
// letter: full-sans typography (no serif — dropped from the previous
// iteration), a solid-color header band on tables, small-caps labels with
// short colored accent rules, and flat tinted panels instead of bordered
// cards. Only Helvetica/Helvetica-Bold are used — both are PDF's built-in
// standard fonts, no Font.register/network fetch needed.
const styles = StyleSheet.create({
  page: {
    // paddingTop lives on the Page itself (not a wrapping content View) so
    // it's reapplied on every page this Document wraps into, clearing the
    // fixed header consistently — a padding-top on a child View that
    // itself wraps across pages only takes effect on that child's first
    // fragment (page 1), leaving page 2+'s continuation flush against the
    // header with nothing reserving room for it.
    paddingTop: 42,
    paddingBottom: 50,
    paddingHorizontal: MARGIN_X,
    fontSize: 9,
    lineHeight: 1.35,
    color: PDF_COLORS.foreground,
    fontFamily: "Helvetica",
  },

  // Full-bleed brand bar at the very top of every page — position:absolute
  // with top/left/right:0 lands at the page's true outer edge in
  // react-pdf (padding does not shift an absolutely-positioned child's
  // reference frame here — verified by rendering), so no negative-margin
  // trick is needed to escape the page's own padding.
  topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 3.5, backgroundColor: PDF_COLORS.primary },

  // Compact running header — every page, including the first (see the
  // opening below, which only occupies normal page-1 flow and therefore
  // never repeats). Deliberately quiet: small, one line, so it never
  // competes with the opening on page 1.
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
  runningHeaderRight: { textTransform: "uppercase", letterSpacing: 0.5 },
  runningHeaderAccent: { color: PDF_COLORS.primary, fontFamily: "Helvetica-Bold" },

  // `bottom`-positioned fixed views silently fail to paint in this
  // react-pdf version (empirically confirmed: identical box, only the
  // bottom/top offset differs) — `top` is used instead, anchored from the
  // page's fixed A4 height (841.89pt) minus the desired 22pt bottom gap and
  // this box's own content height (~17pt: 6 padding + 0.75 border + one
  // 7.5pt line).
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
  // "odentia.co" only — not the whole "Generado por" phrase — so the brand
  // mention stays a quiet color accent, not a colored (and so louder)
  // sentence.
  footerBrand: { color: PDF_COLORS.primary, fontFamily: "Helvetica-Bold" },

  // Page-1 opening — brand row + thick rule, then kicker/title/subtitle,
  // then the ficha clínica panels and Alertas clínicas. Normal flow, so it
  // only ever renders once.
  openingBrandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  openingBrandLeft: { flexDirection: "row", alignItems: "center" },
  // A wide, generous box (not square) so a typical horizontal clinic
  // lockup — the common case — scales up to something actually legible
  // instead of shrinking to fit a tight square; objectFit:"contain" still
  // scales square/vertical logos down to fit within it too, centered,
  // never stretched/cropped, regardless of the source asset's own shape.
  openingLogo: { width: 100, height: 30, marginRight: 10, objectFit: "contain" },
  openingClinicName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: PDF_COLORS.primary },
  openingMetaRight: { alignItems: "flex-end" },
  openingMetaLabel: {
    fontSize: 7,
    color: PDF_COLORS.labelForeground,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
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
  // marginTop generous on purpose — a large bold Text's rendered box
  // consistently needs more top clearance below it than its nominal
  // fontSize would suggest (verified by rendering, same issue hit on the
  // page title in the previous iteration).
  openingSubtitle: { fontSize: 9.5, color: PDF_COLORS.mutedForeground, marginTop: 16, marginBottom: 18 },

  // Ficha clínica — two flat tinted panels side by side, no border/shadow;
  // same "quiet gray card" language as every structured panel below.
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
  panelLine: { flexDirection: "row", marginTop: 4 },
  panelLineLabel: { fontSize: 8, color: PDF_COLORS.mutedForeground, width: 56 },
  panelLineValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: PDF_COLORS.foreground, flex: 1 },

  // Alertas clínicas — a highlighted panel (pale red tint + thick left
  // border), the same "hero panel" language used for the odontograma
  // frame below, just in clinical red instead of brand teal.
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

  // Section title system — small filled dot + bold title + full-width
  // hairline, matching the reference's own section-heading pattern.
  section: { marginTop: 22 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  sectionDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: PDF_COLORS.primary, marginRight: 7 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: PDF_COLORS.foreground },
  sectionRule: { height: 0.75, backgroundColor: PDF_COLORS.border, marginBottom: 12 },
  emptyState: { fontSize: 8.5, color: PDF_COLORS.mutedForeground },

  // Subsection label — bold colored small caps with a short accent rule
  // directly beneath it (matches the width of its own column, not the
  // page), used above the Antecedentes grid and the Hallazgos list.
  subLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  subLabelRule: { height: 1.5, backgroundColor: PDF_COLORS.primary, marginBottom: 10, opacity: 0.35 },

  // Antecedentes — a real 2-column grid of subtle tinted blocks (never a
  // bordered "web card", never a single run of prose).
  anamnesisMeta: { fontSize: 8, color: PDF_COLORS.mutedForeground, marginBottom: 10 },
  anamnesisGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  anamnesisItem: { width: "50%", paddingHorizontal: 5, marginBottom: 10 },
  // No flex:1 here — this is the sole child of anamnesisItem (which has no
  // explicit height, hugging its own content). flex:1 on a hug-content
  // parent's only child made yoga under-report the box's true height (just
  // the label line) to the grid's row-wrapping math, so the next row
  // started before this block's value text had actually finished — real
  // overlap, verified by rendering. Plain content-hugging sizing (no flex)
  // reports its true height and fixes it.
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

  // Odontograma — the protagonist frame: pale teal tint + thick left
  // border, same hero-panel language as Alertas clínicas (in brand teal
  // instead of red). Real metadata fills both top corners instead of
  // leaving the frame's width empty around a narrow chart.
  odontoFrame: {
    backgroundColor: PDF_COLORS.primaryTint,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.primary,
    borderRadius: 4,
    padding: 11,
  },
  odontoMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  odontoMetaRight: { alignItems: "flex-end" },
  // Own (unconstrained-width) label/value pair — panelLineLabel's width:56
  // is sized for the ficha clínica's row layout (label beside value); here
  // the two stack instead, and that fixed width forced needless wrapping
  // ("Última actual-\nización") on this section's longer labels.
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

  // Hallazgos / Atenciones — compact structured rows (not a spaced-out
  // timeline): a small static color dot inline with the date, a hairline
  // divider between entries, tight vertical rhythm so several fit per page.
  compactRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 7, borderBottomWidth: 0.75, borderBottomColor: PDF_COLORS.border },
  compactDot: { width: 5.5, height: 5.5, borderRadius: 2.75, marginTop: 3, marginRight: 7 },
  compactBody: { flex: 1 },
  compactTopLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  compactHeadline: { fontSize: 9, fontFamily: "Helvetica-Bold", color: PDF_COLORS.foreground },
  compactTag: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  compactSubLine: { fontSize: 8, color: PDF_COLORS.mutedForeground, marginTop: 1 },
  compactNote: { fontSize: 8.5, color: PDF_COLORS.foreground, marginTop: 2, lineHeight: 1.35 },

  findingsHeading: { marginTop: 14 },

  // Notas clínicas relevantes — same flat tinted block language as
  // Antecedentes, full width.
  notesBlock: { backgroundColor: PDF_COLORS.surface, borderRadius: 5, padding: 12 },
  notesValue: { fontSize: 9.5, color: PDF_COLORS.foreground, lineHeight: 1.45 },

  // Documentos — a real table: solid header band, aligned columns,
  // hairlines between rows — the same structured-data treatment the
  // reference uses for its own itemized breakdown.
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
    // flex-start, not center: a long Documento name can wrap to 2 lines
    // (see tableCellDoc below), and centering would float the other,
    // single-line cells into the middle of that taller row — right beside
    // the wrapped second line, reading as an overlap. Top-aligning keeps
    // every cell level with the first line regardless of row height.
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

// `lead` is whatever must never be separated from the title by a page
// break — typically the section's first row/paragraph. minPresenceAhead
// alone (the documented orphan-protection prop) didn't reliably keep a
// bare title off the bottom of a page in practice here, so this instead
// uses the one page-break mechanic that verifiably works throughout this
// document (wrap={false} on the row-level Views below): grouping title+lead
// into a single non-wrapping block, which is pushed to the next page as a
// unit whenever it doesn't fully fit. `children` (the rest of the section)
// flows normally after that guaranteed-together block.
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

function ToothArch({
  fdiList,
  flipped,
  odontogram,
}: {
  fdiList: number[];
  flipped: boolean;
  odontogram: Patient["odontogramData"];
}) {
  return (
    <>
      {fdiList.map((fdi) => {
        const findings = odontogram?.[fdi] ?? [];
        const latest = findings[findings.length - 1];
        const color = latest ? FINDING_TYPE_COLOR[latest.type] : PDF_COLORS.toothNeutral;
        const isAusente = findings.some((f) => f.type === "ausente");
        return (
          <View key={fdi} style={styles.toothCell}>
            <Text style={styles.toothNumber}>{fdi}</Text>
            <ToothGlyphPdf
              kind={getToothKind(fdi)}
              color={color}
              flipped={flipped}
              opacity={isAusente ? 0.45 : 1}
              width={18}
              height={24}
            />
          </View>
        );
      })}
    </>
  );
}

// Compact row shell shared by Atenciones and Hallazgos — a small static
// color dot, a hairline divider, tight padding, no connecting timeline
// line (see task scope: avoid the previous spaced-out timeline so several
// records fit per page).
function CompactRow({ color, children }: { color: string; children: ReactNode }) {
  return (
    <View style={styles.compactRow} wrap={false}>
      <View style={[styles.compactDot, { backgroundColor: color }]} />
      <View style={styles.compactBody}>{children}</View>
    </View>
  );
}

function FindingRow({ row }: { row: ReturnType<typeof getOdontogramFindingRows>[number] }) {
  return (
    <CompactRow color={FINDING_TYPE_COLOR[row.type]}>
      <View style={styles.compactTopLine}>
        <Text style={styles.compactHeadline}>
          Pieza {row.fdi} · {labelForType(row.type)}
        </Text>
        <Text style={styles.compactSubLine}>
          {row.dateLabel} · {row.dentistName}
        </Text>
      </View>
      {row.note && <Text style={styles.compactNote}>{row.note}</Text>}
    </CompactRow>
  );
}

function EncounterRow({
  encounter,
  resolveDentist,
}: {
  encounter: NonNullable<Patient["clinicalEncounters"]>[number];
  resolveDentist: (id: string | undefined) => Dentist | undefined;
}) {
  const dentist = resolveDentist(encounter.dentistId);
  const statusColor = PDF_STATUS_COLORS[encounter.status];
  return (
    <CompactRow color={statusColor}>
      <View style={styles.compactTopLine}>
        <Text style={styles.compactHeadline}>
          {encounter.dateLabel} · {encounter.timeLabel}
        </Text>
        <Text style={[styles.compactTag, { color: statusColor }]}>{STATUS_LABELS[encounter.status].toUpperCase()}</Text>
      </View>
      <Text style={styles.compactSubLine}>
        {encounter.treatment} · {dentist?.name ?? "Sin asignar"}
      </Text>
      {encounter.findings && <Text style={styles.compactNote}>{encounter.findings}</Text>}
    </CompactRow>
  );
}

function OdontogramSection({
  patient,
  resolveDentist,
}: {
  patient: Patient;
  resolveDentist: (id: string | undefined) => Dentist | undefined;
}) {
  const odontogram = patient.odontogramData;
  const findingRows = getOdontogramFindingRows(patient, resolveDentist);
  const [firstFinding, ...restFindings] = findingRows;

  return (
    // The odontoFrame is this section's true "lead" (must never separate
    // from the "Odontograma" title). "Hallazgos" is deliberately its OWN
    // smaller wrap={false} unit passed as a regular child, not bundled
    // into the same lead — bundling it in made one giant all-or-nothing
    // block that, whenever it didn't fully fit, pushed the frame itself to
    // the next page too and left a large empty gap behind it (verified by
    // rendering). Kept separate, only the piece that doesn't fit moves.
    <Section
      title="Odontograma"
      lead={
        <View style={styles.odontoFrame} wrap={false}>
          <View style={styles.odontoMetaRow}>
            <View>
              <Text style={styles.odontoMetaLabel}>Última actualización</Text>
              <Text style={styles.odontoMetaValue}>{patient.odontogramUpdatedLabel ?? "Sin registrar"}</Text>
            </View>
            <View style={styles.odontoMetaRight}>
              <Text style={styles.odontoMetaLabel}>Hallazgos registrados</Text>
              <Text style={styles.odontoMetaValue}>{findingRows.length}</Text>
            </View>
          </View>

          <View style={styles.arch}>
            <ToothArch fdiList={UPPER_RIGHT} flipped odontogram={odontogram} />
            <View style={styles.archDivider} />
            <ToothArch fdiList={UPPER_LEFT} flipped odontogram={odontogram} />
          </View>
          <View style={styles.archMidline} />
          <View style={styles.arch}>
            <ToothArch fdiList={LOWER_RIGHT} flipped={false} odontogram={odontogram} />
            <View style={styles.archDivider} />
            <ToothArch fdiList={LOWER_LEFT} flipped={false} odontogram={odontogram} />
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

function AtencionesSection({
  patient,
  resolveDentist,
}: {
  patient: Patient;
  resolveDentist: (id: string | undefined) => Dentist | undefined;
}) {
  // Same pre-sorted-newest-first invariant AtencionesTab already relies on
  // (see clinical-record-screen.tsx's own comment on clinicalEncounters in
  // mock-data.ts) — reused as-is, not re-sorted here.
  const encounters = patient.clinicalEncounters ?? [];
  const [firstEncounter, ...restEncounters] = encounters;

  if (encounters.length === 0) {
    return (
      <Section
        title="Atenciones"
        lead={<Text style={styles.emptyState}>Aún no hay atenciones clínicas registradas.</Text>}
      />
    );
  }

  return (
    <Section
      title="Atenciones"
      lead={<EncounterRow encounter={firstEncounter} resolveDentist={resolveDentist} />}
    >
      {restEncounters.map((encounter) => (
        <EncounterRow key={encounter.id} encounter={encounter} resolveDentist={resolveDentist} />
      ))}
    </Section>
  );
}

function DocumentRow({
  doc,
  resolveDentist,
}: {
  doc: NonNullable<Patient["clinicalDocuments"]>[number];
  resolveDentist: (id: string | undefined) => Dentist | undefined;
}) {
  const dentist = resolveDentist(doc.dentistId);
  return (
    <View style={styles.tableRow} wrap={false}>
      <Text style={[styles.tableCellDoc, styles.tableDocLabel]}>{doc.label}</Text>
      <Text style={[styles.tableCellType, styles.tableCellText]}>{CLINICAL_DOCUMENT_KIND_LABELS[doc.kind]}</Text>
      <Text style={[styles.tableCellDate, styles.tableCellText]}>{doc.dateLabel}</Text>
      <Text style={[styles.tableCellDentist, styles.tableCellText]}>{dentist?.name ?? "Sin asignar"}</Text>
    </View>
  );
}

function DocumentosSection({
  patient,
  resolveDentist,
}: {
  patient: Patient;
  resolveDentist: (id: string | undefined) => Dentist | undefined;
}) {
  const documents = patient.clinicalDocuments ?? [];
  const [firstDoc, ...restDocs] = documents;

  if (documents.length === 0) {
    return (
      <Section title="Documentos" lead={<Text style={styles.emptyState}>Aún no hay documentos registrados.</Text>} />
    );
  }

  return (
    <Section
      title="Documentos"
      lead={
        <View style={styles.table} wrap={false}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableCellDoc, styles.tableHeaderCell]}>Documento</Text>
            <Text style={[styles.tableCellType, styles.tableHeaderCell]}>Tipo</Text>
            <Text style={[styles.tableCellDate, styles.tableHeaderCell]}>Fecha</Text>
            <Text style={[styles.tableCellDentist, styles.tableHeaderCell]}>Profesional</Text>
          </View>
          <DocumentRow doc={firstDoc} resolveDentist={resolveDentist} />
        </View>
      }
    >
      {restDocs.map((doc) => (
        <DocumentRow key={doc.id} doc={doc} resolveDentist={resolveDentist} />
      ))}
    </Section>
  );
}

// "historia-clinica-{nombre-paciente}-{fecha}.pdf" per task scope — fecha
// is today's date (generation date), not any clinical date on the record.
export function getClinicalRecordPdfFilename(patient: Patient): string {
  const slug = patient.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents (e.g. Martínez -> Martinez)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const now = new Date();
  const fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `historia-clinica-${slug}-${fecha}.pdf`;
}

export function ClinicalRecordDocument({
  patient,
  clinicName,
  clinicLogoUrl,
  // This document renders in an isolated tree outside RoleProvider (see
  // clinical-record-screen.tsx's handleDownloadPdf, which computes the
  // real one via useEffectiveDentists() and passes it in) — defaults to a
  // plain DENTISTS lookup so nothing else calling this needs to change.
  resolveDentist = (id) => DENTISTS.find((d) => d.id === id),
}: {
  patient: Patient;
  clinicName: string;
  clinicLogoUrl?: string;
  resolveDentist?: (id: string | undefined) => Dentist | undefined;
}) {
  const usualDentist = resolveDentist(patient.usualDentistId);
  const anamnesis = patient.anamnesis;
  const updatedByDentist = anamnesis ? resolveDentist(anamnesis.updatedByDentistId) : undefined;
  const hasAlerts = Boolean(
    patient.allergies || (patient.conditions && patient.conditions.length > 0) || (patient.medications && patient.medications.length > 0),
  );
  const generatedAtLabel = formatUpdatedNowLabel();

  return (
    <Document
      title={`Historia clínica — ${patient.name}`}
      author="Odentia"
      subject={`Historia clínica de ${patient.name}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.topBar} fixed />

        {/* Running header — quiet utility line on every page (see the
            opening below for what's unique to page 1). */}
        <View style={styles.runningHeader} fixed>
          <Text style={styles.runningHeaderName}>{clinicName}</Text>
          <Text style={styles.runningHeaderRight}>
            {patient.name} · <Text style={styles.runningHeaderAccent}>Historia clínica</Text>
          </Text>
        </View>

        {/* Page-1 opening — normal flow, so it only ever appears once. */}
        <View wrap={false}>
          <View style={styles.openingBrandRow}>
            <View style={styles.openingBrandLeft}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- this is @react-pdf/renderer's own Image (PDF node, no DOM a11y tree), not an <img>; its type has no alt prop */}
              {clinicLogoUrl && <Image src={clinicLogoUrl} style={styles.openingLogo} />}
              <Text style={styles.openingClinicName}>{clinicName}</Text>
            </View>
            <View style={styles.openingMetaRight}>
              <Text style={styles.openingMetaLabel}>Generado</Text>
              <Text style={styles.openingMetaValue}>{generatedAtLabel}</Text>
            </View>
          </View>

          <View style={styles.openingHeavyRule} />

          <Text style={styles.openingKicker}>Historia clínica</Text>
          <Text style={styles.openingPatientName}>{patient.name}</Text>
          <Text style={styles.openingSubtitle}>
            {patient.documentId} · {patient.age} años
          </Text>

          <View style={styles.panelRow}>
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Contacto</Text>
              <PanelLine label="Teléfono" value={patient.phone} />
              <PanelLine label="Correo" value={patient.email || "Sin registrar"} />
            </View>
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Clínico</Text>
              <PanelLine
                label="Odontólogo"
                value={usualDentist ? `${usualDentist.name} · ${usualDentist.specialty}` : "Sin asignar"}
              />
              <PanelLine label="Paciente desde" value={patient.patientSinceLabel} />
            </View>
          </View>

          {hasAlerts ? (
            <View style={styles.alertHero}>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertHeading}>Alertas clínicas</Text>
                <View style={styles.alertGrid}>
                  {patient.allergies && (
                    <View style={styles.alertItem}>
                      <Text style={styles.alertLabel}>Alergias</Text>
                      <Text style={styles.alertValue}>{patient.allergies}</Text>
                    </View>
                  )}
                  {patient.conditions && patient.conditions.length > 0 && (
                    <View style={styles.alertItem}>
                      <Text style={styles.alertLabel}>Condiciones</Text>
                      <Text style={styles.alertValue}>{patient.conditions.join(", ")}</Text>
                    </View>
                  )}
                  {patient.medications && patient.medications.length > 0 && (
                    <View style={styles.alertItem}>
                      <Text style={styles.alertLabel}>Medicamentos</Text>
                      <Text style={styles.alertValue}>{patient.medications.join(", ")}</Text>
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
              {anamnesis ? (
                <Text style={styles.anamnesisMeta}>
                  Actualizado {anamnesis.updatedLabel}
                  {updatedByDentist && ` · ${updatedByDentist.name} · ${updatedByDentist.specialty}`}
                </Text>
              ) : (
                <Text style={styles.anamnesisMeta}>Sin actualizaciones registradas</Text>
              )}
              <View style={styles.anamnesisGrid}>
                <AnamnesisBlock label="Antecedentes personales" value={anamnesis?.personalHistory ?? "Sin registrar"} />
                <AnamnesisBlock label="Antecedentes familiares" value={anamnesis?.familyHistory ?? "Sin registrar"} />
                <AnamnesisBlock label="Hábitos" value={anamnesis?.habits ?? "Sin registrar"} />
                <AnamnesisBlock
                  label="Cirugías / hospitalizaciones"
                  value={anamnesis?.surgicalHistory ?? "Sin registrar"}
                />
                {anamnesis?.pregnancy && <AnamnesisBlock label="Embarazo" value={anamnesis.pregnancy} />}
                <AnamnesisBlock
                  label="Otros antecedentes relevantes"
                  value={anamnesis?.otherRelevant ?? "Sin registrar"}
                />
              </View>
            </>
          }
        />

        <OdontogramSection patient={patient} resolveDentist={resolveDentist} />

        <AtencionesSection patient={patient} resolveDentist={resolveDentist} />

        <Section
          title="Notas clínicas relevantes"
          lead={
            patient.clinicalNotes ? (
              <View style={styles.notesBlock}>
                <Text style={styles.notesValue}>{patient.clinicalNotes}</Text>
              </View>
            ) : (
              <Text style={styles.emptyState}>Sin notas registradas</Text>
            )
          }
        />

        <DocumentosSection patient={patient} resolveDentist={resolveDentist} />

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
