"use client";

import { useState } from "react";
import { BuildingIcon } from "@/components/shell/icons";

// First step of per-clinic branding in Agenda (see CLAUDE.md Domain Model —
// SaaS for Clinics): a card above the KPI grid identifying which clinic
// this is, same bordered-card language as the rest of Agenda's right
// column. Vertical composition on purpose — the logo reads as the clinic's
// own identity, not a small inline thumbnail.
//
// The logo box is a fixed square (not a wide/short rectangle) with the img
// sized to h-full w-full object-contain, so object-contain does real work:
// a horizontal logo is bound by the box's width (full width, auto height);
// a square or vertical logo is bound by its height (full height, auto
// width) and reads noticeably larger than a horizontal one would in the
// same box — without ever cropping or stretching either shape. Sized well
// under Odentia's own sidebar logo so it stays clearly secondary — Odentia
// is the platform brand, this is just the current clinic's context.
//
// clinicName/clinicLogoUrl come from the caller's already-resolved
// resolveClinicContext() (see src/app/agenda/page.tsx) — never a second,
// client-side re-resolve with a mock fallback (that pattern, still used by
// components/shell/use-shell-identity.ts for the Header, briefly shows/
// permanently falls back to mock clinic branding on a slow or failed
// client fetch; this card's only caller already has the real value one
// request earlier, so there's no reason to risk that here).
export function ClinicIdentityCard({
  clinicName,
  clinicLogoUrl,
}: {
  clinicName: string;
  clinicLogoUrl: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-background px-5 py-5">
      <div className="flex h-20 w-20 items-center justify-center sm:h-24 sm:w-24">
        <ClinicLogo clinicName={clinicName} clinicLogoUrl={clinicLogoUrl} />
      </div>
      <p className="max-w-full truncate text-center text-sm font-medium text-foreground">{clinicName}</p>
    </div>
  );
}

function ClinicLogo({ clinicName, clinicLogoUrl }: { clinicName: string; clinicLogoUrl: string | null }) {
  // A real clinic without an uploaded logo yet (clinic.logo_url null) is
  // the common case — this must never fall through to the mock Sonrisa
  // Perfecta image. onError also catches a stale/broken logo URL the same
  // way UserAvatar already does for profile photos.
  const [failed, setFailed] = useState(false);

  if (!clinicLogoUrl || failed) {
    return (
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <BuildingIcon className="size-6" />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- clinic logo can be any external/Storage URL, not worth Next/Image's optimization pipeline
    <img
      src={clinicLogoUrl}
      alt={`Logo de ${clinicName}`}
      className="h-full w-full object-contain"
      onError={() => setFailed(true)}
    />
  );
}
