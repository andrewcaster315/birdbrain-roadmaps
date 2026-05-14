// Lightweight toast system. Any component (or the service layer) can call
// pushToast(...) and a Toaster fixed in the bottom-right shows it briefly.
// Used primarily to surface background save failures, which would otherwise
// be invisible since the service does optimistic updates.

import { useEffect, useState } from "react";
import { newId } from "../utils/id";
import styles from "./Toaster.module.css";

export type ToastKind = "success" | "error" | "info";

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  // Time the toast is visible. Errors stick around longer. 0 = sticky until
  // the user dismisses it.
  ttlMs: number;
};

type Listener = (toasts: Toast[]) => void;

const subscribers = new Set<Listener>();
let toasts: Toast[] = [];
// Tracks the active dismissal timer for each toast so manual dismissal
// can clear it (avoids the timer firing on an already-removed toast,
// which is harmless but wasteful).
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

const notify = () => {
  for (const cb of subscribers) cb(toasts);
};

export const pushToast = (input: {
  kind: ToastKind;
  message: string;
  ttlMs?: number;
}) => {
  const ttlMs =
    input.ttlMs ??
    (input.kind === "error" ? 9000 : input.kind === "info" ? 4000 : 2500);
  const t: Toast = {
    id: newId(),
    kind: input.kind,
    message: input.message,
    ttlMs,
  };
  toasts = [...toasts, t];
  notify();
  if (ttlMs > 0) {
    dismissTimers.set(
      t.id,
      setTimeout(() => dismissToast(t.id), ttlMs)
    );
  }
  return t.id;
};

export const dismissToast = (id: string) => {
  const timer = dismissTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }
  toasts = toasts.filter((t) => t.id !== id);
  notify();
};

export const Toaster = () => {
  const [current, setCurrent] = useState<Toast[]>(toasts);
  useEffect(() => {
    const cb: Listener = (next) => setCurrent(next);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  if (current.length === 0) return null;

  return (
    <div
      className={styles.stack}
      role="region"
      aria-label="Notifications"
    >
      {current.map((t) => (
        <div
          key={t.id}
          className={`${styles.toast} ${styles[t.kind]}`}
          role={t.kind === "error" ? "alert" : "status"}
        >
          <span className={styles.msg}>{t.message}</span>
          <button
            type="button"
            className={styles.close}
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss notification"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
