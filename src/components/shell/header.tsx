import { BellIcon, MenuIcon, SearchIcon } from "./icons";

type HeaderProps = {
  title: string;
  onOpenMobileNav: () => void;
};

export function Header({ title, onOpenMobileNav }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background px-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open menu"
        className="flex size-9 items-center justify-center rounded-lg text-foreground/80 hover:bg-foreground/5 md:hidden"
      >
        <MenuIcon className="size-5" />
      </button>

      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground sm:flex sm:w-56 lg:w-72">
          <SearchIcon className="size-4 shrink-0" />
          <span>Search</span>
        </div>

        <button
          type="button"
          aria-label="Notifications"
          className="flex size-9 items-center justify-center rounded-lg text-foreground/80 hover:bg-foreground/5"
        >
          <BellIcon className="size-5" />
        </button>

        <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
          O
        </span>
      </div>
    </header>
  );
}
