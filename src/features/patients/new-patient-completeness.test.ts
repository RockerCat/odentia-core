import { describe, expect, it } from "vitest";
import {
  COLOMBIA_CODE,
  getMissingNewPatientFields,
  isNewPatientComplete,
  NEW_PATIENT_MISSING_FIELD_LABELS,
  requiresMunicipalityAndZone,
  type NewPatientCompletenessInput,
} from "./new-patient-completeness";

// Regression coverage for "Nuevo paciente" naciendo RIPS-ready — pins the
// exact gate new-patient-modal.tsx's own canCreate AND its "Falta
// completar…" footer message both derive from, mirroring this codebase's
// own encounter-finalize-readiness.test.ts conventions. getMissingNewPatientFields
// is the single source of truth: isNewPatientComplete is only ever
// `getMissingNewPatientFields(input).length === 0`, so button and message
// can never disagree — see the "single source of truth" describe block
// below, which pins that relationship directly.

function base(overrides: Partial<NewPatientCompletenessInput> = {}): NewPatientCompletenessInput {
  return {
    firstName: "Ana",
    lastName: "Gómez",
    documentType: "CC",
    documentNumber: "123456",
    phone: "3000000000",
    birthDate: "1990-01-01",
    sexCode: "F",
    userTypeCode: "05",
    countryOfResidenceCode: COLOMBIA_CODE,
    municipalityOfResidenceCode: "11001",
    residenceZoneCode: "01",
    countryOfOriginCode: COLOMBIA_CODE,
    ...overrides,
  };
}

describe("requiresMunicipalityAndZone", () => {
  it("is true for Colombia (170)", () => {
    expect(requiresMunicipalityAndZone("170")).toBe(true);
  });

  it("is false for any other country", () => {
    expect(requiresMunicipalityAndZone("840")).toBe(false);
  });

  it("is false when no country is selected yet", () => {
    expect(requiresMunicipalityAndZone("")).toBe(false);
  });
});

describe("isNewPatientComplete", () => {
  it("is complete when every field is filled and País is Colombia with municipio/zona", () => {
    expect(isNewPatientComplete(base())).toBe(true);
  });

  it("requires fecha de nacimiento", () => {
    expect(isNewPatientComplete(base({ birthDate: "" }))).toBe(false);
  });

  it("requires sexo", () => {
    expect(isNewPatientComplete(base({ sexCode: "" }))).toBe(false);
  });

  it("requires tipo de usuario RIPS", () => {
    expect(isNewPatientComplete(base({ userTypeCode: "" }))).toBe(false);
  });

  it("requires país de residencia", () => {
    expect(isNewPatientComplete(base({ countryOfResidenceCode: "" }))).toBe(false);
  });

  it("requires municipio when país is Colombia", () => {
    expect(isNewPatientComplete(base({ municipalityOfResidenceCode: "" }))).toBe(false);
  });

  it("requires zona territorial when país is Colombia", () => {
    expect(isNewPatientComplete(base({ residenceZoneCode: "" }))).toBe(false);
  });

  it("never requires municipio/zona when país is NOT Colombia", () => {
    expect(
      isNewPatientComplete(
        base({ countryOfResidenceCode: "840", municipalityOfResidenceCode: "", residenceZoneCode: "" }),
      ),
    ).toBe(true);
  });

  it("does not regress existing requirements: nombres/apellidos/tipo doc/número doc/teléfono", () => {
    expect(isNewPatientComplete(base({ firstName: "" }))).toBe(false);
    expect(isNewPatientComplete(base({ lastName: "" }))).toBe(false);
    expect(isNewPatientComplete(base({ documentType: "" }))).toBe(false);
    expect(isNewPatientComplete(base({ documentNumber: "" }))).toBe(false);
    expect(isNewPatientComplete(base({ phone: "" }))).toBe(false);
  });

  it("whitespace-only text fields count as empty (trimmed), never satisfy the gate", () => {
    expect(isNewPatientComplete(base({ firstName: "   " }))).toBe(false);
    expect(isNewPatientComplete(base({ phone: "   " }))).toBe(false);
  });
});

