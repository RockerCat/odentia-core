import { redirect } from "next/navigation";

// Inicio no longer exists as its own module for the Patient (see
// portal-shell.tsx's PORTAL_NAV_ITEMS) — Mis citas is the entry point now.
// Kept as a redirect, not a deleted route, so any existing /portal link
// still lands somewhere real (see src/app/page.tsx for the same pattern).
export default function PortalIndexPage() {
  redirect("/portal/citas");
}
