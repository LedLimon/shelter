import type { Metadata } from "next";
import { adminTextFace } from "./fonts";

export const metadata: Metadata = {
  title: { template: "%s · Админка", default: "Админка" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      {/*
        Operate mode: text is Sofia Sans. Set on :root, not on a wrapper, so
        that layers rendered into <body> (Select lists, menus, sheets, dialogs)
        get it too; the element leaves the page together with this layout.
        The scroll padding keeps a field that takes the focus, and the error
        under it, clear of the sticky header and of a form's sticky actions
        (FormActions reports their height).
      */}
      <style>{`:root{--font-face-text:${adminTextFace};scroll-padding-block:4.5rem calc(var(--form-actions-height,0px) + 4.5rem)}`}</style>
      {children}
    </>
  );
}
