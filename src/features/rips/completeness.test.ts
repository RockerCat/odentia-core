import { describe, expect, it } from "vitest";
import {
  getClinicLocationRipsIdentityCompleteness,
  getPatientRipsIdentityCompleteness,
  getProfessionalRipsIdentityCompleteness,
} from "./completeness";

describe("getClinicLocationRipsIdentityCompleteness", () => {
  it("is complete when both tax_id and cod_prestador are present", () => {
    const result = getClinicLocationRipsIdentityCompleteness({ clinicTaxId: "900123456", codPrestador: "050010123401" });
    expect(result).toEqual({ complete: true, missingFields: [] });
  });

  it("reports both fields missing when neither is set", () => {
    const result = getClinicLocationRipsIdentityCompleteness({ clinicTaxId: null, codPrestador: null });
    expect(result.complete).toBe(false);
    expect(result.missingFields).toEqual(["clinicTaxId", "codPrestador"]);
  });

  it("reports only the missing one when the other is present", () => {
    const result = getClinicLocationRipsIdentityCompleteness({ clinicTaxId: "900123456", codPrestador: null });
    expect(result.missingFields).toEqual(["codPrestador"]);
  });
});

describe("getProfessionalRipsIdentityCompleteness", () => {
  it("is complete when both document fields are present", () => {
    const result = getProfessionalRipsIdentityCompleteness({ documentType: "CC", documentNumber: "123456" });
    expect(result).toEqual({ complete: true, missingFields: [] });
  });

  it("reports both missing for a legacy professional profile with neither field", () => {
    const result = getProfessionalRipsIdentityCompleteness({ documentType: null, documentNumber: null });
    expect(result.complete).toBe(false);
    expect(result.missingFields).toEqual(["documentType", "documentNumber"]);
  });
});

describe("getPatientRipsIdentityCompleteness", () => {
  const completeColombianResident = {
    documentType: "CC",
    documentNumber: "123456",
    birthDate: "1990-01-01",
    sexCode: "M",
    userTypeCode: "05",
    countryOfResidenceCode: "170",
    municipalityOfResidenceCode: "05001",
    residenceZoneCode: "01",
  };

  it("is complete for a fully-identified Colombian resident", () => {
    expect(getPatientRipsIdentityCompleteness(completeColombianResident)).toEqual({ complete: true, missingFields: [] });
  });

  it("requires municipality and zone only when residing in Colombia (170)", () => {
    const foreignResident = {
      ...completeColombianResident,
      countryOfResidenceCode: "840",
      municipalityOfResidenceCode: null,
      residenceZoneCode: null,
    };
    expect(getPatientRipsIdentityCompleteness(foreignResident)).toEqual({ complete: true, missingFields: [] });
  });

  it("flags missing municipality/zone for a Colombian resident who lacks them", () => {
    const result = getPatientRipsIdentityCompleteness({
      ...completeColombianResident,
      municipalityOfResidenceCode: null,
      residenceZoneCode: null,
    });
    expect(result.complete).toBe(false);
    expect(result.missingFields).toEqual(["municipalityOfResidenceCode", "residenceZoneCode"]);
  });

  it("does not break on a legacy patient with nothing filled in", () => {
    const result = getPatientRipsIdentityCompleteness({
      documentType: null,
      documentNumber: null,
      birthDate: null,
      sexCode: null,
      userTypeCode: null,
      countryOfResidenceCode: null,
      municipalityOfResidenceCode: null,
      residenceZoneCode: null,
    });
    expect(result.complete).toBe(false);
    // countryOfResidenceCode is null (not "170"), so municipality/zone are
    // correctly NOT double-counted as missing on top of the base fields.
    expect(result.missingFields).toEqual([
      "documentType",
      "documentNumber",
      "birthDate",
      "sexCode",
      "userTypeCode",
      "countryOfResidenceCode",
    ]);
  });
});
