import Link from "next/link";
import { CheckCircleIcon } from "@/components/shell/icons";
import { Logo } from "@/components/shell/logo";

// The app shells still gate on the mock session (see CLAUDE.md, section
// 23: login/session/route guards stay mock until a later task), so unlike
// the demo version of this screen, "Ir a Odentia" can't drop the user
// straight into /agenda with their real Supabase identity without faking a
// mock session — a hack this task explicitly rules out. The card itself
// (logo/checkmark, clinic name, copy) is unchanged from the approved demo;
// only the CTA's destination and label change.
export function SuccessStep({
  clinicName,
  logoUrl,
  logoWarning,
}: {
  clinicName: string;
  logoUrl: string | null;
  logoWarning: boolean;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto h-12 w-auto" />

        <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8">
          {logoUrl ? (
            <span className="mx-auto flex size-14 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- clinics.logo_url, a real Supabase Storage public URL */}
              <img src={logoUrl} alt="Logo de la clínica" className="max-h-full max-w-full object-contain" />
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

          {logoWarning && (
            <p className="mt-3 text-xs text-danger">
              Tu clínica fue creada, pero no pudimos guardar el logo. Podrás agregarlo después.
            </p>
          )}

          <Link
            href="/"
            className="mt-6 block w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Volver al inicio
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            Muy pronto podrás iniciar sesión con tu cuenta real. Mientras tanto, puedes explorar Odentia con nuestro
            acceso de demostración.
          </p>
        </div>
      </div>
    </div>
  );
}
