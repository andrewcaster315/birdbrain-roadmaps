// Focus trap for modal dialogs. Captures Tab key to cycle focus within the
// container, captures the previously-focused element so it can be restored
// on unmount, and (optionally) handles Escape to close.
//
// Usage:
//   const ref = useRef<HTMLDivElement | null>(null);
//   useFocusTrap(ref, { onEscape: onClose });
//   return <div ref={ref} role="dialog" aria-modal="true">…</div>;

import { useEffect, useRef, type RefObject } from "react";

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

  // Keep the latest onEscape callback in a ref so the trap effect can stay
  // stable across re-renders. Without this, every parent re-render (and they
  // happen a lot — useData/useAuth churn, version ticks on every mutation)
  // would tear down and re-attach the listener, which has two nasty side
  // effects: (1) `previouslyFocused` gets recaptured to an element inside the
  // dialog and focus restoration on close points back into the dead dialog
  // instead of the original trigger; (2) the initial-focus logic can yank
  // focus away from a user mid-typing.
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Remember the element that opened this dialog so we can restore focus
    // when it closes. Captured once when the trap activates.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute("aria-hidden"));

    // Focus the first focusable element, or the container itself if there
    // aren't any. Defer one tick so just-rendered children are picked up.
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
      if (e.key === "Escape" && onEscapeRef.current) {
        e.stopPropagation();
        onEscapeRef.current();
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
    // Intentionally omit onEscape from deps — we read it via ref so the
    // listener stays stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, containerRef]);
};
