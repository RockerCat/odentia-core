"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type UserAvatarProps = {
  name: string;
  initials: string;
  // Intentionally snake_case: mirrors the future backend/DB column name
  // directly, so wiring up real data later needs no translation layer.
  avatar_url?: string;
  sizeClassName?: string;
  textClassName?: string;
  // Circle by default; a large portrait (e.g. Portal "Nuestro equipo")
  // can pass its own shape — photo and initials always share it.
  shapeClassName?: string;
  // next/image hints for a photo NOT sized by a `size-N` class (e.g. a
  // full-width card portrait): rendered widths per breakpoint already
  // × COVER_CROP_ALLOWANCE, and the intrinsic box (aspect ratio). A
  // `size-N` avatar derives both.
  sizes?: string;
  width?: number;
  height?: number;
};

// Our own Supabase Storage photos (public clinic-media bucket) are the only
// URLs next.config.ts lets next/image optimize — anything else (dev
// fixtures, a local preview) stays a plain <img>.
const OPTIMIZABLE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "\u0000"}/storage/v1/object/public/clinic-media/`;

export function isOptimizableAvatarUrl(url: string): boolean {
  return url.startsWith(OPTIMIZABLE_PREFIX);
}

// object-cover crops the source into the avatar's box, but srcset picks a
// variant by WIDTH only — so a landscape photo in a square box would get a
// variant whose HEIGHT is too short and be stretched (measured: 64×43
// served for a 64px box). Asking for 2× the box width keeps ≥ 1 source px
// per device px for sources up to 2:1 (4:5 card: up to 1.6:1) — still a
// few KB, never the multi-MB original.
export const COVER_CROP_ALLOWANCE = 2;

// Rendered CSS size of a `size-N` (Tailwind: N × 4px) or `size-[Npx]`
// avatar — the real layout; `sizes` is that × COVER_CROP_ALLOWANCE (the
// browser's srcset pick then adds DPR). null when the class doesn't fix a size.
export function avatarPixelSize(sizeClassName: string): number | null {
  const scale = sizeClassName.match(/(?:^|\s)size-(\d+(?:\.\d+)?)(?=\s|$)/);
  if (scale) return Number(scale[1]) * 4;
  const arbitrary = sizeClassName.match(/(?:^|\s)size-\[(\d+)px\](?=\s|$)/);
  return arbitrary ? Number(arbitrary[1]) : null;
}

// The single, canonical avatar component for every user in the system
// (Superadmin, Clinic Admin, Dentist, Assistant, Patient).
// Do not create another avatar implementation — extend this one instead.
export function UserAvatar({
  name,
  initials,
  avatar_url,
  sizeClassName = "size-9",
  textClassName = "text-xs",
  shapeClassName = "rounded-full",
  sizes,
  width,
  height,
}: UserAvatarProps) {
  // Falls back to initials if the photo fails to load (missing file, dead
  // URL, offline) — this is what actually makes the component safe to
  // wire up to a real backend later, not just the presence of avatar_url.
  const [imageFailed, setImageFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // The <img> is server-rendered with `src` already set, so the browser
    // can start — and finish failing — loading it before hydration
    // attaches onError below. Check its already-resolved state once
    // mounted so a failure that happened that early isn't missed.
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setImageFailed(true);
    }
  }, [avatar_url]);

  if (avatar_url && !imageFailed) {
    const className = `${sizeClassName} shrink-0 ${shapeClassName} object-cover`;
    const fixed = avatarPixelSize(sizeClassName);
    const imageSizes = sizes ?? (fixed ? `${fixed * COVER_CROP_ALLOWANCE}px` : undefined);
    const intrinsicWidth = width ?? fixed;
    const intrinsicHeight = height ?? fixed;
    if (imageSizes && intrinsicWidth && intrinsicHeight && isOptimizableAvatarUrl(avatar_url)) {
      // Same single source photo everywhere; next/image serves a variant
      // matching the rendered size (srcset w/ `sizes`, HiDPI included).
      return (
        <Image
          ref={imgRef}
          src={avatar_url}
          alt={name}
          sizes={imageSizes}
          width={intrinsicWidth}
          height={intrinsicHeight}
          className={className}
          onError={() => setImageFailed(true)}
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element -- non-Storage URL (fixture/preview): nothing to optimize
      <img ref={imgRef} src={avatar_url} alt={name} className={className} onError={() => setImageFailed(true)} />
    );
  }

  return (
    <span
      className={`flex ${sizeClassName} shrink-0 items-center justify-center ${shapeClassName} bg-primary/10 ${textClassName} font-medium text-primary`}
    >
      {initials}
    </span>
  );
}
