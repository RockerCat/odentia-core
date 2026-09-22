import { CalendarIcon, CheckCircleIcon, ClockIcon } from "@/components/shell/icons";
import { deriveClinicCommercialLabel, type ClinicCommercialLabel } from "./commercial-status";
import { PLAN_NAME, PLAN_PRICE_LABEL } from "./plan";

const STATUS_COPY: Record<ClinicCommercialLabel, { badge: string; badgeClassName: string; message: (trialEndsAt: string | null) => string }> = {
  trial: {
    badge: "Período de prueba",
    badgeClassName: "border-info/25 bg-info/10 text-info",
    message: (trialEndsAt) =>
      trialEndsAt
        ? `Tu clínica está en período de prueba hasta el ${new Date(trialEndsAt).toLocaleDateString("es-CO")}.`
        : "Tu clínica está en período de prueba.",
  },
  trial_expired: {
    badge: "Período de prueba vencido",
    badgeClassName: "border-warning/25 bg-warning/10 text-warning",
    message: (trialEndsAt) =>
      trialEndsAt
        ? `Tu período de prueba terminó el ${new Date(trialEndsAt).toLocaleDateString("es-CO")}. Contacta a soporte de Odentia para continuar.`
        : "Tu período de prueba terminó. Contacta a soporte de Odentia para continuar.",
  },
  active: {
    badge: "Activa",
    badgeClassName: "border-success/25 bg-success/10 text-success",
    message: () => "Tu clínica está activa.",
  },
  suspended: {
    badge: "Suspendida",
    badgeClassName: "border-danger/25 bg-danger/10 text-danger",
    message: () => "Tu clínica está suspendida. Contacta a soporte de Odentia para más información.",
  },
};

// Mi Suscripción — Clinic Admin only. Real clinic commercial state
// (clinics.status/trial_ends_at, same fields Platform's own "Estado
// comercial" card reads/writes) — see this checkpoint's own report for
// why this replaced the previous fully-mock plan/billing/LopaDent-benefit
// screen. Deliberately informational-only for the pilot: no checkout, no
// payment method, no invented "próximo cobro" date — pagos/planes/
// facturación real son fase posterior (ver PROJECT_STATUS.md, "DEFERRED
// BILLING").
export function SubscriptionScreen({
  status,
  trialEndsAt,
}: {
  status: "active" | "suspended";
  trialEndsAt: string | null;
}) {
  const label = deriveClinicCommercialLabel({ status, trialEndsAt });
  const copy = STATUS_COPY[label];

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">Consulta el estado de tu plan en Odentia.</p>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{PLAN_NAME}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Tu plan actual</p>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${copy.badgeClassName}`}>
              {copy.badge}
            </span>
          </div>

          <p className="mt-5 text-2xl font-bold tracking-tight">{PLAN_PRICE_LABEL}</p>

          <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3">
            {label === "active" ? (
              <CheckCircleIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <p className="text-sm font-medium text-foreground">{copy.message(trialEndsAt)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold">Facturación</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Cómo funciona durante este piloto.</p>

          <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CalendarIcon className="size-4" />
            </span>
            <p className="text-sm text-muted-foreground">
              Durante el piloto, tu suscripción es gestionada manualmente por el equipo de Odentia — no hay cobro
              automático. Si tienes preguntas sobre tu plan o facturación, contáctanos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
