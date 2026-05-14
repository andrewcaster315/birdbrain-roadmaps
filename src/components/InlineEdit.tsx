// A small inline-edit affordance: shows text by default, becomes an input
// when activated, commits on blur or Enter, cancels on Escape.

import { useEffect, useRef, useState } from "react";
import { pushToast } from "./Toaster";
import styles from "./InlineEdit.module.css";

type Props = {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  ariaLabel: string;
  multiline?: boolean;
  // Visual variant: "title" = large bold; "subtitle" = muted; "default" = body.
  variant?: "title" | "subtitle" | "default";
  emptyText?: string; // shown if value is empty
};

export const InlineEdit = ({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  multiline = false,
  variant = "default",
  emptyText,
}: Props) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select?.();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next !== value) {
      try {
        onCommit(next);
      } catch (err) {
        pushToast({ kind: "error", message: (err as Error).message });
        setDraft(value);
      }
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && multiline) {
      e.preventDefault();
      commit();
    }
  };

  const className = `${styles.text} ${styles[variant]}`;

  if (editing) {
    return multiline ? (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        className={`${styles.input} ${styles[variant]}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={2}
      />
    ) : (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        className={`${styles.input} ${styles[variant]}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    );
  }

  const isEmpty = value.trim() === "";

  return (
    <button
      type="button"
      className={`${styles.button} ${className} ${isEmpty ? styles.empty : ""}`}
      onClick={() => setEditing(true)}
      aria-label={`${ariaLabel} (click to edit)`}
    >
      {isEmpty ? emptyText ?? placeholder ?? "Click to edit" : value}
      <span className={styles.editHint} aria-hidden="true">✎</span>
    </button>
  );
};
