import { CloseIcon } from "./icons";
import { Logo } from "./logo";
import { SidebarNav } from "./sidebar-nav";

type MobileNavProps = {
  open: boolean;
  onClose: () => void;
  activeLabel?: string;
};

export function MobileNav({ open, onClose, activeLabel }: MobileNavProps) {
  return (
    <div className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col bg-background shadow-sm transition-transform duration-200 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/5"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        <SidebarNav activeLabel={activeLabel} />
      </div>
    </div>
  );
}
