"use client"; // needed for the user menu's open/close state below.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { AdminProfileModal } from "@/features/dashboard/admin-profile-modal";
import { AssistantProfileModal } from "@/features/dashboard/assistant-profile-modal";
import { BellIcon, ChevronDownIcon, LogOutIcon, SearchIcon, UserIcon } from "./icons";
import { useShellIdentity } from "./use-shell-identity";
import { useShellLogout } from "./use-shell-logout";

// Desktop only — mobile uses MobileHeader + BottomTabBar instead.
export function Header() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
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

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-10 hidden h-20 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 sm:px-6 md:flex">
      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <div className="hidden items-center gap-2 rounded-full bg-background px-4 py-2.5 text-sm text-muted-foreground md:flex md:w-64 lg:w-96">
          <SearchIcon className="size-4 shrink-0" />
          <span className="flex-1 truncate">Buscar pacientes, citas, tratamientos...</span>
          <SearchIcon className="size-4 shrink-0" />
        </div>

        <button
          type="button"
          aria-label="Notificaciones"
          className="relative flex size-9 items-center justify-center rounded-lg text-foreground/80 hover:bg-foreground/5"
        >
          <BellIcon className="size-5" />
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-warning text-[10px] font-medium text-primary-foreground">
            2
          </span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-foreground/5"
          >
            <UserAvatar name={identity.name} initials={identity.initials} avatar_url={identity.avatar_url} />
            <span className="hidden text-left sm:block">
              <span className="block text-sm leading-tight font-medium">{identity.name}</span>
              <span className="block text-xs leading-tight text-muted-foreground">{identity.secondaryLabel}</span>
            </span>
            <ChevronDownIcon className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
          </button>

          {menuOpen && (
            <>
              <div aria-hidden="true" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-40" />
              <div
                role="menu"
                className="absolute top-full right-0 z-50 mt-2 w-52 rounded-xl border border-border bg-background p-1.5 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    // Dentist, or a Clinic Admin who already has her own
                    // professional_profile, goes to the real, unified
                    // /mi-perfil-profesional — see this block's own comment
                    // above dentistToShow. A Clinic Admin with no
                    // professional profile yet still opens "Mi perfil"
                    // (AdminProfileModal, unchanged/out of scope here). An
                    // Assistant opens their own simple, non-clinical profile.
                    // Every other role keeps the previous no-op behavior.
                    if (dentistToShow) router.push("/mi-perfil-profesional");
                    else if (isClinicAdmin) setShowAdminProfile(true);
                    else if (isAssistant) setShowAssistantProfile(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-foreground/80 hover:bg-foreground/5"
                >
                  <UserIcon className="size-4 shrink-0" />
                  Perfil
                </button>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  role="menuitem"
                  disabled={signingOut}
                  // Deliberately does NOT setMenuOpen(false) here — this
                  // menu closing immediately used to be exactly the "click
                  // → silence" bug this task exists to fix: the button
                  // (and any pending label on it) vanished the instant it
                  // was clicked, well before Supabase signOut + the
                  // router.push("/login") transition actually finished.
                  // Staying open through signOut() lets "Cerrando
                  // sesión…" actually be seen; the whole header unmounts
                  // anyway once /login lands.
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-danger hover:bg-danger/5 disabled:opacity-60"
                >
                  <LogOutIcon className="size-4 shrink-0" />
                  {signingOut ? "Cerrando sesión…" : "Salir"}
                </button>
              </div>
            </>
          )}
        </div>
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
