"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type EmailFrameProps = {
  html: string;
  title: string;
  /** The mail client's window, in px; the letter is as wide as it gets. */
  width: number;
};

/**
 * The letter in a frame of its own, exactly `width` wide and as tall as the
 * letter: its styles and the page's don't meet, nothing in it can run a
 * script, and it never needs a scrollbar that would narrow it.
 */
export function EmailFrame({ html, title, width }: EmailFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(900);

  const fit = useCallback(() => {
    // The body, not the root: the root is never shorter than the frame.
    const body = frame.current?.contentDocument?.body;
    if (body) setHeight(body.offsetHeight);
  }, []);

  // The frame may have loaded before hydration attached onLoad, and the
  // letter is laid out again whenever the frame's width changes.
  useEffect(() => {
    fit();
    const body = frame.current?.contentDocument?.body;
    if (!body) return;
    const observer = new ResizeObserver(fit);
    observer.observe(body);
    return () => observer.disconnect();
  }, [fit, html, width]);

  return (
    <iframe
      ref={frame}
      title={title}
      srcDoc={html}
      // Same origin only to measure the height; links open in a new tab.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={fit}
      style={{ width, height }}
      // No border and no max-width: either would make the client narrower
      // than it claims. The page frames it from outside.
      className="block"
    />
  );
}
