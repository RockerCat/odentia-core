"use client"; // needed for the user menu's open/close state below.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { AdminProfileModal } from "@/features/dashboard/admin-profile-modal";
import { DentistProfileModal } from "@/features/dashboard/appointments-card";
import { AssistantProfileModal } from "@/features/dashboard/assistant-profile-modal";
import { useAuthenticatedIdentity } from "@/features/dashboard/use-authenticated-identity";
import { BellIcon, ChevronDownIcon, LogOutIcon, SearchIcon, UserIcon } from "./icons";

// Desktop only — mobile uses MobileHeader + BottomTabBar instead.
export function Header() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showAdminProfile, setShowAdminProfile] = useState(false);
  const [showAssistantProfile, setShowAssistantProfile] = useState(false);
  // DEV TOOL — see src/dev/role.ts. useAuthenticatedIdentity() is the same
  // "who's logged in" derivation the Agenda's greeting reads too; useRole()
  // is only needed here for the setters the profile modals write back through.
  const {
    role,
    setSelfDentistOverride,
    adminIdentityOverride,
    setAdminIdentityOverride,
    adminProfessionalProfile,
    setAdminProfessionalProfile,
    assistantIdentityOverride,
    setAssistantIdentityOverride,
    logout,
  } = useRole();
  const identity = useAuthenticatedIdentity();
  const isDentistRole = role === "dentist";
  const isClinicAdmin = role === "clinic-admin";
  const isAssistant = role === "assistant";
  const dentistToShow = identity.professionalRecord;

  // Routes DentistProfileModal's name/specialty/avatar edits back to the
  // right place when it's the admin's own professional record: name/avatar
  // are also "Mi perfil" identity fields, specialty lives on the
  // professional profile itself.
  const handleAdminDentistProfileChange = (patch: { name?: string; specialty?: string; avatar_url?: string }) => {
    if (patch.name !== undefined || patch.avatar_url !== undefined) {
      setAdminIdentityOverride({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.avatar_url !== undefined ? { avatar_url: patch.avatar_url } : {}),
      });
    }
    if (patch.specialty !== undefined && adminProfessionalProfile) {
      setAdminProfessionalProfile({ ...adminProfessionalProfile, specialty: patch.specialty });
    }
  };

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
                    // DEV TOOL — Dentist, or a Clinic Admin who has already
                    // configured "Perfil profesional", opens the shared
                    // DentistProfileModal directly. A Clinic Admin with no
                    // professional profile yet opens "Mi perfil" instead. An
                    // Assistant opens their own simple, non-clinical profile.
                    // Every other role keeps the previous no-op behavior.
                    if (dentistToShow) setShowProfile(true);
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
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                    router.push("/login");
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-danger hover:bg-danger/5"
                >
                  <LogOutIcon className="size-4 shrink-0" />
                  Salir
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showProfile && dentistToShow && (
        <DentistProfileModal
          dentist={dentistToShow}
          allAppointments={[]}
          onClose={() => setShowProfile(false)}
          onDeactivate={() => {}}
          onSelfProfileChange={isDentistRole ? setSelfDentistOverride : handleAdminDentistProfileChange}
          initialProfile={
            !isDentistRole && adminProfessionalProfile
              ? {
                  registrationNumber: adminProfessionalProfile.registrationNumber,
                  mainRoom: adminProfessionalProfile.mainRoom,
                  scheduleDays: adminProfessionalProfile.scheduleDays,
                  scheduleStart: adminProfessionalProfile.scheduleStart,
                  scheduleEnd: adminProfessionalProfile.scheduleEnd,
                }
              : undefined
          }
        />
      )}

      {showAdminProfile && (
        <AdminProfileModal
          onClose={() => setShowAdminProfile(false)}
          onProfessionalProfileConfigured={() => {
            setShowAdminProfile(false);
            setShowProfile(true);
          }}
          adminIdentityOverride={adminIdentityOverride}
          setAdminIdentityOverride={setAdminIdentityOverride}
          setAdminProfessionalProfile={setAdminProfessionalProfile}
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
