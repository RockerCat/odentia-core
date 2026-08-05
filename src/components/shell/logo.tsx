type LogoProps = {
  collapsed?: boolean;
};

export function Logo({ collapsed = false }: LogoProps) {
  if (collapsed) {
    return <span className="text-lg font-semibold text-muted-foreground">o</span>;
  }

  return (
    <span className="text-lg font-semibold tracking-tight">
      <span className="text-muted-foreground">odent</span>
      <span className="text-primary">ia</span>
    </span>
  );
}
