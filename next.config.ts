import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Agent rules live in our own AGENTS.md; don't let `next dev` append to it.
  agentRules: false,
  experimental: {
    // forbidden() → 403 with src/app/forbidden.tsx (admin role checks).
    authInterrupts: true,
    // The ISR cache lives in memory only. Next keeps the expiry of cache tags
    // (updateTag, revalidateTag) in the process's memory: pages written to
    // disk would outlive it, and after a restart a page expired by its tag
    // would be served again as fresh — an offer's previous version as the
    // one in force. A restart now starts with an empty cache instead
    // (docs/architecture.md#структура-кода). It also bounds the cache:
    // addresses that answer 404 don't pile up on disk.
    isrFlushToDisk: false,
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
