"use client";

// DEV TOOL — see src/dev/role.ts. Never renders outside development.

import { ROLES, ROLE_LABELS, type Role } from "./role";
import { SOLO_DENTIST_SCENARIO_LABEL, useRole } from "./role-context";

// "Administrador Odontólogo Único" isn't a Role (see role-context.tsx) —
// it's role "clinic-admin" plus soloDentistClinic, so the <select> needs
// its own sentinel value distinct from the plain "clinic-admin" option.
const SOLO_SCENARIO_VALUE = "clinic-admin-solo";

export function RoleSwitcher() {
  const { role, setRole, soloDentistClinic, setSoloDentistClinic } = useRole();

  if (process.env.NODE_ENV !== "development") return null;

  const scenarioValue = role === "clinic-admin" && soloDentistClinic ? SOLO_SCENARIO_VALUE : role;

  const handleChange = (value: string) => {
    if (value === SOLO_SCENARIO_VALUE) {
      setSoloDentistClinic(true);
      return;
    }
    setSoloDentistClinic(false);
    setRole(value as Role);
  };

  return (
    <div className="border-t border-dashed border-warning/40 bg-warning/5 p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-warning uppercase">
        <span className="size-1.5 shrink-0 rounded-full bg-warning" />
        Dev · Cambiar rol
      </p>
      <select
        value={scenarioValue}
        onChange={(event) => handleChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
      >
        {ROLES.flatMap((r) =>
          r === "clinic-admin"
            ? [
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>,
                <option key={SOLO_SCENARIO_VALUE} value={SOLO_SCENARIO_VALUE}>
                  {SOLO_DENTIST_SCENARIO_LABEL}
                </option>,
              ]
            : [
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>,
              ],
        )}
      </select>
    </div>
  );
}
