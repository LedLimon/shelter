"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The heading of what the button did. It takes the focus when it appears:
 * the button that was pressed is gone, and a screen reader would otherwise
 * be left on a page that changed without a word.
 */
export function ResultHeading({ children }: { children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <h1 ref={heading} tabIndex={-1} className="text-section">
      {children}
    </h1>
  );
}
