"use client"; // needed for the profile-modal open/close state below.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { AdminProfileModal } from "@/features/dashboard/admin-profile-modal";
import { AssistantProfileModal } from "@/features/dashboard/assistant-profile-modal";
import { AuthenticatedUserMenu } from "./authenticated-user-menu";
import { SearchIcon } from "./icons";
import { useShellIdentity } from "./use-shell-identity";
import { useShellLogout } from "./use-shell-logout";

// Desktop only — mobile uses MobileHeader + BottomTabBar instead.
export function Header() {
  const router = useRouter();
  const [showAdminProfile, setShowAdminProfile] = useState(false);
  const [showAssistantProfile, setShowAssistantProfile] = useState(false);
  // DEV TOOL — see src/dev/role.ts. useShellIdentity() overlays real
  // profile/clinic data on the same mock derivation the Agenda's greeting
  // reads (useAuthenticatedIdentity) — see use-shell-identity.ts. useRole()
  // is only needed here for the setters AdminProfileModal/
  // AssistantProfileModal (identity fields — still mock, out of this
  // task's scope) write back through.
  const {
    role,
    adminIdentityOverride,
    setAdminIdentityOverride,
    assistantIdentityOverride,
    setAssistantIdentityOverride,
  } = useRole();
  const identity = useShellIdentity();
  const { signOut, signingOut } = useShellLogout();
  const isClinicAdmin = role === "clinic-admin";
  const isAssistant = role === "assistant";
  // Real Dentist, or real Clinic Admin who already has her own
  // professional_profile (see role-bridge.ts's soloDentistClinic) — both
  // go straight to the real, unified /mi-perfil-profesional experience
  // (see that page + my-professional-profile-section.tsx) instead of the
  // old DentistProfileModal (100% mock fields — see appointments-card.tsx).
  // A Clinic Admin with no professional_profile yet still opens
  // AdminProfileModal's "¿También atiendes pacientes?" card, whose
  // "Configurar perfil profesional" button now also lands on
  // /mi-perfil-profesional — its real creation flow
  // (create_my_professional_profile(), see that migration), never a
  // second local form.
  const dentistToShow = identity.professionalRecord;

  return (
    <header className="sticky top-0 z-10 hidden h-20 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 sm:px-6 md:flex">
      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <div className="hidden items-center gap-2 rounded-full bg-background px-4 py-2.5 text-sm text-muted-foreground md:flex md:w-64 lg:w-96">
          <SearchIcon className="size-4 shrink-0" />
          <span className="flex-1 truncate">Buscar pacientes, citas, tratamientos...</span>
          <SearchIcon className="size-4 shrink-0" />
        </div>

        <AuthenticatedUserMenu
          identity={identity}
          // Dentist, or a Clinic Admin who already has her own
          // professional_profile, goes to the real, unified
          // /mi-perfil-profesional — see this block's own comment above
          // dentistToShow. A Clinic Admin with no professional profile yet
          // still opens "Mi perfil" (AdminProfileModal, unchanged/out of
          // scope here). An Assistant opens their own simple, non-clinical
          // profile. Every other role keeps the previous no-op behavior —
          // never null here, so "Perfil" always shows in the app shell,
          // same as before this was extracted.
          onProfileClick={() => {
            if (dentistToShow) router.push("/mi-perfil-profesional");
            else if (isClinicAdmin) setShowAdminProfile(true);
            else if (isAssistant) setShowAssistantProfile(true);
          }}
          onSignOut={() => void signOut()}
          signingOut={signingOut}
        />
      </div>

      {showAdminProfile && (
        <AdminProfileModal
          onClose={() => setShowAdminProfile(false)}
          onConfigureProfessionalProfile={() => {
            // Same real, unified page a Dentist/Admin-odontóloga already
            // edits from — its own empty state now offers the real
            // creation flow (create_my_professional_profile()), never a
            // second local form here.
            setShowAdminProfile(false);
            router.push("/mi-perfil-profesional");
          }}
          adminIdentityOverride={adminIdentityOverride}
          setAdminIdentityOverride={setAdminIdentityOverride}
        />
      )}

      {showAssistantProfile && (
        <AssistantProfileModal
          onClose={() => setShowAssistantProfile(false)}
          assistantIdentityOverride={assistantIdentityOverride}
          setAssistantIdentityOverride={setAssistantIdentityOverride}
        />
      )}
    </header>
  );
}
