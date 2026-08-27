"use client";

import { useState } from "react";
import { BuildingIcon } from "@/components/shell/icons";
import { useCurrentUserContext } from "@/features/session/use-current-user-context";
import { CURRENT_USER } from "@/lib/current-user";

// First step of per-clinic branding in Agenda (see CLAUDE.md Domain Model —
// SaaS for Clinics): a card above the KPI grid identifying which clinic
// this is, same bordered-card language as the rest of Agenda's right
// column. Vertical composition on purpose — the logo reads as the clinic's
// own identity, not a small inline thumbnail — with object-contain (never
// object-cover) so horizontal, square, or vertical logos alike show in
// full, uncropped. Capped well under 100% of its box (~62%, after a first
// pass at ~82%) so it stays clearly secondary to Odentia's own sidebar
// logo — Odentia is the platform brand, this is just the current clinic's
// context.
//
// This is identity/branding chrome, not Agenda feature content (unlike
// AppointmentsCard/SummaryCards, which stay on mock data) — see
// components/shell/use-shell-identity.ts for the same real-over-mock
// overlay pattern applied to the Header. Needs "use client" for that same
// hook, which this card didn't need before.
export function ClinicIdentityCard() {
  const real = useCurrentUserContext();
  const clinicName = real && real.status === "ok" ? real.clinic.name : CURRENT_USER.clinicName;
  const clinicLogoUrl = real && real.status === "ok" ? real.clinic.logoUrl : (CURRENT_USER.clinicLogoUrl ?? null);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-background px-5 py-5">
      <div className="flex h-16 w-full items-center justify-center sm:h-20">
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
      className="max-h-[62%] max-w-[62%] object-contain"
      onError={() => setFailed(true)}
    />
  );
}
