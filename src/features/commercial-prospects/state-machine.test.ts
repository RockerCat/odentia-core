import { describe, expect, it } from "vitest";
import {
  canMarkCommercialProspectLost,
  getNextCommercialProspectAction,
  isEligibleForClinicConversion,
  isTerminalCommercialProspectStatus,
  isValidCommercialProspectTransition,
  type CommercialProspectStatus,
} from "./state-machine";

// Mirrors update_commercial_prospect_status()'s own PASS/FAIL cases 1:1
// (supabase/migrations/20260916200000_create_update_commercial_prospect_status_rpc.sql)
// — this is the pure, testable half of that RPC's rules; the RPC itself
// re-validates independently server-side against the real row.

describe("isValidCommercialProspectTransition", () => {
  it("PASS: the main flow, one step at a time", () => {
    expect(isValidCommercialProspectTransition("new", "contacted")).toBe(true);
    expect(isValidCommercialProspectTransition("contacted", "demo_scheduled")).toBe(true);
    expect(isValidCommercialProspectTransition("demo_scheduled", "demo_completed")).toBe(true);
    expect(isValidCommercialProspectTransition("demo_completed", "won")).toBe(true);
  });

  it("PASS: any non-terminal status can be marked lost", () => {
    (["new", "contacted", "demo_scheduled", "demo_completed"] as CommercialProspectStatus[]).forEach((status) => {
      expect(isValidCommercialProspectTransition(status, "lost")).toBe(true);
    });
  });

  it("FAIL: won is only reachable immediately after demo_completed", () => {
    expect(isValidCommercialProspectTransition("new", "won")).toBe(false);
    expect(isValidCommercialProspectTransition("contacted", "won")).toBe(false);
    expect(isValidCommercialProspectTransition("demo_scheduled", "won")).toBe(false);
  });

  it("FAIL: won is terminal — no transition out of it, including to lost", () => {
    (["new", "contacted", "demo_scheduled", "demo_completed", "won", "lost"] as CommercialProspectStatus[]).forEach(
      (to) => {
        expect(isValidCommercialProspectTransition("won", to)).toBe(false);
      },
    );
  });

  it("FAIL: lost is terminal — no transition out of it", () => {
    (["new", "contacted", "demo_scheduled", "demo_completed", "won", "lost"] as CommercialProspectStatus[]).forEach(
      (to) => {
        expect(isValidCommercialProspectTransition("lost", to)).toBe(false);
      },
    );
  });

  it("FAIL: no skipping steps in the main flow", () => {
    expect(isValidCommercialProspectTransition("new", "demo_scheduled")).toBe(false);
    expect(isValidCommercialProspectTransition("new", "demo_completed")).toBe(false);
    expect(isValidCommercialProspectTransition("contacted", "demo_completed")).toBe(false);
  });

  it("FAIL: no moving backwards", () => {
    expect(isValidCommercialProspectTransition("contacted", "new")).toBe(false);
    expect(isValidCommercialProspectTransition("demo_completed", "contacted")).toBe(false);
  });
});

describe("isTerminalCommercialProspectStatus", () => {
  it("won and lost are terminal", () => {
    expect(isTerminalCommercialProspectStatus("won")).toBe(true);
    expect(isTerminalCommercialProspectStatus("lost")).toBe(true);
  });

  it("every other status is not terminal", () => {
    expect(isTerminalCommercialProspectStatus("new")).toBe(false);
    expect(isTerminalCommercialProspectStatus("contacted")).toBe(false);
    expect(isTerminalCommercialProspectStatus("demo_scheduled")).toBe(false);
    expect(isTerminalCommercialProspectStatus("demo_completed")).toBe(false);
  });
});

describe("getNextCommercialProspectAction", () => {
  it("returns the single next step for each non-terminal status", () => {
    expect(getNextCommercialProspectAction("new")).toEqual({ toStatus: "contacted", label: "Marcar como contactado" });
    expect(getNextCommercialProspectAction("contacted")).toEqual({
      toStatus: "demo_scheduled",
      label: "Marcar demo agendada",
    });
    expect(getNextCommercialProspectAction("demo_scheduled")).toEqual({
      toStatus: "demo_completed",
      label: "Marcar demo realizada",
    });
    expect(getNextCommercialProspectAction("demo_completed")).toEqual({ toStatus: "won", label: "Marcar como ganado" });
  });

  it("returns null once terminal", () => {
    expect(getNextCommercialProspectAction("won")).toBeNull();
    expect(getNextCommercialProspectAction("lost")).toBeNull();
  });
});

describe("canMarkCommercialProspectLost", () => {
  it("true for every non-terminal status", () => {
    expect(canMarkCommercialProspectLost("new")).toBe(true);
    expect(canMarkCommercialProspectLost("contacted")).toBe(true);
    expect(canMarkCommercialProspectLost("demo_scheduled")).toBe(true);
    expect(canMarkCommercialProspectLost("demo_completed")).toBe(true);
  });

  it("false once terminal", () => {
    expect(canMarkCommercialProspectLost("won")).toBe(false);
    expect(canMarkCommercialProspectLost("lost")).toBe(false);
  });
});

// Mirrors convert_commercial_prospect_to_clinic()'s own eligibility
// checks 1:1 (supabase/migrations/
// 20260916210000_convert_commercial_prospect_to_clinic.sql) — that RPC
// re-validates both halves independently against the real, locked DB
// row; this is only the pure, testable UI-facing mirror.
describe("isEligibleForClinicConversion", () => {
  it("PASS: won with no linked clinic yet is eligible", () => {
    expect(isEligibleForClinicConversion("won", null)).toBe(true);
  });

  it("FAIL: every non-won status is ineligible, regardless of converted_clinic_id", () => {
    (["new", "contacted", "demo_scheduled", "demo_completed", "lost"] as CommercialProspectStatus[]).forEach(
      (status) => {
        expect(isEligibleForClinicConversion(status, null)).toBe(false);
      },
    );
  });

  it("FAIL: won but already converted cannot be converted again", () => {
    expect(isEligibleForClinicConversion("won", "11111111-1111-1111-1111-111111111111")).toBe(false);
  });
});
