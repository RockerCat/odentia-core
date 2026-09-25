import { MapPinIcon, PhoneIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { resolveClinicCover, type ClinicGalleryPhoto } from "@/features/clinic/clinic-media-data";
import type { PrimaryLocation } from "@/features/clinic/data";
import { normalizeClinicDescription } from "@/features/clinic/description";
import { initialsOf } from "@/features/dashboard/real-format";
import type { PatientClinic } from "@/features/session/types";
import { ClinicLocationView } from "./clinic-location-view";
import { directionsUrl, formatClinicAddress, galleryGridClass, galleryLayout, galleryTileClass, hasUsableCoordinates, TEAM_GRID_CLASS, type TeamCard } from "./clinic-profile";

// Same wa.me deep-link convention as the rest of the Portal — a manual
// deep-link only, never an automated send.
function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

// One continuous page, not a stack of admin cards: sections sit directly
// on the page background under a shared title style; only real content
// (map, photos, professionals) gets its own rounded surface.
const SECTION = "flex flex-col gap-3 sm:gap-4";
const SECTION_TITLE = "text-lg font-semibold text-foreground sm:text-xl";

// A section whose read failed says so — never replaced by empty/fake content.
export type Loaded<T> = { status: "ok"; value: T } | { status: "error" };

// Clínica — a compact, REAL profile of the patient's own clinic (every read
// in /portal/clinica/page.tsx is scoped to it server-side; no clinic_id
// ever comes from here). Read-only. Sections degrade with the data: no
// usable coordinates → no map (address/contact kept); no photos → no
// gallery; no active team members → no team. "Horario de atención" is
// deliberately absent: Odentia only has per-professional availability, no
// clinic-wide hours to show honestly.
export function MyClinicScreen({
  clinic,
  location,
  gallery,
  team: teamResult,
}: {
  clinic: PatientClinic | null;
  location: PrimaryLocation | null;
  gallery: Loaded<ClinicGalleryPhoto[]>;
  team: Loaded<TeamCard[]>;
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
  const team = teamResult.status === "ok" ? teamResult.value : [];

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
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
          <h1 className="text-2xl leading-tight font-semibold break-words drop-shadow-sm sm:text-3xl">{name}</h1>
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
        <section className={SECTION}>
          <h2 className={SECTION_TITLE}>Sobre nosotros</h2>
          <p className="max-w-prose whitespace-pre-line break-words text-[15px] leading-relaxed text-foreground/80">{description}</p>
        </section>
      )}

      {/* Dónde estamos — only with real coordinates and/or an address to
          route to. The address itself is already on the portada. */}
      {(showMap || directions) && (
        <section className={SECTION}>
          <h2 className={SECTION_TITLE}>Dónde estamos</h2>
          {showMap && location && (
            <div className="overflow-hidden rounded-2xl border border-border">
              <ClinicLocationView latitude={location.latitude!} longitude={location.longitude!} />
            </div>
          )}
          {directions && (
            <a
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground/80 hover:bg-foreground/5 sm:w-fit"
            >
              <MapPinIcon className="size-4" />
              Cómo llegar
            </a>
          )}
        </section>
      )}

      {/* Conoce nuestra clínica — only real uploaded photos; hidden when none. */}
      {layout && (
        <section className={SECTION}>
          <h2 className={SECTION_TITLE}>Conoce nuestra clínica</h2>
          <div
            className={galleryGridClass(layout)}
            {...(layout === "editorial" && { role: "region", "aria-label": `Fotos de ${name}`, tabIndex: 0 })}
          >
            {galleryPhotos.map((photo, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- clinic Storage photo, not worth Next/Image's pipeline
              <img
                key={photo.id}
                src={photo.url}
                alt={`Foto ${index + 1} de ${name}`}
                loading="lazy"
                className={`rounded-2xl object-cover ${galleryTileClass(layout, index, galleryPhotos.length)}`}
              />
            ))}
          </div>
        </section>
      )}
      {gallery.status === "error" && (
        <section className={SECTION}>
          <h2 className={SECTION_TITLE}>Conoce nuestra clínica</h2>
          <p className="text-sm text-muted-foreground">No pudimos cargar las fotos de la clínica. Intenta de nuevo más tarde.</p>
        </section>
      )}

      {/* Nuestro equipo — the clinic's whole active team (teamCards over
          get_my_clinic_team), her "odontólogo habitual" first with a badge
          when there is one; hidden when there's nobody. The portrait (real
          photo, or the same-size initials via UserAvatar — never a
          stock/mock photo) leads; then name and either the clinical
          specialty/registro or the human role, each only when real. */}
      {team.length > 0 && (
        <section className={SECTION}>
          <h2 className={SECTION_TITLE}>Nuestro equipo</h2>
          <ul className={TEAM_GRID_CLASS}>
            {team.map((member) => (
              <li
                key={member.id}
                className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-background shadow-sm ${
                  member.isUsualDentist ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
                }`}
              >
                {member.isUsualDentist && (
                  <span className="absolute top-2 left-2 z-10 max-w-[calc(100%-1rem)] rounded-full bg-primary px-2 py-0.5 text-[10px] leading-tight font-semibold text-white shadow-sm sm:text-[11px]">
                    Tu odontólogo habitual
                  </span>
                )}
                <UserAvatar
                  name={member.name}
                  initials={initialsOf(member.name)}
                  avatar_url={member.avatarUrl}
                  shapeClassName="rounded-none"
                  sizeClassName="aspect-[4/5] w-full object-top"
                  // Real card widths (TEAM_GRID_CLASS: 2 → 3 → 4 columns;
                  // measured ~166 / ~149 / ~232px at 375 / 768 / 1280)
                  // × COVER_CROP_ALLOWANCE (2) for the 4:5 object-cover crop.
                  sizes="(min-width: 1024px) 480px, (min-width: 768px) 320px, (min-width: 640px) 66vw, 100vw"
                  width={240}
                  height={300}
                  textClassName="text-4xl font-semibold"
                />
                <div className="flex min-w-0 flex-col gap-0.5 p-3 sm:p-4">
                  <p className="line-clamp-2 text-sm leading-snug font-semibold break-words text-foreground sm:text-base">{member.name}</p>
                  {member.specialty && <p className="line-clamp-2 text-xs font-medium break-words text-primary sm:text-sm">{member.specialty}</p>}
                  {member.roleLabel && <p className="text-xs font-medium text-muted-foreground sm:text-sm">{member.roleLabel}</p>}
                  {member.licenseNumber && (
                    <p className="mt-1.5 text-[11px] leading-snug break-words text-label-foreground">
                      Registro profesional <span className="font-medium text-foreground/70">{member.licenseNumber}</span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {teamResult.status === "error" && (
        <section className={SECTION}>
          <h2 className={SECTION_TITLE}>Nuestro equipo</h2>
          <p className="text-sm text-muted-foreground">No pudimos cargar el equipo de la clínica. Intenta de nuevo más tarde.</p>
        </section>
      )}
    </div>
  );
}
