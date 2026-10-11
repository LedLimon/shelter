import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Agent rules live in our own AGENTS.md; don't let `next dev` append to it.
  agentRules: false,
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
