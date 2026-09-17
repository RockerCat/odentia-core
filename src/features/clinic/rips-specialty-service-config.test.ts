import { describe, expect, it } from "vitest";
import { buildSpecialtyRipsServiceRows } from "./rips-specialty-service-config";

// RIPS #A4 — regression coverage for the one architectural rule this
// module exists to enforce: a global suggestion (specialty_rips_service_defaults)
// can never be read as if it were this clinic's confirmed configuration
// (clinic_specialty_rips_services). "confirmed" always wins when both
// exist; a suggestion only ever produces "pending-with-suggestion", a
// status a caller can never confuse with "confirmed".
describe("buildSpecialtyRipsServiceRows", () => {
  it("a specialty with a confirmed effective config → status confirmed, using the CONFIRMED codes", () => {
    const rows = buildSpecialtyRipsServiceRows({
      specialties: [{ id: "sp-ortho", name: "Ortodoncia" }],
      confirmed: [{ specialtyId: "sp-ortho", grupoServiciosCode: "01", codServicioCode: "338" }],
      suggestions: [{ specialtyId: "sp-ortho", grupoServiciosCode: "99", codServicioCode: "999" }],
    });
    expect(rows).toEqual([
      {
        specialtyId: "sp-ortho",
        specialtyName: "Ortodoncia",
        status: "confirmed",
        confirmedGrupoCode: "01",
        confirmedServicioCode: "338",
        suggestedGrupoCode: null,
        suggestedServicioCode: null,
      },
    ]);
  });

  it("REGRESSION: confirmed always wins over a suggestion for the same specialty — a suggestion never overrides a real confirmation", () => {
    const rows = buildSpecialtyRipsServiceRows({
      specialties: [{ id: "sp-ortho", name: "Ortodoncia" }],
      confirmed: [{ specialtyId: "sp-ortho", grupoServiciosCode: "01", codServicioCode: "338" }],
      suggestions: [{ specialtyId: "sp-ortho", grupoServiciosCode: "01", codServicioCode: "338" }],
    });
    expect(rows[0].status).toBe("confirmed");
  });

  it("a specialty with no confirmed config but a global default → pending-with-suggestion, using the SUGGESTED codes, never marked confirmed", () => {
    const rows = buildSpecialtyRipsServiceRows({
      specialties: [{ id: "sp-endo", name: "Endodoncia" }],
      confirmed: [],
      suggestions: [{ specialtyId: "sp-endo", grupoServiciosCode: "01", codServicioCode: "311" }],
    });
    expect(rows).toEqual([
      {
        specialtyId: "sp-endo",
        specialtyName: "Endodoncia",
        status: "pending-with-suggestion",
        confirmedGrupoCode: null,
        confirmedServicioCode: null,
        suggestedGrupoCode: "01",
        suggestedServicioCode: "311",
      },
    ]);
  });

  it("a specialty with neither a confirmed config nor a global default → pending-no-suggestion, no codes at all", () => {
    const rows = buildSpecialtyRipsServiceRows({
      specialties: [{ id: "sp-surgery", name: "Cirugía oral y maxilofacial" }],
      confirmed: [],
      suggestions: [],
    });
    expect(rows).toEqual([
      {
        specialtyId: "sp-surgery",
        specialtyName: "Cirugía oral y maxilofacial",
        status: "pending-no-suggestion",
        confirmedGrupoCode: null,
        confirmedServicioCode: null,
        suggestedGrupoCode: null,
        suggestedServicioCode: null,
      },
    ]);
  });

  it("multiple specialties are resolved fully independently, in the given order", () => {
    const rows = buildSpecialtyRipsServiceRows({
      specialties: [
        { id: "sp-ortho", name: "Ortodoncia" },
        { id: "sp-endo", name: "Endodoncia" },
        { id: "sp-surgery", name: "Cirugía oral y maxilofacial" },
      ],
      confirmed: [{ specialtyId: "sp-ortho", grupoServiciosCode: "01", codServicioCode: "338" }],
      suggestions: [{ specialtyId: "sp-endo", grupoServiciosCode: "01", codServicioCode: "311" }],
    });
    expect(rows.map((r) => [r.specialtyId, r.status])).toEqual([
      ["sp-ortho", "confirmed"],
      ["sp-endo", "pending-with-suggestion"],
      ["sp-surgery", "pending-no-suggestion"],
    ]);
  });

  it("a specialty irrelevant to this clinic (not in `specialties`) never appears, even if confirmed/suggested elsewhere", () => {
    const rows = buildSpecialtyRipsServiceRows({
      specialties: [{ id: "sp-ortho", name: "Ortodoncia" }],
      confirmed: [{ specialtyId: "sp-unrelated", grupoServiciosCode: "01", codServicioCode: "999" }],
      suggestions: [{ specialtyId: "sp-other-unrelated", grupoServiciosCode: "01", codServicioCode: "888" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].specialtyId).toBe("sp-ortho");
    expect(rows[0].status).toBe("pending-no-suggestion");
  });

  it("no relevant specialties at all → empty list, the honest empty state", () => {
    expect(buildSpecialtyRipsServiceRows({ specialties: [], confirmed: [], suggestions: [] })).toEqual([]);
  });
});
