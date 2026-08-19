"use client";

import { Combobox } from "@/components/combobox";
import { UsersIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import type { Dentist } from "@/features/dashboard/mock-data";

// Sentinel id for the optional "Todos los profesionales" row — never a real
// Dentist.id (see DENTISTS in dashboard/mock-data.ts), so it's always safe
// to tell apart from an actual selection.
const ALL_OPTION_ID = "";

// The one professional picker for Odentia — a "Buscar profesional…" search
// that opens a dropdown of avatar + name + especialidad rows (built on the
// shared Combobox — see that file), and a selected-value "card" once
// something's picked. Standardizes what used to be one-off native <select>
// dropdowns (e.g. Pacientes' own filter) around this same component instead
// of a second visual language; every place in Odentia that lets someone
// pick a dentist should progressively reuse this.
export function ProfessionalSelect({
  dentists,
  selectedId,
  onSelect,
  includeAllOption = false,
  allOptionLabel = "Todos los profesionales",
  label,
  placeholder = "Buscar profesional…",
  compactTrigger = false,
}: {
  dentists: Dentist[];
  selectedId: string;
  onSelect: (dentistId: string) => void;
  // Only makes sense when this is a filter (not a required, single-target
  // assignment like "which dentist runs this appointment") — see task scope.
  includeAllOption?: boolean;
  allOptionLabel?: string;
  // No default: only render a floating label when a caller actually wants
  // one. A filter row sitting next to label-less native <select>s (see
  // Pacientes) should omit it entirely to keep the same single-line
  // structure as its neighbors — see compactTrigger below.
  label?: string;
  placeholder?: string;
  // Shrinks the closed trigger to a native <select>'s own height (px-2.5
  // py-1.5) and drops the especialidad line, showing just a small avatar +
  // name + chevron — for sitting flush in a compact filter row alongside
  // plain selects. The open dropdown is unaffected either way: it always
  // keeps the full avatar + name + especialidad rows.
  compactTrigger?: boolean;
}) {
  const allOption: Dentist = { id: ALL_OPTION_ID, name: allOptionLabel, initials: "", specialty: "" };
  const items = includeAllOption ? [allOption, ...dentists] : dentists;
  const selectedItem = items.find((d) => d.id === selectedId) ?? null;

  const combobox = (
    <Combobox
      items={items}
      getKey={(dentist) => dentist.id}
      getSearchText={(dentist) => (dentist.id === ALL_OPTION_ID ? dentist.name : `${dentist.name} ${dentist.specialty}`)}
      selectedItem={selectedItem}
      onSelect={(dentist) => onSelect(dentist.id)}
      placeholder={placeholder}
      emptyText="Sin resultados"
      triggerClassName={compactTrigger ? "px-2.5 py-1.5" : undefined}
      renderItem={(dentist, isCard) => {
        const isAllOption = dentist.id === ALL_OPTION_ID;
        if (compactTrigger && isCard) {
          return (
            <>
              {isAllOption ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UsersIcon className="size-3" />
                </span>
              ) : (
                <UserAvatar
                  name={dentist.name}
                  initials={dentist.initials}
                  avatar_url={dentist.avatar_url}
                  sizeClassName="size-5"
                  textClassName="text-[9px]"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{dentist.name}</span>
            </>
          );
        }
        return isAllOption ? (
          <>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UsersIcon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{dentist.name}</span>
            </span>
          </>
        ) : (
          <>
            <UserAvatar
              name={dentist.name}
              initials={dentist.initials}
              avatar_url={dentist.avatar_url}
              sizeClassName="size-8"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{dentist.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{dentist.specialty}</span>
            </span>
          </>
        );
      }}
    />
  );

  if (!label) return combobox;

  return (
    <div>
      <label className="text-[11px] text-label-foreground">{label}</label>
      <div className="mt-1">{combobox}</div>
    </div>
  );
}
