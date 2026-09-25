import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
// Before importing: UserAvatar's "our Storage" prefix is read at module load.
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://p.supabase.co");

const { ImageLightbox, wrapIndex } = await import("./image-lightbox");
const { ClinicCoverSection } = await import("./clinic-cover-section");
const { ClinicGallerySection } = await import("./clinic-gallery-section");

// /clinica → Portal público: the REAL cover and gallery photos can be viewed
// large; the generic fallback cover never is.

const STORAGE = "https://p.supabase.co/storage/v1/object/public/clinic-media";
const lightbox = (count: number, index = 0) =>
  renderToStaticMarkup(
    createElement(ImageLightbox, {
      images: Array.from({ length: count }, (_, i) => ({ src: `${STORAGE}/c1/gallery/g${i}`, alt: `Foto ${i + 1} de la clínica` })),
      index,
      onIndexChange: () => {},
      onClose: () => {},
    }),
  );

describe("ImageLightbox", () => {
  it("prev/next wrap around the gallery", () => {
    expect(wrapIndex(-1, 5)).toBe(4);
    expect(wrapIndex(5, 5)).toBe(0);
    expect(wrapIndex(2, 5)).toBe(2);
  });

  it("an accessible modal dialog with a Cerrar button; the image fits the viewport (object-contain)", () => {
    const html = lightbox(1);
    expect(html).toMatch(/role="dialog"[^>]*aria-modal="true"[^>]*aria-label="Foto 1 de la clínica"/);
    expect(html).toContain('aria-label="Cerrar"');
    expect(html).toContain("max-h-[85dvh]");
    expect(html).toContain("object-contain");
    // A single image: no navigation, no counter.
    expect(html).not.toContain("Foto siguiente");
    expect(html).not.toMatch(/\d+ \/ \d+/);
  });

  it("several images: prev/next + counter for the current one", () => {
    const html = lightbox(5, 2);
    expect(html).toContain('aria-label="Foto anterior"');
    expect(html).toContain('aria-label="Foto siguiente"');
    expect(html).toMatch(/>3(<!-- -->)? \/ (<!-- -->)?5</);
    expect(html).toContain('alt="Foto 3 de la clínica"');
  });

  it("Esc closes and ←/→ navigate (keyboard handler)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "image-lightbox.tsx"), "utf8");
    expect(src).toContain('if (e.key === "Escape") onClose();');
    expect(src).toContain('many && e.key === "ArrowLeft"');
    expect(src).toContain('many && e.key === "ArrowRight"');
  });

  it("a Storage photo is served by next/image at viewport width — a large variant, never the thumbnail or the raw original", () => {
    const html = lightbox(1);
    expect(html).toContain('sizes="92vw"');
    expect(html).toMatch(/srcSet="[^"]*\/_next\/image\?url=[^"]*w=3840/);
  });
});

describe("Portal público thumbnails open the viewer", () => {
  it("each gallery photo is a real 'Ampliar' button, separate from its Eliminar button", () => {
    const html = renderToStaticMarkup(
      createElement(
        ToastProvider,
        null,
        createElement(ClinicGallerySection, {
          clinicId: "c1",
          initialPhotos: [0, 1].map((i) => ({ id: `g${i}`, storagePath: `c1/gallery/g${i}`, url: `${STORAGE}/c1/gallery/g${i}`, createdAt: "2026-09-25" })),
        }),
      ),
    );
    expect(html).toContain('aria-label="Ampliar foto 1 de la clínica"');
    expect(html).toContain('aria-label="Ampliar foto 2 de la clínica"');
    expect(html.match(/>Eliminar<\/button>/g)?.length).toBe(2);
    expect(html).toContain("cursor-zoom-in");
  });

  it("a real cover is enlargeable; the generic Odentia fallback is not (it keeps picking a file)", () => {
    const render = (initialCoverUrl: string | null) =>
      renderToStaticMarkup(createElement(ToastProvider, null, createElement(ClinicCoverSection, { clinicId: "c1", initialCoverUrl })));
    const real = render(`${STORAGE}/c1/cover?v=1`);
    expect(real).toContain('aria-label="Ampliar foto de portada"');
    expect(real).toContain("Cambiar foto");
    const fallback = render(null);
    expect(fallback).not.toContain("Ampliar foto de portada");
    expect(fallback).not.toContain("cursor-zoom-in");
    expect(fallback).toContain('aria-label="Seleccionar foto de portada"');
  });
});
