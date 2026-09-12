"use client";

import Link, { type LinkProps } from "next/link";
import { useState, type AnchorHTMLAttributes, type ReactNode } from "react";

// Immediate navigation feedback for the landing's public CTAs (Iniciar
// sesión / Registra tu clínica / Ir a mi clínica) — these are real
// next/link <Link>s, so the codebase's existing per-Link pattern
// (src/components/shell/nav-link-status.tsx's NavLinkContent, built on
// useLinkStatus()) is the closest precedent, but that hook's contract
// only allows reading pending state from a DESCENDANT of the Link, never
// the Link itself — and these buttons also need to be disabled against a
// double click, which only the anchor element itself can do. So this
// tracks pending with local state set synchronously in the Link's own
// onClick instead, same spirit as the local-pending-useState convention
// already used for plain router.push buttons elsewhere (e.g.
// real-appointment-detail-modal.tsx's "Ver paciente"/"Ver historial
// completo"). The destination/navigation mechanism is untouched — still
// a plain <Link href>, with the caller's own className applied to the
// anchor unchanged.
//
// In the normal (non-pending) state, `children` renders exactly as it did
// before this component existed — a single unstyled <span> wrapper (no
// layout classes, so it doesn't affect box sizing) plus `relative` on the
// anchor (a no-op until something inside is absolutely positioned) are
// the only additions. Only in the pending state is a "Cargando…" overlay
// absolutely positioned on top (`inset-0`), so it never grows/shrinks the
// button — the original (now invisible, but still occupying space)
// content keeps the box exactly its normal size.
type LandingCtaLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: LinkProps["href"];
  children: ReactNode;
};

export function LandingCtaLink({ href, children, className, onClick, ...rest }: LandingCtaLinkProps) {
  const [pending, setPending] = useState(false);

  return (
    <Link
      href={href}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      className={`relative ${className ?? ""} ${pending ? "pointer-events-none opacity-80" : ""}`.trim()}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        setPending(true);
        onClick?.(event);
      }}
      {...rest}
    >
      <span className={pending ? "invisible" : undefined}>{children}</span>
      {pending && (
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center gap-1.5 whitespace-nowrap">
          <span className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-70 motion-reduce:animate-none" />
          Cargando…
        </span>
      )}
    </Link>
  );
}
