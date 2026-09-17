"use client";

import { useState } from "react";
import { BuildingIcon } from "@/components/shell/icons";

// Same visual treatment as Agenda's own clinic-identity logo
// (src/features/dashboard/clinic-identity-card.tsx's ClinicLogo — a real
// clinic's actual branding, shown with presence): a fixed square box,
// `h-full w-full object-contain` so the full logo is always visible,
// never cropped/stretched, and the same circular `bg-primary/10` +
// BuildingIcon fallback for a clinic with no logo yet or a dead URL.
// Deliberately NOT ClinicLogoThumbnail (that component's small bordered-
// box/object-cover treatment is for a list-row/inline-heading avatar,
// never this header's own "clinic identity" presence) and deliberately
// NOT ClinicIdentityCard itself (that's a full vertical card with the
// clinic name repeated below the logo — this header already shows the
// name/date beside it, so reusing that card would duplicate the name and
// force a vertical layout this row doesn't want).
export function ClinicLogoDisplay({ clinicName, clinicLogoUrl }: { clinicName: string; clinicLogoUrl: string | null }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center">
      {!clinicLogoUrl || failed ? (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <BuildingIcon className="size-6" />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- clinic logo can be any external/Storage URL, not worth Next/Image's optimization pipeline
        <img
          src={clinicLogoUrl}
          alt={`Logo de ${clinicName}`}
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
