"use client";

import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

// Per-Link navigation feedback for the Sidebar/BottomTabBar's real
// (internal) nav items — built on Next.js 16's own useLinkStatus(), not a
// custom router-event tracker. Next tracks pending state PER <Link>, so
// clicking "Pacientes" only ever lights up "Pacientes" itself, never
// "Agenda" or the rest of the nav — exactly the "small, per-item pending"
// shape this needs, for free.
//
// Must be rendered as a DESCENDANT of the specific <Link> it reports on
// (never the Link itself, and never read from a parent) — that's the
// contract useLinkStatus documents, and it's why this exists as its own
// child component instead of a value read inline in sidebar-nav.tsx/
// bottom-tab-bar.tsx.
//
// The spinner's own PRESENCE (not just a color change) is the signal —
// satisfies "no depender únicamente del color" for free, since it simply
// isn't in the DOM at all until pending. prefers-reduced-motion swaps the
// spin for a static ring via Tailwind's built-in motion-reduce variant
// (no plugin needed) rather than removing the signal entirely.
export function NavLinkContent({ className, children }: { className: string; children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span aria-busy={pending || undefined} className={className}>
      {children}
      {pending && (
        <span
          aria-hidden="true"
          className="ml-auto size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-60 motion-reduce:animate-none"
        />
      )}
    </span>
  );
}
