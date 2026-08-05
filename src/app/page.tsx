import { Container } from "@/components/container";

export default function Home() {
  return (
    <main className="flex flex-1 items-center">
      <Container>
        <div className="flex flex-col gap-4">
          <span className="text-sm font-medium text-primary">Odentia</span>
          <h1 className="text-4xl tracking-tight sm:text-5xl">
            Foundation ready.
          </h1>
          <p className="max-w-md text-base leading-7 text-muted-foreground">
            Global layout, typography and color system are in place. Screens
            for this prototype will be built on top of this foundation.
          </p>
        </div>
      </Container>
    </main>
  );
}
