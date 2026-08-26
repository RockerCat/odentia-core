import { CheckCircleIcon } from "@/components/shell/icons";
import { Logo } from "@/components/shell/logo";

export function SuccessStep({
  clinicName,
  logoPreviewUrl,
  onEnter,
}: {
  clinicName: string;
  logoPreviewUrl: string | null;
  onEnter: () => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto h-12 w-auto" />

        <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8">
          {logoPreviewUrl ? (
            <span className="mx-auto flex size-14 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, never persisted (see ClinicLogo in types.ts) */}
              <img src={logoPreviewUrl} alt="Logo de la clínica" className="max-h-full max-w-full object-contain" />
            </span>
          ) : (
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircleIcon className="size-6" />
            </span>
          )}
          <h1 className="mt-4 text-lg font-semibold text-foreground">
            {clinicName.trim() ? `¡${clinicName.trim()} está lista!` : "¡Tu clínica está lista!"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ya configuramos tu espacio en Odentia. Ahora puedes comenzar a organizar tu agenda,
            pacientes y equipo.
          </p>

          <button
            type="button"
            onClick={onEnter}
            className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Ir a Odentia
          </button>
        </div>
      </div>
    </div>
  );
}
