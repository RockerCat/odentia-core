"use client";

import { useState } from "react";
import type { ReferenceValue } from "@/features/rips/catalog-data";
import type { Specialty, TeamMember } from "./data";
import { MyProfessionalProfileSection } from "./my-professional-profile-section";

// Thin client wrapper around the shared MyProfessionalProfileSection for
// /mi-perfil-profesional (see that page's own comment) — the ONLY reason
// this file exists is that a Server Component page can't hold the
// `selfMember` state a successful save updates; clinic-settings-screen.tsx
// does the same thing for /clinica's own multi-section page, just with a
// full `members` array instead of a single self record. No form/
// persistence logic lives here — that's entirely in
// my-professional-profile-section.tsx, unchanged either way.
export function MyProfessionalProfileScreen({
  initialSelfMember,
  specialties,
  documentTypes,
}: {
  initialSelfMember: TeamMember | null;
  specialties: Specialty[];
  documentTypes: ReferenceValue[];
}) {
  const [selfMember, setSelfMember] = useState(initialSelfMember);

  return (
    <MyProfessionalProfileSection
      selfMember={selfMember}
      specialties={specialties}
      documentTypes={documentTypes}
      onSaved={(updated) => setSelfMember((prev) => (prev ? { ...prev, professionalProfile: updated } : prev))}
    />
  );
}
