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
};

export function PersonalizedHeading({ before, userName, after }: PersonalizedHeadingProps) {
  return (
    <>
      <span className={MUTED_TEXT_CLASS}>{before}</span>
      <span className={HIGHLIGHT_TEXT_CLASS}>{userName}</span>
      <span className={MUTED_TEXT_CLASS}>{after}</span>
    </>
  );
}
