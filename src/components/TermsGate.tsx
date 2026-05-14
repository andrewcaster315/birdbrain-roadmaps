// Click-through Terms / Privacy acceptance gate. Renders after the auth gate
// but before the main app whenever the signed-in user has not yet accepted
// the current CURRENT_TERMS_VERSION. On accept, writes the version + a
// timestamp to the user row (with an audit entry) and lets the app render.

import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useData } from "../data/DataContext";
import { CURRENT_TERMS_VERSION } from "../types";
import { useFocusTrap } from "../utils/useFocusTrap";
import styles from "./TermsGate.module.css";

export const TermsGate = ({ children }: { children: ReactNode }) => {
  const { currentUser, setCurrentUser, signOut } = useAuth();
  const { service } = useData();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const needsAcceptance =
    !!currentUser &&
    currentUser.termsVersionAccepted !== CURRENT_TERMS_VERSION;

  // Trap focus inside the dialog. Escape is a no-op here — users can use the
  // explicit Decline button. Hook unconditionally so hook order stays stable.
  useFocusTrap(dialogRef, {
    active: needsAcceptance,
    onEscape: undefined,
  });

  if (!currentUser) return <>{children}</>;
  if (!needsAcceptance) return <>{children}</>;

  const onAccept = async () => {
    if (!agreed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Await the server confirmation so the gate stays visible if the
      // write fails — avoids the optimistic-then-rolled-back surprise of
      // the gate reappearing on next refresh.
      const updated = await service.recordTermsAcceptance(
        currentUser.id,
        CURRENT_TERMS_VERSION
      );
      setCurrentUser(updated);
    } catch (err) {
      setError(
        `Couldn't save your acceptance: ${(err as Error).message}. Please try again.`
      );
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-gate-title"
        ref={dialogRef}
      >
        <h1 id="terms-gate-title" className={styles.title}>
          Before you get started
        </h1>
        <p className={styles.lede}>
          Birdbrain Roadmaps is a free, open-source side project. Please take a
          minute to review how it works before you continue.
        </p>

        <ul className={styles.bullets}>
          <li>
            <strong>This is not a HIPAA-compliant system.</strong> Do not enter
            patient information, medical records, or any data subject to HIPAA
            or similar regulations. Use it for product and project planning
            only.
          </li>
          <li>
            <strong>Best-effort service, no warranty.</strong> It may have
            bugs, lose data, or become unavailable. Don't store anything here
            you can't afford to lose.
          </li>
          <li>
            <strong>Your content is yours.</strong> You can export or delete
            your data from inside the app at any time.
          </li>
          <li>
            <strong>You're agreeing to the full policies below.</strong> The
            bullets above are a summary, not the whole story.
          </li>
        </ul>

        <p className={styles.links}>
          <Link to="/legal/privacy" target="_blank" rel="noreferrer">
            Privacy Policy ↗
            <span style={{ position: "absolute", left: "-9999px" }}>
              (opens in new tab)
            </span>
          </Link>
          <span aria-hidden="true"> · </span>
          <Link to="/legal/terms" target="_blank" rel="noreferrer">
            Terms of Use ↗
            <span style={{ position: "absolute", left: "-9999px" }}>
              (opens in new tab)
            </span>
          </Link>
        </p>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={submitting}
          />
          <span>
            I have read and agree to the Privacy Policy and Terms of Use.
          </span>
        </label>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <p className={styles.declineHint}>
          If you decline, you'll be signed out. You can come back and accept
          anytime.
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={signOut}
            disabled={submitting}
          >
            Decline
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={onAccept}
            disabled={!agreed || submitting}
          >
            {submitting ? "Saving…" : "Accept and continue"}
          </button>
        </div>
      </div>
    </div>
  );
};
