// Canonical pilot plan facts — sourced from README.md's own "Current
// business hypothesis" (One PRO plan: COP 99,900/month; 30-day full-access
// evaluation), never invented here. README explicitly says these "must
// remain configurable and are subject to validation" — kept as one named
// constant set so a future price/trial-length change touches this file
// only, never scattered literals. There is exactly one plan today (no
// tiers), so this is a flat set of constants, not a `plans` table row —
// see this checkpoint's own report for why a real `plans` table is
// deferred until a second tier actually exists.
export const PLAN_NAME = "Plan Odentia";
export const PLAN_PRICE_LABEL = "$99.900 COP / mes";
export const TRIAL_DURATION_DAYS = 30;
