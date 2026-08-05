import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
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
