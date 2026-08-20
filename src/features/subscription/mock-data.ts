// Mi Suscripción — mock-only plan, billing, and LopaDent benefit data. No
// backend, persistence, or payment integration (see task scope).

export const SUBSCRIPTION_MOCK = {
  planName: "Plan Odentia",
  priceLabel: "$99.900 COP / mes",
  trialEndsAtLabel: "15 de septiembre de 2026",
  trialEndsAtCompactLabel: "15 sep 2026",
  paymentMethodLabel: "Visa terminada en 4242",
};

// Spend the goal amount at LopaDent within a calendar month and the
// following month of Odentia is free. Applies during the initial free
// trial month too — reaching the goal there frees up the month right
// after the trial ends, deferring the first real charge.
export const LOPADENT_BENEFIT_MOCK = {
  goal: 60000,
  currentSpend: 38500,
};

export function formatCOP(amount: number): string {
  return `$${amount.toLocaleString("es-CO")}`;
}
