import { RoleSwitcher } from "@/dev/role-switcher"; // DEV TOOL — see src/dev/role.ts
import { Logo } from "./logo";
import { SidebarNav } from "./sidebar-nav";

type SidebarProps = {
  activeLabel?: string;
};

export function Sidebar({ activeLabel }: SidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-background md:flex">
      <div className="flex items-center justify-center border-b border-border px-4 py-8">
        <Logo />
      </div>

      <SidebarNav activeLabel={activeLabel} />

      <RoleSwitcher />
    </aside>
  );
}
