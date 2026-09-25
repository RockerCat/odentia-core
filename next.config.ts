import type { NextConfig } from "next";

// Profile photos (profiles.avatar_url) live in Supabase Storage's public
// clinic-media bucket. Allowing exactly that host + path lets next/image
// serve a right-sized, cached variant (UserAvatar) instead of every avatar
// downloading the full original. Query strings (the ?v= cache-buster) are
// allowed because `search` is omitted.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;

const nextConfig: NextConfig = {
  // Hides the floating dev-mode build-activity badge so it doesn't sit on
  // top of the UI during normal local testing. This is only the badge —
  // the actual error overlay (full-screen, shown on real compile/runtime
  // errors) is a separate mechanism and still appears normally; debugging
  // isn't affected.
  devIndicators: false,
  images: {
    // Allows the ?v= cache-busting query string on branding assets
    // (see src/components/shell/logo.tsx) without opening this up to
    // every local image.
    localPatterns: [
      {
        pathname: "/branding/**",
      },
    ],
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https",
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port,
            pathname: "/storage/v1/object/public/clinic-media/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
