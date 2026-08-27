import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  BarChartIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  NoteIcon,
  StoreIcon,
  ToothIcon,
  UsersIcon,
} from "@/components/shell/icons";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { formatCOP, LOPADENT_BENEFIT_MOCK, SUBSCRIPTION_MOCK } from "@/features/subscription/mock-data";

// Public "Planes" page — same visual language/tokens as the home landing
// (src/app/page.tsx). Reuses the subscription feature's mock price/goal
// (src/features/subscription/mock-data.ts) so the numbers shown here never
// drift from what a logged-in Clinic Admin sees in Mi Suscripción.
// "Probar Odentia gratis" and "Comenzar mes gratis" both open the real
// onboarding wizard at /registro, same as "Registra tu clínica" on the home
// page (see src/features/onboarding).

export const metadata: Metadata = {
  title: "Planes | Odentia",
  description: "Un plan simple para tu clínica: 1 mes gratis y una suscripción que puede salir gratis con LopaDent.",
  alternates: { canonical: "/planes" },
};

const HOW_IT_WORKS = [
  { icon: BuildingIcon, title: "Crea tu clínica", description: "1 mes gratis desde el primer día." },
  { icon: CalendarIcon, title: "Usa Odentia", description: "Agenda, pacientes, historia clínica y más." },
  {
    icon: StoreIcon,
    title: "Compra en LopaDent",
    description: `Más de ${formatCOP(LOPADENT_BENEFIT_MOCK.goal)} durante el mes.`,
  },
  { icon: CheckCircleIcon, title: "Siguiente mes", description: "$0 en Odentia." },
];

const WHATS_INCLUDED = [
  { icon: CalendarIcon, title: "Agenda clínica" },
  { icon: NoteIcon, title: "Pacientes e historias clínicas" },
  { icon: ToothIcon, title: "Odontograma" },
  { icon: UsersIcon, title: "Gestión del equipo" },
  { icon: BarChartIcon, title: "Reportes" },
  { icon: StoreIcon, title: "Acceso al Marketplace" },
];

export default function PlanesPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <LandingHeader active="planes" />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative px-4 py-14 sm:px-6 sm:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(55%_55%_at_20%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]"
          />
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Un plan simple que puede salirte gratis.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              Empieza con un mes gratis. Después paga {SUBSCRIPTION_MOCK.priceLabel} o consigue meses sin
              costo gracias a tus compras en LopaDent.
            </p>
          </div>
        </section>

        {/* Pricing sequence — 3 steps, not 3 separate plans. */}
        <section className="border-t border-border bg-background px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col items-stretch gap-4 lg:flex-row">
              {/* 1. Empieza gratis */}
              <div className="flex flex-1 flex-col rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-7">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    1
                  </span>
                  <p className="text-sm font-semibold text-foreground/70">Empieza gratis</p>
                </div>

                <p className="mt-5 text-3xl font-bold tracking-tight">$0</p>
                <p className="mt-1 text-xs text-muted-foreground">Tu primer mes completo.</p>

                <p className="mt-4 flex-1 text-sm text-muted-foreground">Prueba Odentia sin costo.</p>

                <Link
                  href="/registro"
                  className="mt-5 block w-full rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium whitespace-nowrap text-primary-foreground hover:opacity-90"
                >
                  Probar Odentia gratis
                </Link>
              </div>

              <ArrowRightIcon className="mx-auto size-5 shrink-0 rotate-90 text-primary/40 lg:my-auto lg:rotate-0" />

              {/* 2. Plan Odentia */}
              <div className="flex flex-1 flex-col rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-7">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    2
                  </span>
                  <p className="text-sm font-semibold text-foreground/70">Plan Odentia</p>
                </div>

                <p className="mt-5 text-3xl font-bold tracking-tight">{SUBSCRIPTION_MOCK.priceLabel}</p>
                <p className="mt-1 text-xs text-muted-foreground">Después de tu primer mes gratis.</p>

                <p className="mt-4 flex-1 text-sm text-muted-foreground">
                  Una sola mensualidad con todas las funcionalidades incluidas.
                </p>
              </div>

              <ArrowRightIcon className="mx-auto size-5 shrink-0 rotate-90 text-primary/40 lg:my-auto lg:rotate-0" />

              {/* 3. Beneficio LopaDent — subtle LopaDent-associated accent, same primary tokens as the rest of the page. */}
              <div className="flex flex-1 flex-col rounded-2xl border border-primary/25 bg-primary/5 p-6 shadow-sm sm:p-7">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    3
                  </span>
                  <p className="text-sm font-semibold text-foreground/70">Beneficio LopaDent</p>
                </div>

                <Image
                  src="/branding/lopadent.png"
                  alt="LopaDent"
                  width={90}
                  height={22}
                  className="mt-4 h-auto w-[84px]"
                />

                <p className="mt-4 text-3xl font-bold tracking-tight text-primary">$0</p>
                <p className="mt-1 text-xs text-muted-foreground">el siguiente mes</p>

                <p className="mt-4 flex-1 text-sm text-muted-foreground">
                  Compra más de{" "}
                  <span className="font-medium text-foreground">{formatCOP(LOPADENT_BENEFIT_MOCK.goal)} COP</span> en
                  LopaDent durante el mes y tu siguiente mensualidad de Odentia es gratis.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works — 4 steps */}
        <section className="border-t border-border bg-background px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">Así funciona</h2>

            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {HOW_IT_WORKS.map(({ icon: Icon, title, description }, index) => (
                <div key={title} className="relative rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-semibold text-muted-foreground">
                      {index + 1}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-border bg-surface px-4 py-3 sm:mx-auto sm:max-w-2xl">
              <ClockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Si no alcanzas el monto en un mes, tu suscripción continúa normalmente por{" "}
                {SUBSCRIPTION_MOCK.priceLabel}.
              </p>
            </div>
          </div>
        </section>

        {/* Qué incluye — compact */}
        <section className="border-t border-border px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">¿Qué incluye?</h2>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {WHATS_INCLUDED.map(({ icon: Icon, title }) => (
                <div
                  key={title}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl border border-primary/20 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_8%,var(--background)),var(--background))] p-7 text-center shadow-sm sm:p-10">
              <h2 className="text-2xl font-semibold text-balance sm:text-3xl">Empieza gratis hoy mismo.</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
                Un mes gratis, sin complicaciones, y la posibilidad de que tu suscripción salga gratis
                cada mes.
              </p>
              <Link
                href="/registro"
                className="mt-6 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Comenzar mes gratis
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
