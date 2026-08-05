"use client";

import { useEffect, useRef, useState } from "react";

type UserAvatarProps = {
  name: string;
  initials: string;
  // Intentionally snake_case: mirrors the future backend/DB column name
  // directly, so wiring up real data later needs no translation layer.
  avatar_url?: string;
  sizeClassName?: string;
  textClassName?: string;
};

// The single, canonical avatar component for every user in the system
// (Superadmin, Clinic Admin, Dentist, Assistant). Not used for patients.
// Do not create another avatar implementation — extend this one instead.
export function UserAvatar({
  name,
  initials,
  avatar_url,
  sizeClassName = "size-9",
  textClassName = "text-xs",
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
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small decorative avatar, not worth Next/Image's optimization pipeline
      <img
        ref={imgRef}
        src={avatar_url}
        alt={name}
        className={`${sizeClassName} shrink-0 rounded-full object-cover`}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      className={`flex ${sizeClassName} shrink-0 items-center justify-center rounded-full bg-primary/10 ${textClassName} font-medium text-primary`}
    >
      {initials}
    </span>
  );
}
