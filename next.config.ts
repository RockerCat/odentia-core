import type { NextConfig } from "next";

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
  },
};

export default nextConfig;
