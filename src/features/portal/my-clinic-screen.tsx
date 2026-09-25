import { MapPinIcon, PhoneIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { resolveClinicCover, type ClinicGalleryPhoto } from "@/features/clinic/clinic-media-data";
import type { PrimaryLocation } from "@/features/clinic/data";
import { normalizeClinicDescription } from "@/features/clinic/description";
import { initialsOf } from "@/features/dashboard/real-format";
import type { PatientClinic } from "@/features/session/types";
import { ClinicLocationView } from "./clinic-location-view";
import { directionsUrl, formatClinicAddress, galleryGridClass, galleryLayout, galleryTileClass, hasUsableCoordinates, teamCards } from "./clinic-profile";
import type { PortalProfessional } from "./requests-data";

// Same wa.me deep-link convention as the rest of the Portal — a manual
// deep-link only, never an automated send.
function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

const CARD = "rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6";

// A section whose read failed says so — never replaced by empty/fake content.
export type Loaded<T> = { status: "ok"; value: T } | { status: "error" };

// Clínica — a compact, REAL profile of the patient's own clinic (every read
// in /portal/clinica/page.tsx is scoped to it server-side; no clinic_id
// ever comes from here). Read-only. Sections degrade with the data: no
// usable coordinates → no map (address/contact kept); no photos → no
// gallery; no active professionals → no team. "Horario de atención" is
// deliberately absent: Odentia only has per-professional availability, no
// clinic-wide hours to show honestly.
export function MyClinicScreen({
  clinic,
  location,
  gallery,
  professionals,
}: {
  clinic: PatientClinic | null;
  location: PrimaryLocation | null;
  gallery: Loaded<ClinicGalleryPhoto[]>;
  professionals: Loaded<PortalProfessional[]>;
}) {
  const name = clinic?.name ?? "Mi clínica";
  const phone = clinic?.phone;
  const description = normalizeClinicDescription(clinic?.description);
  const address = formatClinicAddress(location);
  const cover = resolveClinicCover(clinic?.coverUrl);
  const galleryPhotos = gallery.status === "ok" ? gallery.value : [];
  const layout = galleryLayout(galleryPhotos.length);
  const showMap = location !== null && hasUsableCoordinates(location);
  const directions = directionsUrl(location);
  const team = professionals.status === "ok" ? teamCards(professionals.value) : [];

  return (
    <div className="flex flex-col gap-5">
      {/* Portada — the clinic's own cover photo, or Odentia's generic
          dental asset when none is configured (resolveClinicCover; never
          stored as the clinic's photo). Mobile-first: a contained height
          (never the whole first screen) with identity/contact over a
          bottom-up scrim; from sm the scrim runs left→right behind the
          text column and the cover widens into a panorama. Only real
          fields are shown — a missing address/phone is simply omitted. */}
      <section aria-label={`Portada de ${name}`} className="relative isolate overflow-hidden rounded-2xl bg-neutral-800 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- clinic Storage photo / bundled fallback */}
        <img
          src={cover.src}
          alt=""
          className={`absolute inset-0 -z-10 size-full object-cover ${cover.isFallback ? "scale-[1.04] object-right" : ""}`}
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/55 to-black/10 sm:bg-gradient-to-r sm:from-black/80 sm:via-black/55 sm:to-black/5"
        />
        <div className="flex min-h-[17rem] flex-col justify-end gap-3 p-5 text-white sm:min-h-[18rem] sm:max-w-xl sm:p-7 lg:min-h-[21rem]">
          {clinic?.logoUrl && (
            <span className="inline-flex w-fit rounded-xl bg-white/95 p-2 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- clinic logo can be any Storage URL, not worth Next/Image's pipeline */}
              <img src={clinic.logoUrl} alt={`Logo de ${name}`} className="h-9 w-auto max-w-[140px] object-contain sm:h-10" />
            </span>
          )}
          <h2 className="text-2xl leading-tight font-semibold break-words drop-shadow-sm sm:text-3xl">{name}</h2>
          {(address || phone) && (
            <ul className="flex flex-col gap-1.5 text-sm text-white/90">
              {address && (
                <li className="flex items-start gap-2">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0" />
                  <span className="break-words">{address}</span>
                </li>
              )}
              {phone && (
                <li className="flex items-center gap-2">
                  <PhoneIcon className="size-4 shrink-0" />
                  <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="underline-offset-2 hover:underline">
                    {phone}
                  </a>
                </li>
              )}
            </ul>
          )}
          {phone && (
            <a
              href={waLink(phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-primary shadow-sm hover:bg-white/90 sm:w-fit"
            >
              <PhoneIcon className="size-4" />
              Escribir por WhatsApp
            </a>
          )}
        </div>
      </section>

      {/* Sobre nosotros — only when the clinic configured a description
          (Clínica → Información general); otherwise nothing is rendered. */}
      {description && (
        <div className={CARD}>
          <h2 className="text-base font-semibold">Sobre nosotros</h2>
          <p className="mt-2 whitespace-pre-line break-words text-sm text-foreground/80">{description}</p>
        </div>
      )}

      {/* Dónde estamos — only with real coordinates and/or an address to
          route to. The address itself is already on the portada. */}
      {(showMap || directions) && (
        <div className={CARD}>
          <h2 className="text-base font-semibold">Dónde estamos</h2>
          {showMap && location && (
            <div className="mt-4 overflow-hidden rounded-md">
              <ClinicLocationView latitude={location.latitude!} longitude={location.longitude!} />
            </div>
          )}
          {directions && (
            <a
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5"
            >
              <MapPinIcon className="size-3.5" />
              Cómo llegar
            </a>
          )}
        </div>
      )}

      {/* Conoce nuestra clínica — only real uploaded photos; hidden when none. */}
      {layout && (
        <div className={CARD}>
          <h2 className="text-base font-semibold">Conoce nuestra clínica</h2>
          <div className={`mt-4 ${galleryGridClass(layout)}`}>
            {galleryPhotos.map((photo, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- clinic Storage photo, not worth Next/Image's pipeline
              <img
                key={photo.id}
                src={photo.url}
                alt={`Foto ${index + 1} de ${name}`}
                loading="lazy"
                className={`w-full rounded-xl object-cover ${galleryTileClass(layout, index, galleryPhotos.length)}`}
              />
            ))}
          </div>
        </div>
      )}
      {gallery.status === "error" && (
        <div className={CARD}>
          <h2 className="text-base font-semibold">Conoce nuestra clínica</h2>
          <p className="mt-2 text-sm text-muted-foreground">No pudimos cargar las fotos de la clínica. Intenta de nuevo más tarde.</p>
        </div>
      )}

      {/* Nuestro equipo — active clinical professionals only (from
          get_my_clinic_professionals); hidden when there are none. */}
      {team.length > 0 && (
        <div className={CARD}>
          <h2 className="text-base font-semibold">Nuestro equipo</h2>
          {/* Protagonist cards: photo/initials first, then name, specialty
              and registro — each optional line only when it really exists,
              so a missing field never leaves a gap. 1 → 2 → 3 per row. */}
          <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((member) => (
              <li
                key={member.id}
                className="mx-auto flex w-full max-w-[320px] flex-col items-center rounded-2xl border border-border bg-surface px-5 py-6 text-center"
              >
                <UserAvatar
                  name={member.name}
                  initials={initialsOf(member.name)}
                  avatar_url={member.avatarUrl}
                  sizeClassName="size-24 ring-4 ring-background shadow-sm"
                  textClassName="text-2xl"
                />
                <p className="mt-4 text-base leading-snug font-semibold text-foreground">{member.name}</p>
                {member.specialty && <p className="mt-1 text-sm font-medium text-primary">{member.specialty}</p>}
                {member.licenseNumber && (
                  <p className="mt-3 border-t border-border pt-3 text-[11px] text-label-foreground">
                    Registro profesional <span className="font-medium text-foreground/70">{member.licenseNumber}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {professionals.status === "error" && (
        <div className={CARD}>
          <h2 className="text-base font-semibold">Nuestro equipo</h2>
          <p className="mt-2 text-sm text-muted-foreground">No pudimos cargar el equipo de la clínica. Intenta de nuevo más tarde.</p>
        </div>
      )}
    </div>
  );
}
