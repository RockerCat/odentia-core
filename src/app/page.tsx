import { AppShell } from "@/components/shell/app-shell";

export default function Home() {
  return (
    <AppShell>
      <div className="flex min-h-[60vh] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        Page content goes here.
      </div>
    </AppShell>
  );
}
