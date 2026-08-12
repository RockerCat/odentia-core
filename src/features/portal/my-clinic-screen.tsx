import { BuildingIcon, PhoneIcon } from "@/components/shell/icons";
import { MY_CLINIC } from "./mock-data";

function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

// Clínica — for now just the same contact info the old "Mi clínica" card
// showed, as its own screen. Mock only has one clinic (see MY_CLINIC), so
// this stays a single-clinic view with a fixed nav label (see
// portal-shell.tsx's comment on PORTAL_NAV_ITEMS) rather than a picker.
// Dirección/mapa/Cómo llegar/horarios are a later addition, not this one.
export function MyClinicScreen() {
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <BuildingIcon className="size-5" />
        </span>
        <h2 className="text-base font-semibold text-foreground">{MY_CLINIC.name}</h2>
      </div>

      <dl className="mt-5 flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-label-foreground">Dirección</dt>
          <dd className="font-medium">{MY_CLINIC.address}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-label-foreground">Teléfono</dt>
          <dd className="font-medium">{MY_CLINIC.phone}</dd>
        </div>
      </dl>

      <a
        href={waLink(MY_CLINIC.phone)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-background px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
      >
        <PhoneIcon className="size-3.5" />
        WhatsApp
      </a>
    </div>
  );
}
