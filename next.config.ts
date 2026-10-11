import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Agent rules live in our own AGENTS.md; don't let `next dev` append to it.
  agentRules: false,
  // Images are uploaded media, resized ahead of time by the worker
  // (docs/architecture.md#медиа): next/image only picks one of the ready
  // widths. Keep the sizes in sync with VARIANT_WIDTHS.
  images: {
    loader: "custom",
    loaderFile: "./src/lib/media/image-loader.ts",
    deviceSizes: [640, 1024, 1600],
    imageSizes: [320],
  },
  experimental: {
    // forbidden() → 403 with src/app/forbidden.tsx (admin role checks).
    authInterrupts: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
