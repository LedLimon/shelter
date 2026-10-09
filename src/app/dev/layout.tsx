import type { Metadata } from "next";

import { assertDevelopment } from "./dev-only";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Developer showcases: only in `next dev`, 404 in production builds. */
export default function DevLayout({ children }: LayoutProps<"/dev">) {
  assertDevelopment();
  return children;
}
