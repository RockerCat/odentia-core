"use client";

import Image from "next/image";
import { useEffect } from "react";
import { ChevronIcon, CloseIcon, SearchIcon } from "@/components/shell/icons";
import { isOptimizableAvatarUrl } from "@/components/user-avatar";

export type LightboxImage = { src: string; alt: string };

// Wraps a gallery index (prev from the first → last, next from the last →
// first). Pure, so it's unit-tested.
export function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

// Full-screen viewer for the clinic's REAL public media in /clinica →
// Portal público (cover, gallery). Image fits the viewport (object-contain,
// never cropped or upscaled past its box); closes on the button, Esc or a
// click on the backdrop; with several images, prev/next buttons + ←/→.
// Our Storage photos go through next/image at viewport width (a large,
// sharp variant — never the thumbnail, never the multi-MB original).
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const many = images.length > 1;
  const current = images[wrapIndex(index, images.length)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (many && e.key === "ArrowLeft") onIndexChange(wrapIndex(index - 1, images.length));
      else if (many && e.key === "ArrowRight") onIndexChange(wrapIndex(index + 1, images.length));
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [index, images.length, many, onClose, onIndexChange]);

  if (!current) return null;

  const navButton = "absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white";

  return (
    <div role="dialog" aria-modal="true" aria-label={current.alt} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        autoFocus
        className="absolute top-3 right-3 z-10 flex size-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white"
      >
        <CloseIcon className="size-5" />
      </button>

      {/* The image box: clicks on the photo itself don't close. */}
      <div className="relative h-full max-h-[85dvh] w-full max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        {isOptimizableAvatarUrl(current.src) ? (
          <Image key={current.src} src={current.src} alt={current.alt} fill sizes="92vw" className="object-contain" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- non-Storage URL: nothing to optimize
          <img key={current.src} src={current.src} alt={current.alt} className="absolute inset-0 size-full object-contain" />
        )}
      </div>

      {many && (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange(wrapIndex(index - 1, images.length));
            }}
            className={`${navButton} left-3`}
          >
            <ChevronIcon className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Foto siguiente"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange(wrapIndex(index + 1, images.length));
            }}
            className={`${navButton} right-3`}
          >
            <ChevronIcon className="size-5 rotate-180" />
          </button>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
            {wrapIndex(index, images.length) + 1} / {images.length}
          </p>
        </>
      )}
    </div>
  );
}

// Discreet "can be enlarged" affordance on a real photo thumbnail — always
// visible (not hover-only), small, in a corner.
export function ZoomBadge() {
  return (
    <span aria-hidden className="pointer-events-none absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/45 text-white">
      <SearchIcon className="size-3.5" />
    </span>
  );
}
