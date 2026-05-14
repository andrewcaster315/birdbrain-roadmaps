import { Link, NavLink } from "react-router-dom";
import { type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { useData } from "../data/DataContext";
import { confirmDialog } from "./ConfirmDialog";
import { pushToast } from "./Toaster";
import styles from "./Layout.module.css";

const formatExpiry = (ts: number | null): string => {
  if (!ts) return "";
  const days = Math.max(
    0,
    Math.round((ts - Date.now()) / (24 * 60 * 60 * 1000))
  );
  return `Session: ${days}d`;
};

export const Layout = ({ children }: { children: ReactNode }) => {
  const { signOut, expiresAt, currentUser, isMockAuth } = useAuth();
  const { service } = useData();
  const settings = service.getSettings();

  return (
    <div className={styles.app}>
      <a href="#main" className={styles.skipLink}>
        Skip to main content
      </a>
      <header className={styles.header}>
        <Link to="/" className={styles.brand} aria-label="Home">
          <span>{settings.orgName || "Roadmaps"}</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? styles.navLinkActive : styles.navLink
            }
          >
            Home
          </NavLink>
          <NavLink
            to="/trash"
            className={({ isActive }) =>
              isActive ? styles.navLinkActive : styles.navLink
            }
          >
            Trash
          </NavLink>
          {currentUser?.isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                isActive ? styles.navLinkActive : styles.navLink
              }
            >
              Admin
            </NavLink>
          )}
        </nav>
        <div className={styles.right}>
          {currentUser && (
            <span className={styles.user} title={currentUser.email}>
              {currentUser.displayName}
            </span>
          )}
          <span className={styles.session} aria-live="polite">
            {formatExpiry(expiresAt)}
          </span>
          {/* Reset demo only makes sense against the local mock service.
              In Supabase mode it throws and would only confuse PMs. */}
          {isMockAuth && (
            <button
              className={styles.linkButton}
              onClick={async () => {
                const ok = await confirmDialog({
                  title: "Reset all data to the demo seed?",
                  confirmLabel: "Reset",
                  variant: "danger",
                });
                if (!ok) return;
                try {
                  service.resetToSeed();
                } catch (err) {
                  pushToast({
                    kind: "error",
                    message: `Couldn't reset: ${(err as Error).message}`,
                  });
                }
              }}
              title="Reset to demo data"
            >
              Reset demo
            </button>
          )}
          <button className={styles.signOut} onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <Link to="/legal/privacy" className={styles.footerLink}>
          Privacy
        </Link>
        <span aria-hidden="true">·</span>
        <Link to="/legal/terms" className={styles.footerLink}>
          Terms
        </Link>
        <span aria-hidden="true">·</span>
        <span className={styles.footerAttribution}>
          a Birdbrain Tools project
        </span>
      </footer>
    </div>
  );
};
