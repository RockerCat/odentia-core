"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/shell/logo";
import { UserAvatar } from "@/components/user-avatar";
import { DEMO_USERS, type DemoUser } from "@/features/auth/demo-users";
import { writeSession } from "@/features/auth/session";

// Mock login for demoing Odentia in production without a real backend — see
// src/features/auth/session.ts and src/dev/role-context.tsx for how the
// selected role persists and drives the rest of the app.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectDemoUser = (user: DemoUser) => {
    setEmail(user.email);
    setPassword(user.password);
    setError(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const match = DEMO_USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
    );
    if (!match) {
      setError("No reconocemos ese usuario. Usa uno de los accesos de demostración.");
      return;
    }
    writeSession({ role: match.role });
    router.push("/agenda");
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-12 w-auto" />
          <h1 className="text-xl font-semibold text-foreground">Bienvenido a Odentia</h1>
          <p className="text-sm text-muted-foreground">Inicia sesión para gestionar tu clínica.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-background p-5 shadow-sm"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground/80">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="tucorreo@clinica.com"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground/80">Contraseña</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="••••••••"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            type="submit"
            className="mt-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Iniciar sesión
          </button>
        </form>

        <div className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Acceso de demostración
            </p>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-2">
            {DEMO_USERS.map((user) => (
              <button
                key={user.role}
                type="button"
                onClick={() => selectDemoUser(user)}
                className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-left hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <UserAvatar name={user.name} initials={user.initials} avatar_url={user.avatar_url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {user.roleLabel} · {user.contextLabel}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Selecciona un perfil para completar el formulario y luego pulsa &quot;Iniciar sesión&quot;.
          </p>
        </div>
      </div>
    </div>
  );
}
