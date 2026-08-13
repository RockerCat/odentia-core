import { CURRENT_USER } from "@/lib/current-user";

// First step of per-clinic branding in Agenda (see CLAUDE.md Domain Model —
// SaaS for Clinics): a card above the KPI grid identifying which clinic
// this is, same bordered-card language as the rest of Agenda's right
// column. Vertical composition on purpose — the logo reads as the clinic's
// main identity, not a small inline thumbnail — with object-contain
// (never object-cover) so horizontal, square, or vertical logos alike show
// in full, uncropped, at their full available width.
export function ClinicIdentityCard() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-background px-5 py-5">
      <div className="flex h-16 w-full items-center justify-center sm:h-20">
        {CURRENT_USER.clinicLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local mock asset, not worth Next/Image's optimization pipeline
          <img
            src={CURRENT_USER.clinicLogoUrl}
            alt={`Logo de ${CURRENT_USER.clinicName}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : null}
      </div>
      <p className="max-w-full truncate text-center text-sm font-medium text-foreground">
        {CURRENT_USER.clinicName}
      </p>
    </div>
  );
}
