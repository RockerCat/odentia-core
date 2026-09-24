import { BuildingIcon, MapPinIcon, PhoneIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import type { ClinicGalleryPhoto } from "@/features/clinic/clinic-media-data";
import type { PrimaryLocation } from "@/features/clinic/data";
import { normalizeClinicDescription } from "@/features/clinic/description";
import { initialsOf } from "@/features/dashboard/real-format";
import type { PatientClinic } from "@/features/session/types";
import { ClinicLocationView } from "./clinic-location-view";
import { directionsUrl, formatClinicAddress, hasUsableCoordinates, teamCards } from "./clinic-profile";
import type { PortalProfessional } from "./requests-data";

// Same wa.me deep-link convention as the rest of the Portal — a manual
// deep-link only, never an automated send.
function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

const EMPTY_VALUE = "No registrado";
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
  const showMap = location !== null && hasUsableCoordinates(location);
  const directions = directionsUrl(location);
  const team = professionals.status === "ok" ? teamCards(professionals.value) : [];

  return (
    <div className="flex flex-col gap-5">
      {/* Identidad / contacto */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          {clinic?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- clinic logo can be any Storage URL, not worth Next/Image's pipeline
            <img src={clinic.logoUrl} alt={`Logo de ${name}`} className="h-11 w-auto max-w-[140px] shrink-0 object-contain" />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <BuildingIcon className="size-5" />
            </span>
          )}
          <h2 className="text-base font-semibold text-foreground">{name}</h2>
        </div>

        <dl className="mt-5 flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-label-foreground">Dirección</dt>
            <dd className="text-right font-medium">{address ?? EMPTY_VALUE}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-label-foreground">Teléfono</dt>
            <dd className="font-medium">{phone || EMPTY_VALUE}</dd>
          </div>
        </dl>

        {phone && (
          <a
            href={waLink(phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-background px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            <PhoneIcon className="size-3.5" />
            WhatsApp
          </a>
        )}
      </div>

      {/* Sobre nosotros — only when the clinic configured a description
          (Clínica → Información general); otherwise nothing is rendered. */}
      {description && (
        <div className={CARD}>
          <h2 className="text-base font-semibold">Sobre nosotros</h2>
          <p className="mt-2 whitespace-pre-line break-words text-sm text-foreground/80">{description}</p>
        </div>
      )}

      {/* Dónde estamos — only with a real address and/or coordinates. */}
      {(showMap || address) && (
        <div className={CARD}>
          <h2 className="text-base font-semibold">Dónde estamos</h2>
          {address && <p className="mt-1 text-sm text-muted-foreground">{address}</p>}
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
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5"
            >
              <MapPinIcon className="size-3.5" />
              Cómo llegar
            </a>
          )}
        </div>
      )}

      {/* Conoce nuestra clínica — only real uploaded photos; hidden when none. */}
      {gallery.status === "ok" && gallery.value.length > 0 && (
        <div className={CARD}>
          <h2 className="text-base font-semibold">Conoce nuestra clínica</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {gallery.value.map((photo, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- clinic Storage photo, not worth Next/Image's pipeline
              <img
                key={photo.id}
                src={photo.url}
                alt={`Foto ${index + 1} de ${name}`}
                loading="lazy"
                className="aspect-[4/3] w-full rounded-lg border border-border object-cover"
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
