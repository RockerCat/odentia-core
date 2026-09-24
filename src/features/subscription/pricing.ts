// Public plan pricing shown on /planes — real business constants (see
// PROJECT_STATUS.md "Known Decisions": COP $99.900 / month), never
// per-clinic data. Replaces the old subscription/mock-data.ts, which also
// carried fictitious billing fields (a "Visa terminada en 4242" payment
// method, a fixed trial date, a fake LopaDent spend) nothing real used.

export const PLAN_PRICE_LABEL = "$99.900 COP / mes";

// Spend this much at LopaDent within a calendar month and the following
// month of Odentia is free (marketing copy on /planes).
export const LOPADENT_BENEFIT_GOAL_COP = 60000;

export function formatCOP(amount: number): string {
  return `$${amount.toLocaleString("es-CO")}`;
}
