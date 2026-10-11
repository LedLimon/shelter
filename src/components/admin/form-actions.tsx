"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The bar of a form's actions: a slip that sticks to the bottom of the
 * window, so a long form is saved without scrolling to its end. It tells the
 * page how tall it is (`--form-actions-height`): the admin layout adds that
 * to the scroll padding, so a field that takes the focus is never under the
 * bar — also when an error message makes the bar taller.
 */
export function FormActions({ children }: { children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty(
        "--form-actions-height",
        `${element.offsetHeight}px`,
      );
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--form-actions-height");
    };
  }, []);

  return (
    <div
      ref={bar}
      className="sticky bottom-3 z-10 grid gap-3 border border-foreground bg-paper p-3 shadow-sheet"
    >
      {children}
    </div>
  );
}
