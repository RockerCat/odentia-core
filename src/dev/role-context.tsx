"use client";

// DEV TOOL — see src/dev/role.ts.

import { createContext, useContext, useState, type ReactNode } from "react";
import { DEFAULT_ROLE, type Role } from "./role";

type RoleContextValue = {
  role: Role;
  setRole: (role: Role) => void;
};

const RoleContext = createContext<RoleContextValue>({
  role: DEFAULT_ROLE,
  setRole: () => {},
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);

  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
