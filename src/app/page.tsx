import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { Logo } from "@/components/shell/logo";
import {
  ArrowRightIcon,
  BarChartIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClipboardIcon,
  ClockIcon,
  CreditCardIcon,
  NoteIcon,
  StoreIcon,
  ToothIcon,
  UserIcon,
  UsersIcon,
} from "@/components/shell/icons";

// Public marketing landing — reuses the same branding/tokens/icons as the
// authenticated app. "Registra tu clínica" is intentionally not wired to a
// real flow yet (see PROJECT_STATUS.md: no real registration this phase).
// The hero/marketplace "product mockups" below are plain HTML/CSS built
// from the same visual language as the real Agenda (see mock-data.ts's
// STATUS_STYLES) — not screenshots or generated assets.

const CLINIC_FEATURES = [
  { icon: CalendarIcon, title: "Agenda", description: "Citas y disponibilidad en tiempo real." },
  { icon: UserIcon, title: "Pacientes", description: "Historial y datos centralizados." },
  { icon: NoteIcon, title: "Historia clínica", description: "Registro clínico completo por paciente." },
  { icon: ToothIcon, title: "Odontograma", description: "Diagrama dental interactivo." },
  { icon: UsersIcon, title: "Equipo", description: "Dentistas y asistentes de tu clínica." },
  { icon: BarChartIcon, title: "Reportes", description: "Visibilidad clara de tu operación." },
];

const MARKETPLACE_FEATURES = [
  { icon: StoreIcon, title: "Marketplace", description: "Compra insumos desde Odentia." },
  { icon: ClipboardIcon, title: "Insumos odontológicos", description: "Catálogo especializado." },
  { icon: BuildingIcon, title: "LopaDent", description: "Nuestro aliado especializado en productos odontológicos." },
  { icon: CreditCardIcon, title: "Beneficios", description: "Ahorros y patrocinios de suscripción." },
];

const MARKETPLACE_PRODUCTS = ["Guantes de nitrilo (caja x100)", "Anestesia dental", "Resina compuesta"];

