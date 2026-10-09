"use client";

import { useEffect } from "react";

/**
 * Pseudo-states the showcase can pin on an element with `data-preview`:
 * `<Button data-preview="hover">` looks hovered without a mouse.
 */
export type PreviewState = "hover" | "focus-visible" | "active";

// A real pseudo-class, not the escaped `\:hover` inside a class name such as
// `.not-data-disabled\:hover\:-translate-y-px`.
const PSEUDO = /(?<!\\):(hover|focus-visible|active)\b/g;
const HAS_PSEUDO = /(?<!\\):(?:hover|focus-visible|active)\b/;
const STYLE_ID = "dev-ui-pseudo-states";

/** `.x:hover` → `.x[data-preview~="hover"]` (also inside :has() and groups). */
function toPreviewSelector(selector: string): string {
  return selector.replace(PSEUDO, (_, state: string) => {
    return `[data-preview~="${state}"]`;
  });
}

type Wrap = (inner: string) => string;

function collect(rules: CSSRuleList, wrap: Wrap, out: string[]): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      if (HAS_PSEUDO.test(rule.selectorText) && rule.style.length > 0) {
        out.push(
          wrap(
            `${toPreviewSelector(rule.selectorText)}{${rule.style.cssText}}`,
          ),
        );
      }
      // Native CSS nesting: keep the parent selector around nested rules.
      if (rule.cssRules.length > 0) {
        const parent = rule.selectorText;
        collect(rule.cssRules, (inner) => wrap(`${parent}{${inner}}`), out);
      }
    } else if (rule instanceof CSSMediaRule) {
      const condition = rule.conditionText;
      collect(
        rule.cssRules,
        (inner) => wrap(`@media ${condition}{${inner}}`),
        out,
      );
    } else if (rule instanceof CSSSupportsRule) {
      const condition = rule.conditionText;
      collect(
        rule.cssRules,
        (inner) => wrap(`@supports ${condition}{${inner}}`),
        out,
      );
    } else if (rule instanceof CSSLayerBlockRule) {
      const name = rule.name;
      collect(rule.cssRules, (inner) => wrap(`@layer ${name}{${inner}}`), out);
    } else if (rule instanceof CSSContainerRule) {
      const condition = rule.conditionText;
      collect(
        rule.cssRules,
        (inner) => wrap(`@container ${condition}{${inner}}`),
        out,
      );
    }
  }
}

function buildPreviewCss(): string {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.ownerNode instanceof Element && sheet.ownerNode.id === STYLE_ID) {
      continue;
    }
    try {
      collect(sheet.cssRules, (inner) => inner, out);
    } catch {
      // Cross-origin sheets cannot be read; ours are same-origin.
    }
  }
  return out.join("\n");
}

/**
 * Copies every `:hover`, `:focus-visible` and `:active` rule of the page's CSS
 * to a `[data-preview~="…"]` selector, so the showcase shows the real states of
 * the components side by side. Dev-only: nothing like it ships to production.
 */
export function PseudoStates() {
  useEffect(() => {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.append(style);
    }
    const target = style;
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const css = buildPreviewCss();
        if (target.textContent !== css) target.textContent = css;
      }, 50);
    };
    update();
    // Stylesheets arrive late or change on hot reload.
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.target !== target)) update();
    });
    observer.observe(document.head, { childList: true, subtree: true });
    window.addEventListener("load", update);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("load", update);
      target.remove();
    };
  }, []);

  return null;
}
