import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { avatarPixelSize, COVER_CROP_ALLOWANCE, isOptimizableAvatarUrl } from "./user-avatar";

// Avatars are served as right-sized next/image variants of the ONE source
// photo (profiles.avatar_url) — never the full original for a 32px header.

describe("UserAvatar image sizing", () => {
  it("derives the rendered CSS size from the real size class", () => {
    expect(avatarPixelSize("size-8")).toBe(32);
    expect(avatarPixelSize("size-9")).toBe(36);
    expect(avatarPixelSize("size-20 ring-2")).toBe(80);
    expect(avatarPixelSize("size-[72px]")).toBe(72);
    // A card portrait isn't sized by a size-N class — it must pass its own `sizes`.
    expect(avatarPixelSize("aspect-[4/5] w-full object-top")).toBeNull();
  });

  it("asks for 2× the box width so an object-cover crop of a landscape source stays sharp", () => {
    expect(COVER_CROP_ALLOWANCE).toBe(2);
  });

  it("only our own Storage photos go through next/image; fixtures/previews stay plain <img>", () => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (base) expect(isOptimizableAvatarUrl(`${base}/storage/v1/object/public/clinic-media/avatars/u-1?v=1`)).toBe(true);
    expect(isOptimizableAvatarUrl("https://randomuser.me/api/portraits/women/72.jpg")).toBe(false);
    expect(isOptimizableAvatarUrl("blob:http://localhost/abc")).toBe(false);
  });

  it("next.config allows exactly our Supabase host's public clinic-media path", () => {
    const config = fs.readFileSync(path.resolve(__dirname, "../../next.config.ts"), "utf8");
    expect(config).toContain('pathname: "/storage/v1/object/public/clinic-media/**"');
    expect(config).toContain("hostname: supabaseUrl.hostname");
    expect(config).not.toMatch(/hostname: "\*\*?"/);
    expect(config).not.toContain("unoptimized");
  });

  it("the Portal team card passes its real (×2 crop allowance) widths", () => {
    const screen = fs.readFileSync(path.resolve(__dirname, "../features/portal/my-clinic-screen.tsx"), "utf8");
    expect(screen).toContain('sizes="(min-width: 1024px) 480px, (min-width: 768px) 320px, (min-width: 640px) 66vw, 100vw"');
    expect(screen).toContain("width={240}");
    expect(screen).toContain("height={300}");
  });
});