describe("getMissingNewPatientFields", () => {
  it("returns every base-required field for a fully empty form", () => {
    const empty: NewPatientCompletenessInput = {
      firstName: "",
      lastName: "",
      documentType: "",
      documentNumber: "",
      phone: "",
      birthDate: "",
      sexCode: "",
      userTypeCode: "",
      countryOfResidenceCode: "",
      municipalityOfResidenceCode: "",
      residenceZoneCode: "",
      countryOfOriginCode: "",
    };
    expect(getMissingNewPatientFields(empty)).toEqual([
      "firstName",
      "lastName",
      "documentType",
      "documentNumber",
      "birthDate",
      "sexCode",
      "phone",
      "userTypeCode",
      "countryOfResidenceCode",
      "countryOfOriginCode",
    ]);
  });

  it("never includes email/correo — it stays optional", () => {
    const empty: NewPatientCompletenessInput = {
      firstName: "",
      lastName: "",
      documentType: "",
      documentNumber: "",
      phone: "",
      birthDate: "",
      sexCode: "",
      userTypeCode: "",
      countryOfResidenceCode: "",
      municipalityOfResidenceCode: "",
      residenceZoneCode: "",
      countryOfOriginCode: "",
    };
    // NewPatientCompletenessInput structurally has no email/correo field
    // at all — nothing here could accidentally report it as missing.
    expect(getMissingNewPatientFields(empty)).not.toContain("email");
  });

  it("adds municipio/zona to the missing list when país is Colombia and they're empty", () => {
    const missing = getMissingNewPatientFields(
      base({ municipalityOfResidenceCode: "", residenceZoneCode: "" }),
    );
    expect(missing).toEqual(["municipalityOfResidenceCode", "residenceZoneCode"]);
  });

  it("never adds municipio/zona to the missing list when país is NOT Colombia, even if empty", () => {
    const missing = getMissingNewPatientFields(
      base({ countryOfResidenceCode: "840", municipalityOfResidenceCode: "", residenceZoneCode: "" }),
    );
    expect(missing).toEqual([]);
  });

  it("país de origen is required on its own — a filled País de residencia (Colombia) never satisfies it", () => {
    expect(getMissingNewPatientFields(base({ countryOfOriginCode: "" }))).toEqual(["countryOfOriginCode"]);
    expect(getMissingNewPatientFields(base({ countryOfResidenceCode: COLOMBIA_CODE, countryOfOriginCode: "" }))).toContain("countryOfOriginCode");
    // A foreign origin with Colombian residence is a perfectly valid, distinct combination.
    expect(getMissingNewPatientFields(base({ countryOfOriginCode: "862" }))).toEqual([]);
  });

  it("returns an empty list for a fully complete form", () => {
    expect(getMissingNewPatientFields(base())).toEqual([]);
  });

  it("whitespace-only fields still count as missing", () => {
    expect(getMissingNewPatientFields(base({ firstName: "   " }))).toEqual(["firstName"]);
    expect(getMissingNewPatientFields(base({ phone: "  " }))).toEqual(["phone"]);
  });

  it("every field id has a stable, human (non-camelCase) label", () => {
    const empty: NewPatientCompletenessInput = {
      firstName: "",
      lastName: "",
      documentType: "",
      documentNumber: "",
      phone: "",
      birthDate: "",
      sexCode: "",
      userTypeCode: "",
      countryOfResidenceCode: "",
      municipalityOfResidenceCode: "",
      residenceZoneCode: "",
      countryOfOriginCode: "",
    };
    for (const field of getMissingNewPatientFields(empty)) {
      const label = NEW_PATIENT_MISSING_FIELD_LABELS[field];
      expect(label).toBeTruthy();
      expect(label).not.toBe(field);
      expect(label).not.toMatch(/Code$/);
    }
  });
});

// "El botón y el mensaje comparten una sola lógica de completitud" — this
// is the actual invariant, pinned directly rather than trusting the two
// call sites to stay in sync by convention.
describe("single source of truth: isNewPatientComplete vs. getMissingNewPatientFields", () => {
  it("isNewPatientComplete is true exactly when getMissingNewPatientFields is empty — complete form", () => {
    const input = base();
    expect(isNewPatientComplete(input)).toBe(getMissingNewPatientFields(input).length === 0);
    expect(isNewPatientComplete(input)).toBe(true);
  });

  it("isNewPatientComplete is true exactly when getMissingNewPatientFields is empty — incomplete form", () => {
    const input = base({ sexCode: "" });
    expect(isNewPatientComplete(input)).toBe(getMissingNewPatientFields(input).length === 0);
    expect(isNewPatientComplete(input)).toBe(false);
  });

  it("isNewPatientComplete is true exactly when getMissingNewPatientFields is empty — foreign resident, no municipio/zona needed", () => {
    const input = base({ countryOfResidenceCode: "840", municipalityOfResidenceCode: "", residenceZoneCode: "" });
    expect(isNewPatientComplete(input)).toBe(getMissingNewPatientFields(input).length === 0);
    expect(isNewPatientComplete(input)).toBe(true);
  });
});
