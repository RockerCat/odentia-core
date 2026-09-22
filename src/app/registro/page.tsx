import type { Metadata } from "next";
import { RegistroReentry } from "@/features/onboarding/registro-reentry";

// Public reentry/fallback entry point — no session required (same as
// /login). "Odentia — retirar self-service de /registro y eliminar
// Confirm Signup" (2026-09-21): this route no longer offers public
// self-service clinic creation at all — RegistroReentry only ever
// resolves a real destination (the product, the Patient Portal, or /demo
// for anyone else) and redirects. See RegistroReentry's own header
// comment for why the route itself must keep existing regardless.
export const metadata: Metadata = {
  title: "Accede a tu cuenta | Odentia",
  description: "Accede o activa tu cuenta de Odentia para continuar con tu acceso a la plataforma.",
  alternates: { canonical: "/registro" },
};

export default function RegistroPage() {
  return <RegistroReentry />;
}
