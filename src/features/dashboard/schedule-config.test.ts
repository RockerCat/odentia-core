import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INITIAL_PROFESSIONAL_SCHEDULE } from "./schedule-config";

// The initial schedule's canonical source is SQL
// (seed_default_professional_availability()); INITIAL_PROFESSIONAL_SCHEDULE
// mirrors it for the UI/Agenda. These checks read the migrations
// themselves so the two can never silently drift, and so a future
// redefinition of a live professional-creation RPC can never silently drop
// the seed call again (the exact bug that left the pilot Clinic Admin with
// zero rows: 20260914090000 patched a dead overload, not the live one).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");
const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

function latestMigrationDefining(fnName: string): { file: string; body: string } {
  const pattern = new RegExp(`create (or replace )?function public\\.${fnName}\\(`);
  const file = [...migrationFiles].reverse().find((f) => pattern.test(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")));
  if (!file) throw new Error(`no migration defines ${fnName}`);
  const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  const start = sql.search(pattern);
  const end = sql.indexOf("$$;", sql.indexOf("$$", start) + 2);
  return { file, body: sql.slice(start, end) };
}

describe("INITIAL_PROFESSIONAL_SCHEDULE ↔ seed_default_professional_availability()", () => {
  it("matches the SQL helper's days and hours", () => {
    const { body } = latestMigrationDefining("seed_default_professional_availability");
    const { daysOfWeek, startTime, endTime } = INITIAL_PROFESSIONAL_SCHEDULE;
    expect(body).toContain(`generate_series(${daysOfWeek[0]}, ${daysOfWeek[daysOfWeek.length - 1]})`);
    expect(daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(body).toContain(`time '${startTime}', time '${endTime}'`);
  });

  it.each(["create_my_professional_profile", "accept_clinic_invitation"])("the live %s definition still seeds the initial schedule", (fnName) => {
    const { body } = latestMigrationDefining(fnName);
    expect(body).toContain("perform public.seed_default_professional_availability(");
  });

  it("the latest create_my_professional_profile is the 6-argument signature the app calls", () => {
    const { file, body } = latestMigrationDefining("create_my_professional_profile");
    expect(body).toContain("p_document_number text default null");
    expect(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")).toContain(
      "drop function if exists public.create_my_professional_profile(uuid, text, integer, text);",
    );
  });
});
