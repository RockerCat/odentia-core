"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { submitCommercialProspect, validateCommercialProspectForm, type CommercialProspectErrors } from "./actions";
import { EMPTY_COMMERCIAL_PROSPECT, type CommercialProspectFormData } from "./types";

// Same visual language as /login and /registro's own form fields (see
// src/features/onboarding/field-classes.ts) — duplicated as a one-line
// constant rather than importing across features for a single class
// string.
const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60";

type Status = "idle" | "submitting" | "success";

// /demo's real Prospecto Comercial capture — the one form in this
// checkpoint's funnel (Landing → /demo → Prospecto → seguimiento
// comercial, see CLAUDE.md). Submitting this form never creates a
// Supabase Auth user, never asks for a password, and never signs anyone
// in — see actions.ts's own comment on why. On success this renders an
// inline confirmation in place of the form; it never redirects to
// /registro, /login, or /agenda.
export function ProspectForm() {
  const [data, setData] = useState<CommercialProspectFormData>(EMPTY_COMMERCIAL_PROSPECT);
  const [errors, setErrors] = useState<CommercialProspectErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Passive honeypot: a real visitor never sees or fills this field (it's
  // visually hidden and skipped in the natural tab order). A bot that
  // fills every input it finds trips it. Never presented as a complete
  // anti-spam solution — just a zero-dependency, zero-friction first
  // filter, same "don't add infra we don't need yet" spirit as the rest
  // of this checkpoint. A tripped honeypot shows the normal success
  // state without ever calling submit_commercial_prospect().
  const [website, setWebsite] = useState("");

  const update = (patch: Partial<CommercialProspectFormData>) => setData((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;

    const nextErrors = validateCommercialProspectForm(data);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (website.trim() !== "") {
      setStatus("success");
      return;
    }

    setStatus("submitting");
    setSubmitError(null);
    const outcome = await submitCommercialProspect(data);
    if (outcome.status === "error") {
      setSubmitError(outcome.message);
      setStatus("idle");
      return;
    }
    setStatus("success");
  };

  if (status === "success") {
    return (
      <div className="mx-auto mt-8 max-w-md rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center sm:p-8">
        <h2 className="text-lg font-semibold text-foreground">¡Gracias! Ya tenemos tus datos.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Nos pondremos en contacto contigo para conocer mejor tu clínica y mostrarte cómo Odentia
          puede acompañar su operación.
        </p>
        <Link href="/" className="mt-5 inline-block text-sm font-medium text-primary hover:underline">
          Volver al inicio
        </Link>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto mt-8 flex max-w-md flex-col gap-3 text-left">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
      >
        <label htmlFor="website">No completar este campo</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="firstName" error={errors.firstName}>
          <input
            id="firstName"
            className={INPUT_CLASS}
            value={data.firstName}
            onChange={(e) => update({ firstName: e.target.value })}
            autoComplete="given-name"
            disabled={submitting}
          />
        </Field>
        <Field label="Apellido" htmlFor="lastName" error={errors.lastName}>
          <input
            id="lastName"
            className={INPUT_CLASS}
            value={data.lastName}
            onChange={(e) => update({ lastName: e.target.value })}
            autoComplete="family-name"
            disabled={submitting}
          />
        </Field>
      </div>

      <Field label="Nombre de la clínica" htmlFor="clinicName" error={errors.clinicName}>
        <input
          id="clinicName"
          className={INPUT_CLASS}
          value={data.clinicName}
          onChange={(e) => update({ clinicName: e.target.value })}
          autoComplete="organization"
          disabled={submitting}
        />
      </Field>

      <Field label="Correo electrónico" htmlFor="email" error={errors.email}>
        <input
          id="email"
          type="email"
          className={INPUT_CLASS}
          value={data.email}
          onChange={(e) => update({ email: e.target.value })}
          autoComplete="email"
          placeholder="tucorreo@clinica.com"
          disabled={submitting}
        />
      </Field>

      <Field label="Teléfono / WhatsApp" htmlFor="phone" error={errors.phone}>
        <input
          id="phone"
          type="tel"
          className={INPUT_CLASS}
          value={data.phone}
          onChange={(e) => update({ phone: e.target.value })}
          autoComplete="tel"
          disabled={submitting}
        />
      </Field>

      <Field label="Ciudad" htmlFor="city" error={errors.city}>
        <input
          id="city"
          className={INPUT_CLASS}
          value={data.city}
          onChange={(e) => update({ city: e.target.value })}
          autoComplete="address-level2"
          disabled={submitting}
        />
      </Field>

      {submitError && (
        <p role="alert" className="text-xs text-danger">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? "Enviando…" : "Enviar solicitud"}
      </button>

      <p className="mt-1 text-center text-xs text-muted-foreground">
        Usamos estos datos únicamente para contactarte sobre Odentia.
      </p>
    </form>
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
