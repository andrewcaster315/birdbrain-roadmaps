import { useState } from "react";
import { useAuth } from "./AuthContext";
import styles from "./SignIn.module.css";

type Phase = "enter-email" | "link-sent";

export const SignIn = () => {
  const { requestMagicLink, consumeMagicLink, isMockAuth } = useAuth();
  const [phase, setPhase] = useState<Phase>("enter-email");
  const [email, setEmail] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token } = await requestMagicLink(email);
      setPendingToken(token);
      setPhase("link-sent");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onClickMockMagicLink = async () => {
    if (!pendingToken) return;
    try {
      await consumeMagicLink(pendingToken);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={onRequest}>
        <h1 className={styles.title}>Birdbrain Roadmaps</h1>

        {phase === "enter-email" && (
          <>
            <p className={styles.subtitle}>
              Sign in with your work email. We'll send you a one-time link.
            </p>
            <label className={styles.label} htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourcompany.com"
              autoFocus
              required
              disabled={submitting}
            />
            {error && <div className={styles.error} role="alert">{error}</div>}
            <button className={styles.button} type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Email me a sign-in link"}
            </button>
            {isMockAuth && (
              <p className={styles.hint}>
                Local mode: no real email is sent — the next screen has the
                link directly. In production this hits Supabase Auth and the
                link arrives in your inbox.
              </p>
            )}
          </>
        )}

        {phase === "link-sent" && (
          <>
            <p className={styles.subtitle}>
              We sent a sign-in link to <strong>{email}</strong>.
              {isMockAuth
                ? " Click the simulated link below to continue."
                : " Open it in your inbox and click the link to sign in."}
            </p>
            {isMockAuth && pendingToken && (
              <div className={styles.mockMail}>
                <div className={styles.mockMailHead}>
                  Simulated email — click to "open the link"
                </div>
                <button
                  type="button"
                  className={styles.button}
                  onClick={onClickMockMagicLink}
                >
                  Sign in as {email}
                </button>
              </div>
            )}
            {!isMockAuth && (
              <div className={styles.hint}>
                Tip: the email is sent by Supabase. Check spam if it doesn't
                arrive in a minute, and make sure your domain is on the
                allowed-domains list in Admin.
              </div>
            )}
            {error && <div className={styles.error} role="alert">{error}</div>}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setPhase("enter-email");
                setPendingToken(null);
                setError(null);
              }}
            >
              ← Use a different email
            </button>
          </>
        )}
      </form>
    </div>
  );
};