const FLOW_STEPS = [
  { icon: CalendarIcon, label: "Agenda" },
  { icon: UserIcon, label: "Paciente" },
  { icon: ClockIcon, label: "Atención" },
  { icon: StoreIcon, label: "Marketplace" },
  { icon: CreditCardIcon, label: "Beneficios" },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo className="h-7 w-auto sm:h-8" />

          <nav className="hidden items-center gap-6 text-sm font-medium text-foreground/80 md:flex">
            <a href="#funcionalidades" className="hover:text-foreground">
              Funcionalidades
            </a>
            <a href="#marketplace" className="hover:text-foreground">
              Marketplace
            </a>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <Link
              href="/login"
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 sm:border sm:border-border sm:px-4 sm:py-2 sm:text-sm"
            >
              Iniciar sesión
            </Link>
            <button
              type="button"
              className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 sm:px-4 sm:py-2 sm:text-sm"
            >
              Registra tu clínica
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative px-4 py-14 sm:px-6 sm:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(55%_55%_at_20%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]"
          />
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-10">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <span className="size-1.5 rounded-full bg-primary" />
                Plataforma para clínicas dentales
              </span>

              <h1 className="mt-5 max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Gestiona tu clínica odontológica y poténciala con un marketplace especializado.
              </h1>
              <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
                Odentia reúne la gestión diaria de tu clínica e integra un marketplace pensado
                para odontología. Organiza tu agenda, pacientes y atención clínica, mientras
                compras los insumos que necesitas y obtienes beneficios para tu suscripción.
              </p>
              <div className="mt-6 flex flex-col items-start gap-1.5">
                <span className="text-xs text-muted-foreground">En alianza con</span>
                <Image
                  src="/branding/lopadent.png"
                  alt="LopaDent"
                  width={90}
                  height={22}
                  className="h-auto w-[90px]"
                />
              </div>
              <div className="mt-8 flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium whitespace-nowrap text-primary-foreground hover:opacity-90 sm:px-6 sm:py-3"
                >
                  Registra tu clínica
                </button>
                <Link
                  href="/login"
                  className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium whitespace-nowrap text-foreground hover:bg-foreground/5 sm:px-6 sm:py-3"
                >
                  Iniciar sesión
                </Link>
              </div>
            </div>

            {/* Product mock — plain HTML/CSS, same tokens/status styles as the real Agenda. */}
            <div className="relative">
              <div
                aria-hidden="true"
                className="absolute -inset-6 -z-10 rounded-[2rem] bg-primary/10 blur-2xl"
              />
              <div className="rounded-2xl border border-border bg-background p-4 shadow-xl shadow-foreground/5 sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground/70">Agenda de hoy</p>
                  <span className="text-[11px] text-muted-foreground">Lunes, 9:00 a.m.</span>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2 rounded-lg border border-info/25 bg-info/5 px-3 py-2">
                    <span className="text-xs font-medium text-foreground">9:00</span>
                    <span className="flex-1 truncate text-xs text-foreground/80">Camila Ríos — Control</span>
                    <span className="rounded-full border border-info/25 bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info">
                      En curso
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="text-xs font-medium text-foreground">10:30</span>
                    <span className="flex-1 truncate text-xs text-foreground/80">Andrés Peña — Limpieza</span>
                    <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      Confirmada
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="text-xs font-medium text-foreground">11:15</span>
                    <span className="flex-1 truncate text-xs text-foreground/80">Sofía Duarte — Valoración</span>
                    <span className="rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                      Pendiente
                    </span>
                  </div>
                </div>

                <div className="my-4 border-t border-border" />

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                        CR
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">Camila Ríos</p>
                        <p className="truncate text-[10px] text-muted-foreground">Paciente activa</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <StoreIcon className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">Marketplace</p>
                        <p className="truncate text-[10px] text-primary">Beneficios activos</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-4 -left-4 hidden items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 shadow-lg sm:flex">
                <ToothIcon className="size-4 text-primary" />
                <span className="text-xs font-medium">Odontograma actualizado</span>
              </div>
            </div>
          </div>
        </section>

        {/* Mucho más que un software de citas */}
        <section id="funcionalidades" className="border-t border-border bg-background px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-semibold sm:text-3xl">
                Mucho más que un software de citas odontológicas
              </h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                Dos frentes, una sola plataforma: la operación clínica del día a día y el acceso a
                un marketplace pensado para tu consultorio.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CalendarIcon className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">Gestiona tu clínica</h3>
                    <p className="text-xs text-muted-foreground sm:text-sm">
                      Todo lo que tu operación clínica necesita.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  {CLINIC_FEATURES.map(({ icon: Icon, title, description }) => (
                    <div
                      key={title}
                      className="rounded-xl border border-border bg-background p-3.5 transition-shadow hover:shadow-sm"
                    >
                      <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <p className="mt-2.5 text-sm font-medium text-foreground">{title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <StoreIcon className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">Potencia tu clínica</h3>
                    <p className="text-xs text-muted-foreground sm:text-sm">
                      Un marketplace especializado, integrado a tu operación.
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <BuildingIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">Marketplace en alianza con LopaDent</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Especialistas en productos e insumos odontológicos.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  {MARKETPLACE_FEATURES.map(({ icon: Icon, title, description }) => (
                    <div
                      key={title}
                      className="rounded-xl border border-border bg-background p-3.5 transition-shadow hover:shadow-sm"
                    >
                      <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <p className="mt-2.5 text-sm font-medium text-foreground">{title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Marketplace — near-second-hero */}
        <section id="marketplace" className="relative border-t border-border px-4 py-14 sm:px-6 sm:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(55%_55%_at_80%_0%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent)]"
          />
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-10">
            <div>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <StoreIcon className="size-5" />
              </span>
              <h2 className="mt-5 text-2xl font-semibold text-balance sm:text-4xl">
                Tus compras también pueden pagar Odentia.
              </h2>
              <p className="mt-4 max-w-lg text-sm text-muted-foreground sm:text-base">
                El Marketplace conecta la operación de tu clínica con LopaDent y sus insumos
                odontológicos. Tus compras elegibles pueden patrocinar la suscripción de tu
                clínica.
              </p>
            </div>

            <div className="relative">
              <div
                aria-hidden="true"
                className="absolute -inset-6 -z-10 rounded-[2rem] bg-primary/10 blur-2xl"
              />
              <div className="rounded-2xl border border-border bg-background p-5 shadow-xl shadow-foreground/5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground/70">Marketplace</p>
                  <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Proveedor aliado
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  {MARKETPLACE_PRODUCTS.map((product) => (
                    <div key={product} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <ToothIcon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{product}</p>
                        <p className="truncate text-[10px] text-muted-foreground">LopaDent</p>
                      </div>
                      <CheckCircleIcon className="size-3.5 shrink-0 text-primary" />
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <CreditCardIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">Compra con beneficio</p>
                    <p className="truncate text-[11px] text-primary">Aporta a tu suscripción Odentia</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Todo conectado en una sola operación */}
        <section className="border-t border-border bg-background px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">
              Todo conectado en una sola operación
            </h2>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between sm:gap-2">
              {FLOW_STEPS.map(({ icon: Icon, label }, index) => (
                <Fragment key={label}>
                  <div className="flex flex-col items-center gap-2.5">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
                      <Icon className="size-6" />
                    </span>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                  </div>
                  {index < FLOW_STEPS.length - 1 && (
                    <ArrowRightIcon className="size-5 shrink-0 rotate-90 text-primary/40 sm:rotate-0" />
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl border border-primary/20 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_8%,var(--background)),var(--background))] p-7 text-center shadow-sm sm:p-10">
              <h2 className="text-2xl font-semibold text-balance sm:text-3xl">
                Tu clínica puede hacer mucho más desde un solo lugar.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
                Empieza a gestionar tu clínica y descubre un ecosistema creado para odontología.
              </p>
              <button
                type="button"
                className="mt-6 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Registra tu clínica
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-6 sm:px-6">
        <p className="text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Odentia</p>
      </footer>
    </div>
  );
}
