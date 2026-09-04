import { describe, expect, it } from "vitest";
import type { ClinicalNoteRecord } from "../clinical-notes-data";
import type { Patient } from "../data";
import type { TreatmentPlanItem, TreatmentPlanItemStatus } from "../treatment-plan-data";
import { buildRealClinicalRecordPdfData, type ProfessionalDirectory } from "./real-clinical-record-data";

// "PROMPT NINJA — Notas clínicas importantes": the PDF must include active
// notes from the SAME real source the Resumen card reads, and must NEVER
// include archived ones (see the migration's own comment on why archive
// is logical, not physical — the row stays for traceability, but it's
// never part of an exported clinical record's default view, same
// convention as clinical documents).
const PATIENT: Patient = {
  id: "patient-1",
  firstName: "Laura",
  lastName: "Diaz",
  documentId: "111",
  phone: "+573173672033",
  email: null,
  birthDate: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function note(overrides: Partial<ClinicalNoteRecord> & Pick<ClinicalNoteRecord, "id" | "content" | "updatedAt">): ClinicalNoteRecord {
  return {
    patientId: PATIENT.id,
    createdBy: "prof-1",
    updatedBy: null,
    createdAt: overrides.updatedAt,
    archivedAt: null,
    archivedBy: null,
    ...overrides,
  };
}

function treatmentItem(
  overrides: Partial<TreatmentPlanItem> & Pick<TreatmentPlanItem, "id" | "treatmentName" | "status">,
): TreatmentPlanItem {
  return {
    planId: "plan-1",
    patientId: PATIENT.id,
    treatmentId: null,
    notes: null,
    sortOrder: 0,
    createdBy: "prof-1",
    updatedBy: null,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

function buildData(
  clinicalNotes: ClinicalNoteRecord[],
  professionals: ProfessionalDirectory = new Map(),
  treatmentPlanItems: TreatmentPlanItem[] = [],
) {
  return buildRealClinicalRecordPdfData({
    patient: PATIENT,
    medicalHistory: null,
    toothFindings: [],
    clinicalEncounters: [],
    clinicalDocuments: [],
    treatmentPlanItems,
    clinicalNotes,
    professionals,
  });
}

describe("buildRealClinicalRecordPdfData — Notas clínicas importantes", () => {
  it("is empty when there are no notes at all", () => {
    expect(buildData([]).clinicalNotes).toEqual([]);
  });

  it("includes an active note, preserving the order it was given in", () => {
    const notes = [
      note({ id: "n1", content: "Nota más reciente", updatedAt: "2026-09-03T10:00:00.000Z" }),
      note({ id: "n2", content: "Nota más antigua", updatedAt: "2026-09-02T09:00:00.000Z" }),
    ];
    const result = buildData(notes).clinicalNotes;
    expect(result.map((r) => r.id)).toEqual(["n1", "n2"]);
    expect(result[0]?.content).toBe("Nota más reciente");
  });

  it("excludes archived notes entirely — never part of the exported record", () => {
    const notes = [
      note({ id: "n1", content: "Activa", updatedAt: "2026-09-03T10:00:00.000Z" }),
      note({ id: "n2", content: "Archivada", updatedAt: "2026-09-01T10:00:00.000Z", archivedAt: "2026-09-02T10:00:00.000Z", archivedBy: "prof-1" }),
    ];
    const result = buildData(notes).clinicalNotes;
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("n1");
    expect(result.some((r) => r.content === "Archivada")).toBe(false);
  });

  it("resolves the professional who last touched the note (updatedBy over createdBy)", () => {
    const notes = [note({ id: "n1", content: "Editada", updatedAt: "2026-09-03T10:00:00.000Z", createdBy: "prof-author", updatedBy: "prof-editor" })];
    const professionals: ProfessionalDirectory = new Map([
      ["prof-author", { name: "Dra. Autora", specialtyName: null }],
      ["prof-editor", { name: "Dr. Editor", specialtyName: null }],
    ]);
    const result = buildData(notes, professionals).clinicalNotes;
    expect(result[0]?.professionalName).toBe("Dr. Editor");
  });

  it("falls back to createdBy when the note was never edited", () => {
    const notes = [note({ id: "n1", content: "Sin editar", updatedAt: "2026-09-03T10:00:00.000Z", createdBy: "prof-author", updatedBy: null })];
    const professionals: ProfessionalDirectory = new Map([["prof-author", { name: "Dra. Autora", specialtyName: null }]]);
    const result = buildData(notes, professionals).clinicalNotes;
    expect(result[0]?.professionalName).toBe("Dra. Autora");
  });

  it('falls back to "Sin asignar" when the author cannot be resolved', () => {
    const notes = [note({ id: "n1", content: "Sin resolver", updatedAt: "2026-09-03T10:00:00.000Z", createdBy: "prof-unknown" })];
    const result = buildData(notes, new Map()).clinicalNotes;
    expect(result[0]?.professionalName).toBe("Sin asignar");
  });
});

// "PROMPT NINJA — Plan de Tratamiento": the PDF's "Plan de tratamiento"
// section must show ONLY explicit plan items with status planned/
// in_progress — never inferred from encounters/procedures, and never
// confused with "Procedimientos realizados" (a completely separate
// section, driven by ClinicalEncounterRecord, untouched by this feature).
describe("buildRealClinicalRecordPdfData — Plan de tratamiento", () => {
  it("is empty when there are no items at all", () => {
    expect(buildData([], new Map(), []).activeTreatmentPlanItems).toEqual([]);
  });

  it.each<TreatmentPlanItemStatus>(["planned", "in_progress"])("includes a %s item as active", (status) => {
    const items = [treatmentItem({ id: "t1", treatmentName: "Limpieza dental", status })];
    const result = buildData([], new Map(), items).activeTreatmentPlanItems;
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("t1");
  });

  it.each<TreatmentPlanItemStatus>(["completed", "cancelled"])("excludes a %s item — it exists but is never active", (status) => {
    const items = [treatmentItem({ id: "t1", treatmentName: "Extracción", status })];
    const result = buildData([], new Map(), items).activeTreatmentPlanItems;
    expect(result).toEqual([]);
  });

  it("preserves sort_order and carries the item's own notes/date", () => {
    const items = [
      treatmentItem({ id: "t1", treatmentName: "Primero", status: "planned", sortOrder: 0, notes: "Nota breve", createdAt: "2026-09-01T09:00:00.000Z" }),
      treatmentItem({ id: "t2", treatmentName: "Segundo", status: "in_progress", sortOrder: 1 }),
    ];
    const result = buildData([], new Map(), items).activeTreatmentPlanItems;
    expect(result.map((r) => r.id)).toEqual(["t1", "t2"]);
    expect(result[0]?.notes).toBe("Nota breve");
    expect(result[0]?.statusLabel).toBe("Planeado");
    expect(result[1]?.statusLabel).toBe("En progreso");
  });

  it("never mixes in a completed/cancelled item alongside active ones", () => {
    const items = [
      treatmentItem({ id: "t1", treatmentName: "Activo", status: "planned" }),
      treatmentItem({ id: "t2", treatmentName: "Ya hecho", status: "completed" }),
    ];
    const result = buildData([], new Map(), items).activeTreatmentPlanItems;
    expect(result.map((r) => r.treatmentName)).toEqual(["Activo"]);
  });
});
