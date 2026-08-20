import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  StoreIcon,
} from "@/components/shell/icons";
import { formatCOP, LOPADENT_BENEFIT_MOCK, SUBSCRIPTION_MOCK } from "./mock-data";

// Mi Suscripción — Clinic Admin only (see nav-items.ts / role.ts). Plan,
// LopaDent benefit progress, and billing are all mock data — UI/UX only,
// nothing persisted, no payment integration (see task scope).
export function SubscriptionScreen() {
  const { goal, currentSpend } = LOPADENT_BENEFIT_MOCK;
  const goalReached = currentSpend >= goal;
  const remaining = Math.max(0, goal - currentSpend);
  const progressPct = Math.min(100, Math.round((currentSpend / goal) * 100));

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        Consulta el estado de tu plan y tu beneficio con LopaDent.
      </p>

      {/* Single column on mobile/tablet; desktop lays the three sections out
          in one row at roughly 30/40/30 (Beneficio LopaDent is the
          protagonist). Grid's default item stretch keeps the three cards
          the same height without a rigid fixed height that would clip
          longer content. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[3fr_4fr_3fr]">
        <PlanCard />
        <LopaDentBenefitCard
          goalReached={goalReached}
          currentSpend={currentSpend}
          goal={goal}
          remaining={remaining}
          progressPct={progressPct}
        />
        <BillingSection goalReached={goalReached} />
      </div>
    </div>
  );
}

function PlanCard() {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{SUBSCRIPTION_MOCK.planName}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Tu plan actual</p>
        </div>
        <span className="shrink-0 rounded-full border border-info/25 bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info">
          Periodo gratuito
        </span>
      </div>

      <p className="mt-5 text-2xl font-bold tracking-tight">{SUBSCRIPTION_MOCK.priceLabel}</p>

      <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3">
        <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Gratis hasta {SUBSCRIPTION_MOCK.trialEndsAtCompactLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            Próximo cobro: {SUBSCRIPTION_MOCK.priceLabel.split(" / ")[0]}
          </p>
        </div>
      </div>
    </div>
  );
}

function LopaDentBenefitCard({
  goalReached,
  currentSpend,
  goal,
  remaining,
  progressPct,
}: {
  goalReached: boolean;
  currentSpend: number;
  goal: number;
  remaining: number;
  progressPct: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <StoreIcon className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Beneficio LopaDent</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compra {formatCOP(goal)} este mes en LopaDent y obtén gratis el próximo mes de Odentia.
          </p>
        </div>
      </div>

      <div className="mt-5">
        {goalReached ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/10 px-3.5 py-3 text-sm font-medium text-primary">
            <CheckCircleIcon className="size-5 shrink-0" />
            <span>¡Próximo mes gratis! No habrá cobro en tu siguiente mensualidad.</span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-foreground">
                {formatCOP(currentSpend)} <span className="font-normal text-muted-foreground">de {formatCOP(goal)}</span>
              </p>
              <p className="text-xs text-muted-foreground">{progressPct}%</p>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-foreground/10">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Te faltan {formatCOP(remaining)} para obtener el próximo mes gratis.
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
      >
        Ir a LopaDent
        <ArrowRightIcon className="size-4" />
      </button>
    </div>
  );
}

function BillingSection({ goalReached }: { goalReached: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold">Facturación</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Información de tu próximo cobro.</p>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarIcon className="size-4" />
          </span>
          <div>
            <p className="text-xs text-label-foreground">Próximo cobro</p>
            <p className="text-sm font-medium text-foreground">
              {goalReached
                ? "Sin cobro — próximo mes gratis"
                : `${SUBSCRIPTION_MOCK.priceLabel.split(" / ")[0]} el ${SUBSCRIPTION_MOCK.trialEndsAtLabel}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CreditCardIcon className="size-4" />
          </span>
          <div>
            <p className="text-xs text-label-foreground">Método de pago</p>
            <p className="text-sm font-medium text-foreground">{SUBSCRIPTION_MOCK.paymentMethodLabel}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
