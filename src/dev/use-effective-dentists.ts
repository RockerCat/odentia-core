"use client";

// DEV TOOL — see role.ts. Single source of truth for "which dentist(s)
// exist right now", replacing what used to be 3 independent copies of the
// same adminDentistEntry-merge logic (appointments-card.tsx,
// ausencias-admin-section.tsx) plus a dozen call sites that looked up a
// dentist by id straight against the seeded DENTISTS array (which never
// contains the admin's own synthetic entry, so any record actually
// belonging to her — or, in "Administrador Odontólogo Único" mode,
// EVERY record — silently fell back to "Sin asignar"). Behavior for every
// other role/scenario is unchanged from before this hook existed.

import { useMemo } from "react";
import { useRole } from "./role-context";
import { ADMIN_DENTIST_ID, DENTISTS, type Dentist } from "@/features/dashboard/mock-data";
import { CURRENT_USER } from "@/lib/current-user";

export function useEffectiveDentists(): {
  // Full effective roster: DENTISTS (+ the admin's own synthetic entry,
  // additive, if she's configured a "Perfil profesional") — or, in a
  // solo-practitioner clinic, ONLY her, since no other dentist exists.
  dentists: Dentist[];
  soloDentistClinic: boolean;
  // The one dentist a solo-practitioner clinic's own record MUST resolve
  // to, regardless of what it's actually stored against (undefined
  // outside that scenario — see resolveDentist below).
  soloDentist: Dentist | null;
  // Looks up a dentist by the id stored on some record (appointment,
  // patient's usualDentistId, encounter, document, anamnesis edit...).
  // In a solo-practitioner clinic every record conceptually belongs to
  // the one dentist who could have made it, so this ALWAYS resolves to
  // her there — never "Sin asignar" just because seeded mock data still
  // says "d1"/"d2"/"d3" underneath. Everywhere else, unchanged exact-id
  // lookup against `dentists`.
  resolveDentist: (recordDentistId: string | undefined | null) => Dentist | undefined;
} {
  const { adminProfessionalProfile, adminIdentityOverride, soloDentistClinic } = useRole();

  const dentists = useMemo<Dentist[]>(() => {
    if (!adminProfessionalProfile) return DENTISTS;
    const adminDentistEntry: Dentist = {
      id: ADMIN_DENTIST_ID,
      name: adminIdentityOverride.name ?? CURRENT_USER.name,
      initials: CURRENT_USER.initials,
      specialty: adminProfessionalProfile.specialty,
      avatar_url: adminIdentityOverride.avatar_url ?? CURRENT_USER.avatar_url,
    };
    return soloDentistClinic ? [adminDentistEntry] : [...DENTISTS, adminDentistEntry];
  }, [adminProfessionalProfile, adminIdentityOverride, soloDentistClinic]);

  const soloDentist = soloDentistClinic ? (dentists[0] ?? null) : null;

  const resolveDentist = (recordDentistId: string | undefined | null): Dentist | undefined =>
    soloDentist ?? dentists.find((dentist) => dentist.id === recordDentistId);

  return { dentists, soloDentistClinic, soloDentist, resolveDentist };
}
