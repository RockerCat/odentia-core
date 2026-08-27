import { Logo } from "@/components/shell/logo";
import { CheckCircleIcon } from "@/components/shell/icons";

// Shown right after Paso 1's real signUp() when Supabase Auth returns a
// user but no session — email confirmation is required before continuing
// (see api.ts signUpAccount and onboarding-wizard.tsx). Not a dead end:
// clicking the confirmation link lands back on /registro with a session,
// and the wizard picks up automatically at Paso 2 (see the reentry check
// in onboarding-wizard.tsx).
export function EmailConfirmationPending({ email }: { email: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto h-12 w-auto" />

        <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircleIcon className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-foreground">Revisa tu correo para confirmar tu cuenta</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Te enviamos un enlace de confirmación a <span className="font-medium text-foreground">{email}</span>.
            Ábrelo para continuar configurando tu clínica.
          </p>
        </div>
      </div>
    </div>
  );
}
