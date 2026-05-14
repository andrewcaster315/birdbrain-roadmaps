// In-app confirmation dialog with the same look as the rest of the app.
// Replaces `window.confirm` so destructive actions get a styled, focus-
// trapped, screen-reader-friendly prompt instead of a system modal.
//
// Usage from anywhere:
//
//   import { confirmDialog } from "./ConfirmDialog";
//   const ok = await confirmDialog({
//     title: "Delete swimlane?",
//     message: "Items in this lane will move to Unassigned.",
//     confirmLabel: "Delete",
//     variant: "danger",
//   });
//   if (ok) { ... }
//
// Mount <ConfirmDialogHost /> once near the app root.

import { useEffect, useRef, useState } from "react";
import { newId } from "../utils/id";
import { useFocusTrap } from "../utils/useFocusTrap";
import styles from "./ConfirmDialog.module.css";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

type PendingConfirm = ConfirmOptions & {
  id: string;
  resolve: (ok: boolean) => void;
};

const subscribers = new Set<(pending: PendingConfirm | null) => void>();
let pending: PendingConfirm | null = null;
const notify = () => {
  for (const cb of subscribers) cb(pending);
};

export const confirmDialog = (opts: ConfirmOptions): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    // If something else is open, resolve that one as cancelled first so
    // we don't lose track of its promise.
    if (pending) {
      pending.resolve(false);
    }
    pending = { ...opts, id: newId(), resolve };
    notify();
  });
};

const resolveAndClose = (ok: boolean) => {
  if (!pending) return;
  pending.resolve(ok);
  pending = null;
  notify();
};

export const ConfirmDialogHost = () => {
  const [current, setCurrent] = useState<PendingConfirm | null>(pending);
  useEffect(() => {
    const cb = (p: PendingConfirm | null) => setCurrent(p);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, {
    active: !!current,
    onEscape: () => resolveAndClose(false),
  });

  if (!current) return null;

  const confirmLabel = current.confirmLabel ?? "Confirm";
  const cancelLabel = current.cancelLabel ?? "Cancel";
  const variant = current.variant ?? "default";

  return (
    <div
      className={styles.backdrop}
      onClick={() => resolveAndClose(false)}
      role="presentation"
    >
      <div
        className={styles.card}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`confirm-title-${current.id}`}
        aria-describedby={
          current.message ? `confirm-msg-${current.id}` : undefined
        }
        ref={dialogRef}
      >
        <h2 id={`confirm-title-${current.id}`} className={styles.title}>
          {current.title}
        </h2>
        {current.message && (
          <p id={`confirm-msg-${current.id}`} className={styles.message}>
            {current.message}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancel}
            onClick={() => resolveAndClose(false)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              variant === "danger" ? styles.confirmDanger : styles.confirm
            }
            onClick={() => resolveAndClose(true)}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
