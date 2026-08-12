"use client";

import { ROLE_LABELS } from "@/dev/role"; // DEV TOOL — see src/dev/role.ts
import { useRole } from "@/dev/role-context";
import { CURRENT_ASSISTANT, CURRENT_PATIENT, CURRENT_SUPERADMIN, CURRENT_USER } from "@/lib/current-user";
import { ADMIN_DENTIST_ID, DENTISTS, type Dentist } from "./mock-data";

export type AuthenticatedIdentity = {
  name: string;
  initials: string;
  avatar_url?: string;
  // Specialty for a practicing professional, "Rol · Clínica" otherwise.
  secondaryLabel: string;
  // The Dentist-shaped record for the authenticated user's OWN professional
  // profile — a real Dentist role, or a Clinic Admin who has configured
  // "Perfil profesional" (see AdminProfileModal). Null for a pure
  // administrator, an Assistant (never a clinical professional — see
  // CLAUDE.md Domain Model), or any other role with no professional record.
  professionalRecord: Dentist | null;
};

// DEV TOOL — see src/dev/role.ts. Single source of truth for "who is
// logged in right now": the shell Header (avatar/name/secondary text, and
// which profile modal to open) and the Agenda's greeting both read from
// here instead of each re-deriving it independently. Each role has its own
// independent mock identity — never a shared/default one (e.g. an
// Assistant is never represented as the Clinic Admin CURRENT_USER).
export function useAuthenticatedIdentity(): AuthenticatedIdentity {
  const {
    role,
    dentistId,
    selfDentistOverride,
    adminIdentityOverride,
    adminProfessionalProfile,
    assistantIdentityOverride,
  } = useRole();
  const isDentist = role === "dentist";
  const isClinicAdmin = role === "clinic-admin";
  const isAssistant = role === "assistant";
  const isSuperadmin = role === "superadmin";
  const isPatient = role === "patient";

  const baseDentist = DENTISTS.find((d) => d.id === dentistId) ?? null;
  const authenticatedDentist = isDentist && baseDentist ? { ...baseDentist, ...selfDentistOverride } : null;

  if (authenticatedDentist) {
    return {
      name: authenticatedDentist.name,
      initials: authenticatedDentist.initials,
      avatar_url: authenticatedDentist.avatar_url,
      secondaryLabel: authenticatedDentist.specialty,
      professionalRecord: authenticatedDentist,
    };
  }

  if (isAssistant) {
    return {
      name: assistantIdentityOverride.name ?? CURRENT_ASSISTANT.name,
      initials: CURRENT_ASSISTANT.initials,
      avatar_url: assistantIdentityOverride.avatar_url ?? CURRENT_ASSISTANT.avatar_url,
      secondaryLabel: `${ROLE_LABELS.assistant} · ${CURRENT_ASSISTANT.clinicName}`,
      // Never a clinical professional — no "Perfil del profesional" for
      // this role, ever (see assistant-profile-modal.tsx instead).
      professionalRecord: null,
    };
  }

  if (isSuperadmin) {
    return {
      name: CURRENT_SUPERADMIN.name,
      initials: CURRENT_SUPERADMIN.initials,
      avatar_url: CURRENT_SUPERADMIN.avatar_url,
      secondaryLabel: `${ROLE_LABELS.superadmin} · ${CURRENT_SUPERADMIN.contextLabel}`,
      // Superadmin operates the platform, never a single clinic's own
      // professional record (see CLAUDE.md Domain Model).
      professionalRecord: null,
    };
  }

  if (isPatient) {
    return {
      name: CURRENT_PATIENT.name,
      initials: CURRENT_PATIENT.initials,
      avatar_url: CURRENT_PATIENT.avatar_url,
      secondaryLabel: `${ROLE_LABELS.patient} · ${CURRENT_PATIENT.clinicName}`,
      // A Patient has no clinical professional record of their own.
      professionalRecord: null,
    };
  }

  const name = isClinicAdmin ? (adminIdentityOverride.name ?? CURRENT_USER.name) : CURRENT_USER.name;
  const avatar_url = isClinicAdmin
    ? (adminIdentityOverride.avatar_url ?? CURRENT_USER.avatar_url)
    : CURRENT_USER.avatar_url;
  const professionalRecord: Dentist | null =
    isClinicAdmin && adminProfessionalProfile
      ? {
          id: ADMIN_DENTIST_ID,
          name,
          initials: CURRENT_USER.initials,
          specialty: adminProfessionalProfile.specialty,
          avatar_url,
        }
      : null;

  return {
    name,
    initials: CURRENT_USER.initials,
    avatar_url,
    secondaryLabel: CURRENT_USER.clinicName,
    professionalRecord,
  };
}
