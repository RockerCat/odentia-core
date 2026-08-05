"use client";

// DEV TOOL — see src/dev/role.ts. Never renders outside development.

import { ROLES, ROLE_LABELS, type Role } from "./role";
import { useRole } from "./role-context";

export function RoleSwitcher() {
  const { role, setRole } = useRole();

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div className="border-t border-dashed border-warning/40 bg-warning/5 p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-warning uppercase">
        <span className="size-1.5 shrink-0 rounded-full bg-warning" />
        Dev · Cambiar rol
      </p>
      <select
        value={role}
        onChange={(event) => setRole(event.target.value as Role)}
        className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </div>
  );
}
