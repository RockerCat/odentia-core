import Image from "next/image";

// Bump this whenever /public/branding/logo.png is replaced — it busts
// both the browser cache and Next's image-optimizer cache, which are
// keyed on the full request URL and won't otherwise notice the file
// on disk changed under the same path.
const LOGO_VERSION = "2";

type LogoProps = {
  className?: string;
};

export function Logo({ className = "h-[58px] w-auto" }: LogoProps) {
  return (
    <Image
      src={`/branding/logo.png?v=${LOGO_VERSION}`}
      alt="Odentia"
      width={200}
      height={100}
      priority
      className={className}
    />
  );
}
