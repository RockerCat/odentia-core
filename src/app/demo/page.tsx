import type { Metadata } from "next";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { ProspectForm } from "@/features/commercial-prospects/prospect-form";

// Minimal commercial landing destination for "Quiero Odentia para mi
// clínica" (home, /planes, and this shared header's own CTA — see
// landing-header.tsx's own comment on the commercial model this
// reflects). "demo" stays true — the URL, and a product walkthrough is
// still mentioned in the secondary copy below — it's just deliberately
// not this page's own primary heading/identity, per the same product
// decision behind the CTA's own wording. Now the real prospect-capture
// entry point: ProspectForm (src/features/commercial-prospects/) persists
// a Prospecto Comercial through the one narrow, anon-callable RPC
// (submit_commercial_prospect) — see that feature's own comments for why
// this never touches Supabase Auth, clinics, or memberships. This page
// itself stays a plain server component; only the form island below is a
// Client Component.
export const metadata: Metadata = {
  title: "Odentia para tu clínica | Odentia",
  description: "Conoce cómo Odentia puede apoyar la operación de tu clínica y cómo te acompañamos en la puesta en marcha.",
  alternates: { canonical: "/demo" },
};

export default function DemoPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <LandingHeader />

      <main className="flex-1">
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Odentia para tu clínica</h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              Queremos conocer tu clínica para mostrarte cómo Odentia puede apoyar su operación
              —agenda, pacientes, historia clínica, equipo y marketplace— y acompañarte en todo el
              proceso de puesta en marcha.
            </p>
            <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
              Como parte de ese primer contacto, te mostraremos una demostración del producto
              pensada para tu clínica. Déjanos tus datos y nuestro equipo se pondrá en contacto
              contigo.
            </p>

            <ProspectForm />
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
