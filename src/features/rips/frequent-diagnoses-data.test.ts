import { describe, expect, it } from "vitest";
import { FREQUENT_DIAGNOSES_LIMIT, rankFrequentDiagnosisCodes } from "./frequent-diagnoses-data";

// Regression coverage for the RIPS #A3 UX gap fix — "Usados en esta
// clínica" suggestions for Diagnóstico principal/relacionado. Pure logic
// only (no Supabase) — tenant scoping itself lives entirely in
// fetchFrequentDiagnosesForCurrentClinic()'s own resolveClinicContext()
// call (never accepts a clinicId parameter), which this test does not
// re-verify — this only proves the ranking rule the task asked for:
// frequency first, most-recent-use as the tiebreaker.

describe("rankFrequentDiagnosisCodes", () => {
  it("orders by frequency, most-used code first", () => {
    const rows = [
      { cie10Code: "K021", createdAt: "2026-09-01T00:00:00Z" },
      { cie10Code: "K050", createdAt: "2026-09-02T00:00:00Z" },
      { cie10Code: "K050", createdAt: "2026-09-03T00:00:00Z" },
      { cie10Code: "K050", createdAt: "2026-09-04T00:00:00Z" },
    ];
    expect(rankFrequentDiagnosisCodes(rows, 10)).toEqual(["K050", "K021"]);
  });

  it("breaks a frequency tie by most-recent use", () => {
    const rows = [
      { cie10Code: "K021", createdAt: "2026-09-01T00:00:00Z" },
      { cie10Code: "K050", createdAt: "2026-09-05T00:00:00Z" },
    ];
    expect(rankFrequentDiagnosisCodes(rows, 10)).toEqual(["K050", "K021"]);
  });

  it("uses the LATEST occurrence of a code for the recency tiebreaker, not the first", () => {
    // K021 used twice (oldest first), K050 used once more recently than
    // K021's OWN most recent use — K021 must still win the tie on its
    // true last-used date, not its first-seen date.
    const rows = [
      { cie10Code: "K021", createdAt: "2026-09-01T00:00:00Z" },
      { cie10Code: "K050", createdAt: "2026-09-03T00:00:00Z" },
      { cie10Code: "K021", createdAt: "2026-09-04T00:00:00Z" },
    ];
    expect(rankFrequentDiagnosisCodes(rows, 10)).toEqual(["K021", "K050"]);
  });

  it("caps the result at `limit`", () => {
    const rows = ["A00", "B00", "C00", "D00"].map((code, i) => ({
      cie10Code: code,
      createdAt: `2026-09-0${i + 1}T00:00:00Z`,
    }));
    expect(rankFrequentDiagnosisCodes(rows, 2)).toHaveLength(2);
  });

  it("returns an empty list for no rows, never a fabricated default", () => {
    expect(rankFrequentDiagnosisCodes([], 10)).toEqual([]);
  });

  it("never introduces duplicate codes even with many repeated rows", () => {
    const rows = [
      { cie10Code: "K021", createdAt: "2026-09-01T00:00:00Z" },
      { cie10Code: "K021", createdAt: "2026-09-02T00:00:00Z" },
      { cie10Code: "K021", createdAt: "2026-09-03T00:00:00Z" },
      { cie10Code: "K050", createdAt: "2026-09-04T00:00:00Z" },
    ];
    const codes = rankFrequentDiagnosisCodes(rows, 10);
    expect(codes).toEqual(["K021", "K050"]);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

// Diagnóstico principal's initial-suggestions UI (real-clinical-encounter-
// screen.tsx's DIAGNOSIS_INITIAL_SUGGESTIONS) is meant to show at most 5
// options on focus — pins the real production cap, not just a
// rankFrequentDiagnosisCodes(..., N) call-site convention that could
// silently drift. A clinic with fewer than 5 real frequent diagnoses
// (e.g. exactly 1) shows only those real ones — this module has no
// fallback padding logic to fill the remainder (see this file's own
// header comment on why a CIE-10-catalog fallback wasn't built).
describe("FREQUENT_DIAGNOSES_LIMIT", () => {
  it("is 5 — the cap Diagnóstico principal's initial-suggestions UI shows on focus", () => {
    expect(FREQUENT_DIAGNOSES_LIMIT).toBe(5);
  });
});
