"use client";

import { useEffect, useRef, useState } from "react";
import { BuildingIcon } from "@/components/shell/icons";

// Small, read-only clinic logo — Platform's own listing/detail (never
// upload; see clinic-form.tsx/prospect-conversion-section.tsx for that).
// Same broken-image resilience as UserAvatar (src/components/user-avatar.tsx):
// a dead/expired logo_url falls back cleanly instead of a broken-image
// icon, never a layout shift or error. The "no logo" fallback is
// BuildingIcon, matching the SAME convention /clinica's own logo box
// already established (src/features/clinic/clinic-settings-screen.tsx) —
// never invented initials, since a real, reusable clinic-logo fallback
// already exists in this codebase.
export function ClinicLogoThumbnail({
  logoUrl,
  name,
  sizeClassName = "size-8",
  fit = "cover",
  iconSizeClassName = "size-4",
}: {
  logoUrl: string | null;
  name: string;
  sizeClassName?: string;
  // "cover" (default, used by the listing's small thumbnail) crops to
  // fill; "contain" (the detail header's larger logo) shows the whole
  // image uncropped, same reasoning as /clinica's own logo box
  // (clinic-settings-screen.tsx, which also uses object-contain).
  fit?: "cover" | "contain";
  iconSizeClassName?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setImageFailed(true);
    }
  }, [logoUrl]);

  if (logoUrl && !imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small decorative thumbnail, not worth Next/Image's optimization pipeline
      <img
        ref={imgRef}
        src={logoUrl}
        alt={`Logo de ${name}`}
        className={`${sizeClassName} shrink-0 rounded-md border border-border ${fit === "contain" ? "object-contain" : "object-cover"}`}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      className={`flex ${sizeClassName} shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground`}
      aria-hidden="true"
    >
      <BuildingIcon className={iconSizeClassName} />
    </span>
  );
}
