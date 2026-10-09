import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { template: "%s · Админка", default: "Админка" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
