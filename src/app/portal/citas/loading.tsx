import { PortalShell } from "@/components/shell/portal-shell";

// Skeleton while /portal/citas' real reads resolve — same shape as the
// approved Próxima cita card (Profesional | Datos | Historial), never
// mock/previous data.
export default function PortalAppointmentsLoading() {
  const bar = "animate-pulse rounded bg-foreground/10";
  return (
    <PortalShell activeNavLabel="Mis citas">
      <div
        aria-busy="true"
        aria-label="Cargando tus citas"
        className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6 md:mx-auto md:w-full md:max-w-4xl"
      >
        <span className={`block h-4 w-28 ${bar}`} />
        <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,240px)_1fr_minmax(0,260px)]">
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border p-4">
            <span className="size-20 animate-pulse rounded-full bg-foreground/10" />
            <span className={`h-3.5 w-32 ${bar}`} />
            <span className={`h-3 w-24 ${bar}`} />
          </div>
          <div className="flex flex-col gap-3">
            <span className={`h-6 w-48 ${bar}`} />
            <span className={`h-3.5 w-32 ${bar}`} />
            <span className={`mt-3 h-10 w-full ${bar}`} />
          </div>
          <div className="flex flex-col gap-2 rounded-xl bg-surface p-4">
            <span className={`h-3.5 w-32 ${bar}`} />
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-9 w-full ${bar}`} />
            ))}
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
