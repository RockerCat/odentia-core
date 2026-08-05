type AvatarProps = {
  name: string;
  initials: string;
  photoUrl?: string;
  sizeClassName?: string;
  textClassName?: string;
};

export function Avatar({
  name,
  initials,
  photoUrl,
  sizeClassName = "size-9",
  textClassName = "text-xs",
}: AvatarProps) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- small decorative avatar, not worth Next/Image's optimization pipeline
    return <img src={photoUrl} alt={name} className={`${sizeClassName} shrink-0 rounded-full object-cover`} />;
  }

  return (
    <span
      className={`flex ${sizeClassName} shrink-0 items-center justify-center rounded-full bg-primary/10 ${textClassName} font-medium text-primary`}
    >
      {initials}
    </span>
  );
}
