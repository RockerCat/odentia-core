// Standard color rule for personalized module headings ("Hola María,
// esta es la agenda para hoy.", and future equivalents): general text
// stays neutral gray, the user's name gets Odentia's highlight color.
// Reuse this for any new module's greeting-style heading instead of
// hardcoding these colors again.
const MUTED_TEXT_CLASS = "text-[#989898]";
const HIGHLIGHT_TEXT_CLASS = "text-[#36ac9b]";

type PersonalizedHeadingProps = {
  before: string;
  userName: string;
  after: string;
  // Real name still resolving → a name-shaped skeleton, never a placeholder
  // or mock name (see use-shell-identity.ts).
  loading?: boolean;
};

export function PersonalizedHeading({ before, userName, after, loading = false }: PersonalizedHeadingProps) {
  if (loading) {
    return (
      <>
        <span className={MUTED_TEXT_CLASS}>{before}</span>
        <span aria-hidden="true" className="inline-block h-[0.8em] w-24 animate-pulse rounded bg-foreground/10 align-middle" />
        <span className={MUTED_TEXT_CLASS}>{after}</span>
      </>
    );
  }
  // No real name available (resolution failed) → just drop it: "Hola, esta
  // es la agenda para hoy." — never an invented one.
  if (!userName) return <span className={MUTED_TEXT_CLASS}>{`${before.trimEnd()}${after}`}</span>;
  return (
    <>
      <span className={MUTED_TEXT_CLASS}>{before}</span>
      <span className={HIGHLIGHT_TEXT_CLASS}>{userName}</span>
      <span className={MUTED_TEXT_CLASS}>{after}</span>
    </>
  );
}
