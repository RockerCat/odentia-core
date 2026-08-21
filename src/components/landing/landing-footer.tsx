// Shared public-site footer — see landing-header.tsx for why this is a
// standalone component instead of duplicated per public page.
export function LandingFooter() {
  return (
    <footer className="border-t border-border px-4 py-6 sm:px-6">
      <p className="text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Odentia</p>
    </footer>
  );
}
