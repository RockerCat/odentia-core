import { BuildingIcon, PhoneIcon } from "@/components/shell/icons";
import type { PrimaryLocation } from "@/features/clinic/data";
import type { PatientClinic } from "@/features/session/types";

// Same wa.me deep-link convention my-appointments-screen.tsx's own
// waLink already uses for context.clinic.phone (not imported — that file
// is out of this task's scope, and this is the same 2-line helper, not
// worth a shared module for) — a manual deep-link only, never an
// automated send.
function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

const EMPTY_VALUE = "No registrado";

// Real sede principal address, built from the same clinic_locations
// fields Clínica staff's own PrimaryLocationSection edits (address/city/
// state) — never a demo string. Joins only the parts that actually exist;
// a location with every field empty, or no primary location at all,
// resolves to the honest EMPTY_VALUE instead of a blank/garbled line.
function formatAddress(location: PrimaryLocation | null): string {
  if (!location) return EMPTY_VALUE;
  const parts = [location.address, location.city, location.state].filter((part): part is string => Boolean(part?.trim()));
  return parts.length > 0 ? parts.join(", ") : EMPTY_VALUE;
}

// Clínica — real identity/contact only (see /portal/clinica/page.tsx:
// resolvePatientContext() → context.clinic for nombre/teléfono, real
// fetchPrimaryLocation() for dirección, both already scoped to the
// authenticated patient's own clinic — no clinic_id ever comes from this
// component). Dirección/mapa/"Cómo llegar"/horarios beyond what's here are
// a later addition, not this one. Read-only — a Patient never edits clinic
// data from the Portal.
export function MyClinicScreen({
  clinic,
  location,
}: {
  clinic: PatientClinic | null;
  location: PrimaryLocation | null;
}) {
  const name = clinic?.name ?? "Mi clínica";
  const phone = clinic?.phone;
  const address = formatAddress(location);

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <BuildingIcon className="size-5" />
        </span>
        <h2 className="text-base font-semibold text-foreground">{name}</h2>
      </div>

      <dl className="mt-5 flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-label-foreground">Dirección</dt>
          <dd className="font-medium">{address}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-label-foreground">Teléfono</dt>
          <dd className="font-medium">{phone || EMPTY_VALUE}</dd>
        </div>
      </dl>

      {/* Only when there's a real number to build a wa.me link from — a
          missing/empty phone never renders a dead or fabricated WhatsApp
          button. */}
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
  );
}
