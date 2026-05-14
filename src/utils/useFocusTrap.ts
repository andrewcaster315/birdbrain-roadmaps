// Focus trap for modal dialogs. Captures Tab key to cycle focus within the
// container, captures the previously-focused element so it can be restored
// on unmount, and (optionally) handles Escape to close.
//
// Usage:
//   const ref = useRef<HTMLDivElement | null>(null);
//   useFocusTrap(ref, { onEscape: onClose });
//   return <div ref={ref} role="dialog" aria-modal="true">…</div>;

import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type Options = {
  // Called when the user presses Escape. Pass undefined to disable.
  onEscape?: () => void;
  // Whether the trap is active. Defaults to true.
  active?: boolean;
};

export const useFocusTrap = (
  containerRef: RefObject<HTMLElement | null>,
  options: Options = {}
) => {
  const { onEscape, active = true } = options;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Remember the element that opened this dialog so we can restore focus
    // when it closes.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the first focusable element, or the container itself if there
    // aren't any. Defer one tick so just-rendered children are picked up.
    const focusables = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute("aria-hidden"));
    queueMicrotask(() => {
      const els = focusables();
      if (els.length > 0) {
        // Don't snatch focus if something inside already has it (e.g.
        // autoFocus on a form input).
        if (!container.contains(document.activeElement)) {
          els[0].focus();
        }
      } else {
        container.setAttribute("tabindex", "-1");
        container.focus();
      }
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onEscape) {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !container.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    container.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("keydown", onKey);
      // Restore focus to whatever had it before the dialog opened.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef, onEscape]);
};
