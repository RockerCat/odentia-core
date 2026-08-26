"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { INPUT_CLASS } from "./field-classes";
import { type AccountFormData } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type Errors = Partial<Record<keyof AccountFormData, string>>;

function validate(data: AccountFormData): Errors {
  const errors: Errors = {};
  if (!data.firstName.trim()) errors.firstName = "Ingresa tu nombre.";
  if (!data.lastName.trim()) errors.lastName = "Ingresa tu apellido.";
  if (!data.email.trim()) errors.email = "Ingresa tu correo electrónico.";
  else if (!EMAIL_RE.test(data.email.trim())) errors.email = "Ingresa un correo electrónico válido.";
  if (!data.password) errors.password = "Ingresa una contraseña.";
  else if (data.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (data.confirmPassword !== data.password) errors.confirmPassword = "Las contraseñas no coinciden.";
  return errors;
}

export function AccountStep({
  initial,
  onContinue,
}: {
  initial: AccountFormData;
  onContinue: (data: AccountFormData) => void;
}) {
  const [data, setData] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});

  const update = (patch: Partial<AccountFormData>) => setData((prev) => ({ ...prev, ...patch }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const nextErrors = validate(data);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) onContinue(data);
  };

  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground">Crea tu cuenta</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Empecemos con tus datos para crear tu espacio en Odentia.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-5 flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="firstName" error={errors.firstName}>
            <input
              id="firstName"
              className={INPUT_CLASS}
              value={data.firstName}
              onChange={(e) => update({ firstName: e.target.value })}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Apellido" htmlFor="lastName" error={errors.lastName}>
            <input
              id="lastName"
              className={INPUT_CLASS}
              value={data.lastName}
              onChange={(e) => update({ lastName: e.target.value })}
              autoComplete="family-name"
            />
          </Field>
        </div>

        <Field label="Correo electrónico" htmlFor="email" error={errors.email}>
          <input
            id="email"
            type="email"
            className={INPUT_CLASS}
            value={data.email}
            onChange={(e) => update({ email: e.target.value })}
            autoComplete="email"
            placeholder="tucorreo@clinica.com"
          />
        </Field>

        <Field label="Contraseña" htmlFor="password" error={errors.password}>
          <input
            id="password"
            type="password"
            className={INPUT_CLASS}
            value={data.password}
            onChange={(e) => update({ password: e.target.value })}
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </Field>

        <Field label="Confirmar contraseña" htmlFor="confirmPassword" error={errors.confirmPassword}>
          <input
            id="confirmPassword"
            type="password"
            className={INPUT_CLASS}
            value={data.confirmPassword}
            onChange={(e) => update({ confirmPassword: e.target.value })}
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </Field>

        <button
          type="submit"
          className="mt-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Continuar
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Iniciar sesión
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground/80">{label}</span>
      {children}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}
